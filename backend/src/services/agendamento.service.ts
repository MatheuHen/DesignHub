import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseAdminClient } from '../config/supabase.js';
import { ConflictError, NotFoundError } from '../lib/errors.js';
import {
  cancelAgendamentoRpc,
  createAgendamentoRpc,
  getActiveAgendamentoBySolicitacao,
  listAgendamentos as listAgendamentosRepo,
  updateAgendamentoRpc,
  type AgendamentoSummary,
} from '../repositories/agendamento.repository.js';
import { getSolicitacaoDetail as getSolicitacaoDetailRepo } from '../repositories/solicitacao.repository.js';
import type { AgendamentoBody, ListAgendamentosQuery } from '../schemas/agendamento.schemas.js';

/** RF012: listagem com filtros, escopada ao próprio designer (RLS + RN44). */
export async function listAgendamentos(
  userClient: SupabaseClient,
  query: ListAgendamentosQuery,
): Promise<{ items: AgendamentoSummary[]; total: number; page: number; pageSize: number }> {
  const { items, total } = await listAgendamentosRepo(userClient, query);
  return { items, total, page: query.page, pageSize: query.pageSize };
}

/** RF012/RN27/RN30: só é possível agendar solicitação com status "Aprovado". */
export async function createAgendamento(
  userClient: SupabaseClient,
  idSolicitacao: number,
  callerId: string,
  body: AgendamentoBody,
): Promise<{ idAgendamento: number }> {
  const solicitacao = await getSolicitacaoDetailRepo(userClient, idSolicitacao);
  if (!solicitacao || solicitacao.idDesigner !== callerId) {
    throw new NotFoundError('Solicitação não encontrada.');
  }
  if (solicitacao.status !== 'Aprovado') {
    throw new ConflictError(
      `Solicitação não está aprovada (status atual: ${solicitacao.status}). Só é possível agendar publicação para arte aprovada (RN30).`,
    );
  }

  const adminClient = getSupabaseAdminClient();
  return createAgendamentoRpc(adminClient, { idSolicitacao, idDesigner: callerId, body });
}

/** RF012: edição do agendamento ativo da solicitação, só enquanto ele ainda está ativo. */
export async function updateAgendamento(
  userClient: SupabaseClient,
  idSolicitacao: number,
  callerId: string,
  body: AgendamentoBody,
): Promise<void> {
  const agendamento = await getActiveAgendamentoBySolicitacao(userClient, idSolicitacao);
  if (!agendamento || agendamento.idDesigner !== callerId) {
    throw new NotFoundError('Agendamento não encontrado.');
  }

  const adminClient = getSupabaseAdminClient();
  await updateAgendamentoRpc(adminClient, {
    idAgendamento: agendamento.idAgendamento,
    idDesigner: callerId,
    body,
  });
}

/** RF013/RN31: cancela o agendamento ativo da solicitação, só se faltarem >= 3h para o horário planejado. */
export async function cancelAgendamento(
  userClient: SupabaseClient,
  idSolicitacao: number,
  callerId: string,
): Promise<void> {
  const agendamento = await getActiveAgendamentoBySolicitacao(userClient, idSolicitacao);
  if (!agendamento || agendamento.idDesigner !== callerId) {
    throw new NotFoundError('Agendamento não encontrado.');
  }

  const adminClient = getSupabaseAdminClient();
  await cancelAgendamentoRpc(adminClient, { idAgendamento: agendamento.idAgendamento, idDesigner: callerId });
}
