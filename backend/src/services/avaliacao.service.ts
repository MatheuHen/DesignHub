import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseAdminClient } from '../config/supabase.js';
import { env, whatsappConfigStatus } from '../config/env.js';
import {
  sendAlertaDesignerTemplateMessage,
  sendTextMessage,
  WhatsAppReengagementRequiredError,
} from '../integrations/whatsapp/whatsappClient.js';
import { ConflictError, ExpiredLinkError, NotFoundError, ValidationError } from '../lib/errors.js';
import {
  CONTENT_TYPE_BY_FORMATO,
  EXTENSION_BY_FORMATO,
  detectVersaoArteFormato,
} from '../lib/fileSignature.js';
import { generateOpaqueToken, hashOpaqueToken } from '../lib/tokens.js';
import {
  cancelAgendamentoCliente,
  createAgendamentoCliente,
  generateAvaliacaoLinkToken,
  getAvaliacaoLinkState,
  getTrackingAgendamento,
  getTrackingSolicitacaoByVersao,
  getVersaoArtePreview,
  listTrackingHistorico,
  listTrackingVersoes,
  submitAvaliacao,
  type AvaliacaoLinkState,
} from '../repositories/avaliacao.repository.js';
import { findClienteById } from '../repositories/atendimento.repository.js';
import { getDesignerById } from '../repositories/designer.repository.js';
import { getStatusConexao } from '../repositories/clienteInstagram.repository.js';
import {
  getSolicitacaoDetail as getSolicitacaoDetailRepo,
  listVersoesArte,
} from '../repositories/solicitacao.repository.js';
import {
  createVersaoArteDownloadUrl,
  removeArquivoFromStorageBestEffort,
  uploadArquivoToStorage,
} from '../repositories/versaoArte.repository.js';

/**
 * RF009: prazo técnico de validade do link — não é regra de negócio
 * documentada (nenhum RN define prazo de resposta da avaliação, diferente
 * de RN05 para o atendimento WhatsApp). Escolha de implementação com folga
 * generosa para não bloquear o cliente, ajustável sem impacto em RF/RN.
 */
const LINK_EXPIRES_IN_MS = 7 * 24 * 60 * 60 * 1000;

/** Mesmo prazo de URL assinada já usado na Fase 8 (seção 12.5). */
const DOWNLOAD_URL_EXPIRES_IN_SECONDS = 300;

export interface GerarLinkAvaliacaoResult {
  url: string;
  expiresAt: string;
  whatsappNotified: boolean;
  whatsappError?: string;
}

/**
 * RF009/RN19: gera um novo token de avaliação (revoga qualquer token
 * anterior não usado da mesma versão, via RPC) e tenta notificar o cliente
 * pelo WhatsApp Cloud API oficial. A falha de notificação nunca é mascarada
 * (`whatsappNotified: false` + `whatsappError`) — o link em si continua
 * válido e pode ser compartilhado manualmente pelo designer.
 */
export async function gerarLinkAvaliacao(
  userClient: SupabaseClient,
  idSolicitacao: number,
  callerId: string,
): Promise<GerarLinkAvaliacaoResult> {
  const solicitacao = await getSolicitacaoDetailRepo(userClient, idSolicitacao);
  if (!solicitacao || solicitacao.idDesigner !== callerId) {
    throw new NotFoundError('Solicitação não encontrada.');
  }
  if (solicitacao.status !== 'Enviado para avaliação') {
    throw new ConflictError('Solicitação não está aguardando avaliação no momento.');
  }

  const cliente = await findClienteById(userClient, solicitacao.idCliente);
  if (!cliente) {
    throw new NotFoundError('Cliente não encontrado.');
  }

  const adminClient = getSupabaseAdminClient();
  const { raw, hash } = generateOpaqueToken();
  const expiresAt = new Date(Date.now() + LINK_EXPIRES_IN_MS);

  await generateAvaliacaoLinkToken(adminClient, {
    idSolicitacao,
    idDesigner: callerId,
    tokenHash: hash,
    expiresAt,
  });

  const url = `${env.FRONTEND_URL}/avaliacao/${raw}`;

  // Item 3.4 (correções 13/09/2026): a mensagem identifica a arte pelo
  // tema/versão para o cliente reconhecer o contexto, sem expor nenhum ID
  // interno (id_solicitacao/id_versao nunca aparecem no texto).
  const versoes = await listVersoesArte(userClient, idSolicitacao);
  const ultimaVersao = versoes.at(-1)?.numero_versao;
  const message = solicitacao.tema
    ? `Olá! A arte "${solicitacao.tema}"${ultimaVersao ? ` (versão ${ultimaVersao})` : ''} está pronta para avaliação. Acesse o link para aprovar, pedir ajustes ou cancelar: ${url}`
    : `Olá! Sua arte está pronta para avaliação. Acesse o link para aprovar, pedir ajustes ou cancelar: ${url}`;

  let whatsappNotified = true;
  let whatsappError: string | undefined;
  try {
    await sendTextMessage(cliente.whatsapp, message);
  } catch (error) {
    whatsappNotified = false;
    // Nunca loga `message`/`url` (contêm o token bruto) — só o erro do SDK/HTTP, truncado.
    whatsappError = error instanceof Error ? error.message.slice(0, 200) : 'Erro desconhecido.';
    console.error('[designhub:avaliacao] falha ao notificar cliente via WhatsApp', {
      idSolicitacao,
      message: whatsappError,
    });
  }

  return {
    url,
    expiresAt: expiresAt.toISOString(),
    whatsappNotified,
    ...(whatsappError ? { whatsappError } : {}),
  };
}

