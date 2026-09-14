import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { whatsappConfigStatus } from '../config/env.js';
import { getSupabaseAdminClient } from '../config/supabase.js';
import { publishImage } from '../integrations/instagram/instagramClient.js';
import {
  sendPublicacaoTemplateMessage,
  sendTextMessage,
  WhatsAppReengagementRequiredError,
} from '../integrations/whatsapp/whatsappClient.js';
import { ConflictError, NotFoundError, ValidationError } from '../lib/errors.js';
import {
  CONTENT_TYPE_BY_FORMATO,
  EXTENSION_BY_FORMATO,
  detectVersaoArteFormato,
} from '../lib/fileSignature.js';
import { getActiveAgendamentoBySolicitacao } from '../repositories/agendamento.repository.js';
import { findClienteById } from '../repositories/atendimento.repository.js';
import { getConexaoAtiva } from '../repositories/clienteInstagram.repository.js';
import {
  claimAgendamentoParaPublicacao,
  getClienteIdDaSolicitacao,
  getPublicacaoBySolicitacao,
  getVersaoArteAtualDaSolicitacao,
  listAgendamentosVencidos,
  registerPublicacaoFalha,
  registerPublicacaoSucesso,
  setPublicacaoComprovante,
} from '../repositories/publicacao.repository.js';
import { getSolicitacaoDetail as getSolicitacaoDetailRepo } from '../repositories/solicitacao.repository.js';
import {
  createVersaoArteDownloadUrl,
  removeArquivoFromStorageBestEffort,
  uploadArquivoToStorage,
} from '../repositories/versaoArte.repository.js';

/** RF014: o Instagram Content Publishing API não aceita PDF — só imagens. */
const AUTO_PUBLISHABLE_FORMATS = new Set(['JPG', 'PNG']);

/** Mesmo prazo de URL assinada usado na Fase 8/9, com folga maior para a Meta buscar o arquivo. */
const DOWNLOAD_URL_EXPIRES_IN_SECONDS = 600;

export interface ProcessarAgendamentosResult {
  processados: number;
  publicadosAutomaticamente: number;
  falhas: number;
  pendentesParaManual: number;
}

/**
 * RF014/RN32-RN35: varre agendamentos vencidos e tenta publicação
 * automática via Instagram API oficial quando há credencial configurada e
 * o formato da arte é publicável (JPG/PNG). Uma falha da API NUNCA marca
 * como publicado — mantém a pendência para publicação manual (RF014
 * "falha automática... manter pendência/agendamento e alertar"). Chamada
 * pelo endpoint interno protegido (job/cron, seção 11), nunca por uma
 * rota autenticada de designer.
 */
export async function processarAgendamentosVencidos(): Promise<ProcessarAgendamentosResult> {
  const adminClient = getSupabaseAdminClient();
  const vencidos = await listAgendamentosVencidos(adminClient);

  let publicadosAutomaticamente = 0;
  let falhas = 0;
  let pendentesParaManual = 0;

  for (const agendamento of vencidos) {
    // Gate G: um erro inesperado em um agendamento não pode impedir o
    // processamento dos demais itens do lote.
    let resultado: 'publicado' | 'falha' | 'pendente';
    try {
      resultado = await processarUmAgendamento(adminClient, agendamento);
    } catch (error) {
      console.error('[designhub:publicacao] erro inesperado ao processar agendamento vencido', {
        idAgendamento: agendamento.idAgendamento,
        message: error instanceof Error ? error.message.slice(0, 200) : 'erro desconhecido',
      });
      resultado = 'falha';
    }
    if (resultado === 'publicado') publicadosAutomaticamente++;
    if (resultado === 'falha') falhas++;
    if (resultado === 'falha' || resultado === 'pendente') pendentesParaManual++;
  }

  return { processados: vencidos.length, publicadosAutomaticamente, falhas, pendentesParaManual };
}

/**
 * Item 9.2/9.4 (revisão — aviso "arte publicada"): WhatsApp só depois da
 * publicação já confirmada (chamado sempre DEPOIS de
 * `registerPublicacaoSucesso` já ter retornado sem erro) — uma falha aqui
 * nunca desfaz nem reprocessa a publicação (melhor esforço, mesmo padrão de
 * `sendTextMessageBestEffort` do atendimento). Idempotente por construção:
 * `register_publicacao_sucesso` só é executada com sucesso uma vez por
 * agendamento (trava de status) e `registrarPublicacaoManual` rejeita
 * reprocessar uma solicitação que não está mais `Agendado`
 * (`ConflictError`) — então este envio também só dispara uma vez por
 * publicação. Mensagem identifica a arte por tema/versão e inclui o
 * permalink quando disponível, nunca ID técnico.
 *
 * A WhatsApp Cloud API só aceita texto livre dentro da janela de 24h desde a
 * última mensagem do cliente; fora dela, exige um template aprovado
 * (item 8). Tentamos texto primeiro (cobre o caso comum de janela aberta);
 * se a Meta rejeitar especificamente por isso, caímos para um template
 * dedicado quando aprovado/configurado, ou marcamos o canal como
 * `BLOCKED_EXTERNAL_WHATSAPP_PUBLICACAO` sem nunca inventar um template não
 * aprovado nem afetar o registro da publicação.
 */
