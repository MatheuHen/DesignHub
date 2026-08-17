import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseAdminClient } from '../config/supabase.js';
import { NotFoundError } from '../lib/errors.js';
import {
  getActiveAgendamentoSummary,
  type ActiveAgendamentoSummary,
} from '../repositories/agendamento.repository.js';
import {
  getSolicitacaoDetail as getSolicitacaoDetailRepo,
  listHistoricoSolicitacao,
  listRespostasBySolicitacao,
  listSolicitacoes as listSolicitacoesRepo,
  listVersoesArte,
  updateSolicitacaoFields,
  type HistoricoEntry,
  type RespostaEntry,
  type SolicitacaoDetail,
  type VersaoArteEntry,
} from '../repositories/solicitacao.repository.js';
import type { ListSolicitacoesQuery, UpdateSolicitacaoInput } from '../schemas/solicitacao.schemas.js';

/** RF005/RN44: leitura via cliente escopado ao próprio designer (RLS garante ownership). */
export async function listSolicitacoes(
  userClient: SupabaseClient,
  query: ListSolicitacoesQuery,
): Promise<{
  items: Awaited<ReturnType<typeof listSolicitacoesRepo>>['items'];
  total: number;
  page: number;
  pageSize: number;
}> {
  const { items, total } = await listSolicitacoesRepo(userClient, query);
  return { items, total, page: query.page, pageSize: query.pageSize };
}

/**
 * RF005: detalhes com status, atendimento (RF004), versões (RF008) e histórico de transições.
 * `callerId` é sempre o `auth.uid()` do token da requisição (nunca um valor vindo do
 * cliente) e é comparado explicitamente ao dono real: defesa em profundidade além do
 * RLS (`solicitacao_select_owner_or_admin`), seção 12.1 do CLAUDE.md.
 */
export async function getSolicitacaoDetail(
  userClient: SupabaseClient,
  id: number,
  callerId: string,
): Promise<{
  solicitacao: SolicitacaoDetail;
  historico: HistoricoEntry[];
  respostasAtendimento: RespostaEntry[];
  versoes: VersaoArteEntry[];
  agendamento: ActiveAgendamentoSummary | null;
}> {
  const solicitacao = await getSolicitacaoDetailRepo(userClient, id);
  if (!solicitacao || solicitacao.idDesigner !== callerId) {
    throw new NotFoundError('Solicitação não encontrada.');
  }

  const [historico, respostasAtendimento, versoes, agendamento] = await Promise.all([
    listHistoricoSolicitacao(userClient, id),
    listRespostasBySolicitacao(userClient, id),
    listVersoesArte(userClient, id),
    solicitacao.status === 'Agendado' ? getActiveAgendamentoSummary(userClient, id) : Promise.resolve(null),
  ]);

  return { solicitacao, historico, respostasAtendimento, versoes, agendamento };
}

/**
 * RF005: edição dos campos descritivos (tema/cores/observações/descrição)
 * pelo próprio designer responsável — nunca altera `status` (controlado
 * exclusivamente pela máquina de estados, RF011/Fase 10).
 */
export async function updateSolicitacao(
  userClient: SupabaseClient,
  id: number,
  callerId: string,
  changes: UpdateSolicitacaoInput,
): Promise<void> {
  const owned = await getSolicitacaoDetailRepo(userClient, id);
  if (!owned || owned.idDesigner !== callerId) {
    throw new NotFoundError('Solicitação não encontrada.');
  }
  const adminClient = getSupabaseAdminClient();
  await updateSolicitacaoFields(adminClient, id, callerId, changes);
}