export interface AvaliacaoTrackingVersao {
  numeroVersao: number;
  formato: string;
  dataEnvio: string;
  downloadUrl: string;
}

export interface AvaliacaoTrackingHistoricoEntry {
  acao: string;
  statusNovo: string | null;
  dataHora: string;
}

export interface AvaliacaoTrackingAgendamento {
  dataPublicacao: string;
  horario: string;
  status: string;
}

export interface AvaliacaoTracking {
  status: string;
  tema: string | null;
  versoes: AvaliacaoTrackingVersao[];
  historico: AvaliacaoTrackingHistoricoEntry[];
  agendamento: AvaliacaoTrackingAgendamento | null;
}

export interface AvaliacaoPreview {
  state: AvaliacaoLinkState;
  tema?: string | null;
  numeroVersao?: number;
  formato?: string;
  observacoes?: string | null;
  downloadUrl?: string;
  expiresInSeconds?: number;
  tracking?: AvaliacaoTracking;
  /**
   * Rodada correções (item 8/19): permite ao frontend oferecer "agendar
   * automaticamente" só quando fizer sentido — nunca vaza token/detalhe da
   * conexão, apenas um booleano (RNF010/seção 12.2).
   */
  clienteInstagramConectado?: boolean;
}

/**
 * RN13/RN14/RN18: visão somente-leitura do andamento da solicitação —
 * status, versões (com URL assinada de curta duração cada), histórico de
 * transições e agendamento, quando existirem. Escopada estritamente à
 * solicitação do próprio token (nunca a outras solicitações do mesmo
 * cliente): resolvida sempre a partir do `id_versao` do link, nunca de um
 * parâmetro aberto.
 */
async function buildAvaliacaoTracking(
  adminClient: SupabaseClient,
  idVersao: number,
): Promise<AvaliacaoTracking | null> {
  const solicitacao = await getTrackingSolicitacaoByVersao(adminClient, idVersao);
  if (!solicitacao) return null;

  const [versoesRaw, historico, agendamento] = await Promise.all([
    listTrackingVersoes(adminClient, solicitacao.idSolicitacao),
    listTrackingHistorico(adminClient, solicitacao.idSolicitacao),
    getTrackingAgendamento(adminClient, solicitacao.idSolicitacao),
  ]);

  const versoes = await Promise.all(
    versoesRaw.map(async (versao) => ({
      numeroVersao: versao.numeroVersao,
      formato: versao.formato,
      dataEnvio: versao.dataEnvio,
      downloadUrl: await createVersaoArteDownloadUrl(
        adminClient,
        versao.arquivoUrl,
        DOWNLOAD_URL_EXPIRES_IN_SECONDS,
        false,
      ),
    })),
  );

  return {
    status: solicitacao.status,
    tema: solicitacao.tema,
    versoes,
    historico,
    agendamento,
  };
}

/**
 * RF009 ("visualiza a arte... como foco principal"): leitura pública
 * (sem autenticação — a prova de acesso é o próprio token). Nunca inclui
 * dado pessoal de cliente/designer, só o necessário para decidir.
 */