async function notificarClientePublicacaoBestEffort(
  adminClient: SupabaseClient,
  idSolicitacao: number,
): Promise<void> {
  try {
    const solicitacao = await getSolicitacaoDetailRepo(adminClient, idSolicitacao);
    if (!solicitacao) return;

    const cliente = await findClienteById(adminClient, solicitacao.idCliente);
    if (!cliente) return;

    const versao = await getVersaoArteAtualDaSolicitacao(adminClient, idSolicitacao);
    const versaoLabel = versao ? ` (versão ${versao.numeroVersao})` : '';
    const artLabel = solicitacao.tema ? `a arte "${solicitacao.tema}"${versaoLabel}` : `sua arte${versaoLabel}`;

    const publicacao = await getPublicacaoBySolicitacao(adminClient, idSolicitacao);
    const permalinkLine = publicacao?.permalink ? `\n\nVeja aqui: ${publicacao.permalink}` : '';
    const message = `ARTE PUBLICADA! Boas notícias: ${artLabel} já está no ar.${permalinkLine}`;

    try {
      await sendTextMessage(cliente.whatsapp, message);
    } catch (sendError) {
      if (!(sendError instanceof WhatsAppReengagementRequiredError)) throw sendError;

      if (!whatsappConfigStatus.hasPublicacaoTemplateConfigured) {
        console.warn(
          '[designhub:publicacao] BLOCKED_EXTERNAL_WHATSAPP_PUBLICACAO: janela de 24h fechada e nenhum template aprovado configurado (WHATSAPP_TEMPLATE_NAME_PUBLICACAO) — publicação permanece válida, aviso não enviado',
          { idSolicitacao },
        );
        return;
      }
      await sendPublicacaoTemplateMessage(cliente.whatsapp, [artLabel]);
    }
  } catch (error) {
    console.error('[designhub:publicacao] falha ao notificar cliente via WhatsApp (publicação)', {
      idSolicitacao,
      message: error instanceof Error ? error.message.slice(0, 200) : 'erro desconhecido',
    });
  }
}

async function processarUmAgendamento(
  adminClient: SupabaseClient,
  agendamento: { idAgendamento: number; idSolicitacao: number; legenda: string | null },
): Promise<'publicado' | 'falha' | 'pendente'> {
  const versao = await getVersaoArteAtualDaSolicitacao(adminClient, agendamento.idSolicitacao);
  if (!versao) return 'pendente'; // defensivo — não deveria ocorrer dado o invariante de status

  if (!AUTO_PUBLISHABLE_FORMATS.has(versao.formato)) return 'pendente'; // ex.: PDF — fica para publicação manual

  // RF014/RN29/ADR 0005: elegibilidade automática depende do CLIENTE dono da
  // solicitação ter autorizado a própria conta Instagram — nunca de uma
  // credencial global. Sem conexão válida (ou expirada), cai para manual;
  // nunca tenta publicar na conta de outro cliente.
  const idCliente = await getClienteIdDaSolicitacao(adminClient, agendamento.idSolicitacao);
  const conexao = idCliente ? await getConexaoAtiva(adminClient, idCliente) : null;
  if (!conexao) return 'pendente';

  // RF014/RN29/Gate G: reserva o agendamento ANTES de chamar a Instagram API.
  // Se outra execução do job já reservou (execuções sobrepostas), não
  // publica de novo — evita post duplicado real no Instagram.
  const reservado = await claimAgendamentoParaPublicacao(adminClient, agendamento.idAgendamento);
  if (!reservado) return 'pendente';

  try {
    const imageUrl = await createVersaoArteDownloadUrl(
      adminClient,
      versao.arquivoUrl,
      DOWNLOAD_URL_EXPIRES_IN_SECONDS,
      false,
    );
    const publishResult = await publishImage(
      { accessToken: conexao.accessToken, accountId: conexao.instagramUserId },
      imageUrl,
      agendamento.legenda ?? '',
    );
    await registerPublicacaoSucesso(adminClient, {
      idAgendamento: agendamento.idAgendamento,
      tipo: 'automatica',
      atorId: null,
      permalink: publishResult.permalink,
    });
    await notificarClientePublicacaoBestEffort(adminClient, agendamento.idSolicitacao);
    return 'publicado';
  } catch (error) {
    console.error('[designhub:publicacao] falha na publicação automática', {
      idAgendamento: agendamento.idAgendamento,
      message: error instanceof Error ? error.message.slice(0, 200) : 'erro desconhecido',
    });
    await registerPublicacaoFalha(adminClient, { idAgendamento: agendamento.idAgendamento });
    return 'falha';
  }
}

