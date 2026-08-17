import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseAdminClient } from '../config/supabase.js';
import { instagramConfigStatus } from '../config/env.js';
import { publishImage } from '../integrations/instagram/instagramClient.js';
import { ConflictError, NotFoundError } from '../lib/errors.js';
import { getActiveAgendamentoBySolicitacao } from '../repositories/agendamento.repository.js';
import {
  claimAgendamentoParaPublicacao,
  getVersaoArteAtualDaSolicitacao,
  listAgendamentosVencidos,
  registerPublicacaoFalha,
  registerPublicacaoSucesso,
} from '../repositories/publicacao.repository.js';
import { getSolicitacaoDetail as getSolicitacaoDetailRepo } from '../repositories/solicitacao.repository.js';
import { createVersaoArteDownloadUrl } from '../repositories/versaoArte.repository.js';

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

async function processarUmAgendamento(
  adminClient: SupabaseClient,
  agendamento: { idAgendamento: number; idSolicitacao: number; legenda: string | null },
): Promise<'publicado' | 'falha' | 'pendente'> {
  const versao = await getVersaoArteAtualDaSolicitacao(adminClient, agendamento.idSolicitacao);
  if (!versao) return 'pendente'; // defensivo — não deveria ocorrer dado o invariante de status

  const elegivel = instagramConfigStatus.hasPublishingClient && AUTO_PUBLISHABLE_FORMATS.has(versao.formato);
  if (!elegivel) return 'pendente'; // sem credencial ou formato não suportado (ex.: PDF) — fica para publicação manual

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
    await publishImage(imageUrl, agendamento.legenda ?? '');
    await registerPublicacaoSucesso(adminClient, {
      idAgendamento: agendamento.idAgendamento,
      tipo: 'automatica',
      atorId: null,
    });
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
}