export async function getAvaliacaoPreview(rawToken: string): Promise<AvaliacaoPreview> {
  const adminClient = getSupabaseAdminClient();
  const hash = hashOpaqueToken(rawToken);
  const linkState = await getAvaliacaoLinkState(adminClient, hash);

  if (linkState.state === 'used' && linkState.idVersao !== null) {
    const tracking = await buildAvaliacaoTracking(adminClient, linkState.idVersao);
    return tracking ? { state: 'used', tracking } : { state: 'used' };
  }

  if (linkState.state !== 'valid' || linkState.idVersao === null) {
    return { state: linkState.state };
  }

  const versao = await getVersaoArtePreview(adminClient, linkState.idVersao);
  if (!versao) {
    return { state: 'invalid' };
  }

  const downloadUrl = await createVersaoArteDownloadUrl(
    adminClient,
    versao.arquivoUrl,
    DOWNLOAD_URL_EXPIRES_IN_SECONDS,
    false,
  );

  const instagramStatus = await getStatusConexao(adminClient, versao.idCliente);

  return {
    state: 'valid',
    tema: versao.tema,
    numeroVersao: versao.numeroVersao,
    formato: versao.formato,
    observacoes: versao.observacoes,
    downloadUrl,
    expiresInSeconds: DOWNLOAD_URL_EXPIRES_IN_SECONDS,
    clienteInstagramConectado: instagramStatus.conectado,
  };
}

export interface SubmitAvaliacaoInput {
  decisao: 'Aprovado' | 'Ajustes' | 'Cancelado';
  descricao: string | undefined;
  observacoes: string | undefined;
  referenciaBuffer: Buffer | undefined;
  opcaoPublicacao?: 'automatico' | 'designer_manual' | 'proprio_cliente' | undefined;
  dataDesejada?: string | undefined;
  horarioDesejado?: string | undefined;
  legendaDesejada?: string | undefined;
}

export interface SubmitAvaliacaoOutcome {
  idSolicitacao: number;
  statusNovo: string;
  /**
   * Rodada correções (item 7/8): só presente quando `opcaoPublicacao ===
   * 'automatico'`. `true` quando o agendamento real foi criado na hora
   * (status já virou Agendado); `false` no caso raro em que o Instagram do
   * cliente deixou de estar conectado entre o carregamento da tela e o
   * envio (aprovação continua válida, só o agendamento automático não
   * aconteceu — o designer precisa agendar manualmente).
   */
  agendamentoAutomaticoCriado?: boolean;
}

/**
 * RF009/RF010/RN20/RN21/RN24: registra a decisão do cliente. Se houver
 * referência de ajuste, o arquivo é validado (formato real) e enviado ao
 * Storage ANTES da RPC atômica; se a RPC falhar, o objeto é removido
 * (compensação, mesmo padrão da Fase 8).
 */
export async function submitAvaliacaoDecisao(
  rawToken: string,
  input: SubmitAvaliacaoInput,
): Promise<SubmitAvaliacaoOutcome> {
  const adminClient = getSupabaseAdminClient();
  const hash = hashOpaqueToken(rawToken);

  const linkState = await getAvaliacaoLinkState(adminClient, hash);
  if (linkState.state === 'used') throw new ConflictError('Link de avaliação já utilizado.');
  if (linkState.state === 'expired') throw new ExpiredLinkError('Link de avaliação expirado.');
  if (linkState.state !== 'valid' || linkState.idVersao === null) {
    throw new NotFoundError('Link de avaliação inválido.');
  }

  let imagemReferenciaPath: string | undefined;
  if (input.referenciaBuffer) {
    const versao = await getVersaoArtePreview(adminClient, linkState.idVersao);
    if (!versao) throw new NotFoundError('Link de avaliação inválido.');

    const formato = detectVersaoArteFormato(input.referenciaBuffer);
    if (!formato) {
      throw new ValidationError('Formato não suportado. Envie PDF, JPG ou PNG.');
    }

    imagemReferenciaPath = `solicitacoes/${versao.idSolicitacao}/referencias/${randomUUID()}.${EXTENSION_BY_FORMATO[formato]}`;
    await uploadArquivoToStorage(
      adminClient,
      imagemReferenciaPath,
      input.referenciaBuffer,
      CONTENT_TYPE_BY_FORMATO[formato],
    );
  }

  const opcaoPublicacao = input.decisao === 'Aprovado' ? input.opcaoPublicacao : undefined;
  const desejaAgendamento = opcaoPublicacao === 'automatico' || opcaoPublicacao === 'designer_manual';

  let result: { idSolicitacao: number; statusNovo: string; numeroVersao: number };
  try {
    result = await submitAvaliacao(adminClient, {
      tokenHash: hash,
      decisao: input.decisao,
      descricaoAjuste: input.descricao,
      observacoesAjuste: input.observacoes,
      imagemReferenciaPath,
      desejaAgendamento,
      dataDesejada: input.dataDesejada,
      horarioDesejado: input.horarioDesejado,
      opcaoPublicacao,
      legendaDesejada: input.legendaDesejada,
    });
  } catch (error) {
    if (imagemReferenciaPath) {
      await removeArquivoFromStorageBestEffort(adminClient, imagemReferenciaPath);
    }
    throw error;
  }

  // A partir daqui a decisão já está confirmada e persistida — nada abaixo
  // pode desfazê-la; qualquer falha vira melhor-esforço (log), nunca erro
  // de resposta ao cliente que já aprovou/ajustou/cancelou com sucesso.
  if (opcaoPublicacao === 'automatico') {
    const agendamentoAutomaticoCriado = await tentarAgendamentoAutomaticoBestEffort(adminClient, {
      idSolicitacao: result.idSolicitacao,
      idVersao: linkState.idVersao,
      dataPublicacao: input.dataDesejada!,
      horario: input.horarioDesejado!,
      legenda: input.legendaDesejada ?? null,
    });
    return {
      idSolicitacao: result.idSolicitacao,
      statusNovo: agendamentoAutomaticoCriado ? 'Agendado' : result.statusNovo,
      agendamentoAutomaticoCriado,
    };
  }

  if (opcaoPublicacao === 'designer_manual' || opcaoPublicacao === 'proprio_cliente') {
    await notificarDesignerPosAprovacaoBestEffort(adminClient, result.idSolicitacao, opcaoPublicacao);
  }

  return { idSolicitacao: result.idSolicitacao, statusNovo: result.statusNovo };
}