/** RF014: fallback manual — o designer publicou fora do sistema e registra o resultado. */
export async function registrarPublicacaoManual(
  userClient: SupabaseClient,
  idSolicitacao: number,
  callerId: string,
): Promise<void> {
  const solicitacao = await getSolicitacaoDetailRepo(userClient, idSolicitacao);
  if (!solicitacao || solicitacao.idDesigner !== callerId) {
    throw new NotFoundError('Solicitação não encontrada.');
  }
  if (solicitacao.status !== 'Agendado') {
    throw new ConflictError(
      `Solicitação não está aguardando publicação (status atual: ${solicitacao.status}).`,
    );
  }

  const agendamento = await getActiveAgendamentoBySolicitacao(userClient, idSolicitacao);
  if (!agendamento || agendamento.idDesigner !== callerId) {
    throw new NotFoundError('Agendamento não encontrado.');
  }

  const adminClient = getSupabaseAdminClient();
  await registerPublicacaoSucesso(adminClient, {
    idAgendamento: agendamento.idAgendamento,
    tipo: 'manual',
    atorId: callerId,
  });

  await notificarClientePublicacaoBestEffort(adminClient, idSolicitacao);
}

const COMPROVANTE_MAX_BYTES = 15 * 1024 * 1024;

/**
 * Item 9.3 (correções 13/09/2026): comprovante/print opcional da publicação
 * — sempre depois de já estar "Publicado" (não é pré-condição de nada);
 * mesmo bucket privado e mesma validação de formato real (bytes) do
 * upload de versão (RF007/seção 12.2), nunca confiando no Content-Type
 * declarado.
 */
export async function uploadComprovantePublicacao(
  userClient: SupabaseClient,
  idSolicitacao: number,
  callerId: string,
  buffer: Buffer,
): Promise<void> {
  if (buffer.byteLength > COMPROVANTE_MAX_BYTES) {
    throw new ValidationError('Arquivo excede o tamanho máximo permitido (15 MB).');
  }

  const solicitacao = await getSolicitacaoDetailRepo(userClient, idSolicitacao);
  if (!solicitacao || solicitacao.idDesigner !== callerId) {
    throw new NotFoundError('Solicitação não encontrada.');
  }
  if (solicitacao.status !== 'Publicado') {
    throw new ConflictError(
      `Solicitação ainda não foi publicada (status atual: ${solicitacao.status}).`,
    );
  }

  const formato = detectVersaoArteFormato(buffer);
  if (!formato) {
    throw new ValidationError('Formato não suportado. Envie PDF, JPG ou PNG.');
  }

  const adminClient = getSupabaseAdminClient();
  const publicacao = await getPublicacaoBySolicitacao(adminClient, idSolicitacao);
  if (!publicacao) throw new NotFoundError('Publicação não encontrada.');

  const path = `solicitacoes/${idSolicitacao}/publicacao/${randomUUID()}.${EXTENSION_BY_FORMATO[formato]}`;
  await uploadArquivoToStorage(adminClient, path, buffer, CONTENT_TYPE_BY_FORMATO[formato]);

  try {
    await setPublicacaoComprovante(adminClient, publicacao.idPublicacao, path);
  } catch (error) {
    await removeArquivoFromStorageBestEffort(adminClient, path);
    throw error;
  }
}

export interface PublicacaoDetalhe {
  dataPublicada: string;
  tipo: 'automatica' | 'manual';
  permalink: string | null;
  numeroVersao: number | null;
  temComprovante: boolean;
}

/** RF014/item 9.1: dados para o badge "Publicado" (RF005 "detalhes com... status"). */
export async function getPublicacaoDetalhe(
  userClient: SupabaseClient,
  idSolicitacao: number,
): Promise<PublicacaoDetalhe | null> {
  const publicacao = await getPublicacaoBySolicitacao(userClient, idSolicitacao);
  if (!publicacao) return null;
  return {
    dataPublicada: publicacao.dataPublicada,
    tipo: publicacao.tipo,
    permalink: publicacao.permalink,
    numeroVersao: publicacao.numeroVersao,
    temComprovante: publicacao.comprovanteUrl !== null,
  };
}

export interface ComprovanteDownloadUrl {
  url: string;
  expiresInSeconds: number;
}

/** Item 9.3: URL assinada de curta duração — designer dono ou admin (allowAnyDesigner), mesmo padrão de RF008. */
export async function getComprovanteDownloadUrl(
  userClient: SupabaseClient,
  idSolicitacao: number,
  callerId: string,
  options?: { allowAnyDesigner?: boolean },
): Promise<ComprovanteDownloadUrl> {
  const solicitacao = await getSolicitacaoDetailRepo(userClient, idSolicitacao);
  if (!solicitacao || (!options?.allowAnyDesigner && solicitacao.idDesigner !== callerId)) {
    throw new NotFoundError('Solicitação não encontrada.');
  }

  const publicacao = await getPublicacaoBySolicitacao(userClient, idSolicitacao);
  if (!publicacao || !publicacao.comprovanteUrl) {
    throw new NotFoundError('Comprovante não encontrado.');
  }

  const adminClient = getSupabaseAdminClient();
  const url = await createVersaoArteDownloadUrl(adminClient, publicacao.comprovanteUrl, DOWNLOAD_URL_EXPIRES_IN_SECONDS, false);
  return { url, expiresInSeconds: DOWNLOAD_URL_EXPIRES_IN_SECONDS };
}