/**
 * Item 7/8 (opção 1 "agendar automaticamente"): reconfere a conexão do
 * Instagram do cliente na hora (defesa em profundidade — o frontend já só
 * oferece esta opção quando conectado, mas nunca confia só nisso) e cria o
 * agendamento real. Nunca falha a requisição: a aprovação já foi
 * confirmada acima; no pior caso (Instagram desconectado entre a tela
 * carregar e o envio, ou qualquer outra falha), a solicitação permanece
 * "Aprovado" — igual ao caminho "designer agenda manualmente" — e o
 * chamador recebe `false` para explicar isso ao cliente.
 */
async function tentarAgendamentoAutomaticoBestEffort(
  adminClient: SupabaseClient,
  params: { idSolicitacao: number; idVersao: number; dataPublicacao: string; horario: string; legenda: string | null },
): Promise<boolean> {
  try {
    const versao = await getVersaoArtePreview(adminClient, params.idVersao);
    if (!versao) return false;

    const instagramStatus = await getStatusConexao(adminClient, versao.idCliente);
    if (!instagramStatus.conectado) {
      console.warn('[designhub:avaliacao] agendamento automático não criado: Instagram do cliente não conectado', {
        idSolicitacao: params.idSolicitacao,
      });
      return false;
    }

    await createAgendamentoCliente(adminClient, {
      idSolicitacao: params.idSolicitacao,
      dataPublicacao: params.dataPublicacao,
      horario: params.horario,
      legenda: params.legenda,
    });
    return true;
  } catch (error) {
    console.error('[designhub:avaliacao] falha ao criar agendamento automático (aprovação permanece válida)', {
      idSolicitacao: params.idSolicitacao,
      message: error instanceof Error ? error.message.slice(0, 200) : 'erro desconhecido',
    });
    return false;
  }
}

/**
 * Item 8 (opções 2/3): avisa o designer por WhatsApp que o cliente aprovou
 * e escolheu "designer agendar manualmente" ou "eu mesmo vou publicar" —
 * melhor esforço, mesmo padrão texto→BLOCKED_EXTERNAL já usado no
 * cancelamento (item 8.6). O canal confiável é sempre o histórico da
 * solicitação (gravado pela RPC `submit_avaliacao`) e a própria tela de
 * detalhe, que qualquer designer autenticado sempre pode consultar.
 */
async function notificarDesignerPosAprovacaoBestEffort(
  adminClient: SupabaseClient,
  idSolicitacao: number,
  opcaoPublicacao: 'designer_manual' | 'proprio_cliente',
): Promise<void> {
  try {
    const solicitacao = await getSolicitacaoDetailRepo(adminClient, idSolicitacao);
    if (!solicitacao) return;

    const designer = await getDesignerById(adminClient, solicitacao.idDesigner);
    if (!designer?.whatsapp) return;

    const message =
      opcaoPublicacao === 'designer_manual'
        ? `O cliente ${solicitacao.clienteNome} aprovou a arte "${solicitacao.tema}" e prefere que você agende a publicação. Confira a preferência de data/horário no DesignHub.`
        : `O cliente ${solicitacao.clienteNome} aprovou a arte "${solicitacao.tema}" e informou que vai publicar por conta própria. Registre a publicação manual no DesignHub quando ela ocorrer.`;

    await sendTextMessage(designer.whatsapp, message);
  } catch (error) {
    if (error instanceof WhatsAppReengagementRequiredError) {
      console.warn(
        '[designhub:avaliacao] BLOCKED_EXTERNAL_WHATSAPP_POS_APROVACAO: janela de 24h fechada — alerta in-app (histórico da solicitação) permanece registrado',
        { idSolicitacao },
      );
      return;
    }
    console.error('[designhub:avaliacao] falha ao alertar designer via WhatsApp (pós-aprovação)', {
      idSolicitacao,
      message: error instanceof Error ? error.message.slice(0, 200) : 'erro desconhecido',
    });
  }
}

/**
 * RF012/RF013/item 8.4 (correções 13/09/2026): cliente cancela o
 * agendamento da própria solicitação pelo mesmo link de acompanhamento
 * (RN13/RN14) usado após a avaliação — o token já pode estar "usado" (a
 * decisão de aprovar já foi tomada antes de existir agendamento), então
 * aqui aceitamos `valid` e `used`, rejeitando apenas `invalid`/`expired`.
 * `idSolicitacao` é sempre resolvido a partir do próprio token, nunca
 * recebido do cliente (seção 12.1 — impede IDOR).
 */
/**
 * Item 8.6: alerta ao designer quando o cliente cancela o próprio
 * agendamento — canal in-app (histórico da solicitação, já gravado pela RPC
 * `cancel_agendamento_cliente`) sempre funciona; o WhatsApp é melhor esforço
 * e nunca desfaz o cancelamento já confirmado. Mesmo padrão de
 * `sendTextMessage` → `WhatsAppReengagementRequiredError` →
 * template dedicado (quando aprovado/configurado) → `BLOCKED_EXTERNAL`
 * usado no aviso de publicação (item 9.2/9.4).
 */
async function notificarDesignerCancelamentoBestEffort(
  adminClient: SupabaseClient,
  idSolicitacao: number,
): Promise<void> {
  try {
    const solicitacao = await getSolicitacaoDetailRepo(adminClient, idSolicitacao);
    if (!solicitacao) return;

    const designer = await getDesignerById(adminClient, solicitacao.idDesigner);
    if (!designer?.whatsapp) return;

    const message = `AVISO: o cliente ${solicitacao.clienteNome} cancelou o agendamento de publicação da arte "${solicitacao.tema}". Consulte a solicitação no DesignHub.`;

    try {
      await sendTextMessage(designer.whatsapp, message);
    } catch (sendError) {
      if (!(sendError instanceof WhatsAppReengagementRequiredError)) throw sendError;

      if (!whatsappConfigStatus.hasAlertaDesignerTemplateConfigured) {
        console.warn(
          '[designhub:avaliacao] BLOCKED_EXTERNAL_WHATSAPP_ALERTA_DESIGNER: janela de 24h fechada e nenhum template aprovado configurado (WHATSAPP_TEMPLATE_NAME_ALERTA_DESIGNER) — alerta in-app permanece registrado',
          { idSolicitacao },
        );
        return;
      }
      await sendAlertaDesignerTemplateMessage(designer.whatsapp, [solicitacao.clienteNome, solicitacao.tema ?? '']);
    }
  } catch (error) {
    console.error('[designhub:avaliacao] falha ao alertar designer via WhatsApp (cancelamento de agendamento)', {
      idSolicitacao,
      message: error instanceof Error ? error.message.slice(0, 200) : 'erro desconhecido',
    });
  }
}

export async function cancelarAgendamentoCliente(rawToken: string): Promise<{ idSolicitacao: number }> {
  const adminClient = getSupabaseAdminClient();
  const hash = hashOpaqueToken(rawToken);

  const linkState = await getAvaliacaoLinkState(adminClient, hash);
  if (linkState.state === 'expired') throw new ExpiredLinkError('Link de avaliação expirado.');
  if (linkState.state === 'invalid' || linkState.idVersao === null) {
    throw new NotFoundError('Link de avaliação inválido.');
  }

  const solicitacao = await getTrackingSolicitacaoByVersao(adminClient, linkState.idVersao);
  if (!solicitacao) throw new NotFoundError('Solicitação não encontrada.');
  if (solicitacao.status !== 'Agendado') {
    throw new ConflictError(
      `Não há agendamento ativo para cancelar (status atual: ${solicitacao.status}).`,
    );
  }

  await cancelAgendamentoCliente(adminClient, solicitacao.idSolicitacao);
  await notificarDesignerCancelamentoBestEffort(adminClient, solicitacao.idSolicitacao);
  return { idSolicitacao: solicitacao.idSolicitacao };
}
