import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseAdminClient } from '../config/supabase.js';
import { createVersaoArteDownloadUrl } from '../repositories/versaoArte.repository.js';
import { NotFoundError } from '../lib/errors.js';
import {
  getActiveAgendamentoSummary,
  type ActiveAgendamentoSummary,
} from '../repositories/agendamento.repository.js';
import {
  getAgendamentoPreferencia,
  getAjusteReferenciaPath,
  getReferenciaPathBySolicitacao,
  getSolicitacaoDetail as getSolicitacaoDetailRepo,
  listAjustesBySolicitacao,
  listHistoricoSolicitacao,
  listRespostasBySolicitacao,
  listSolicitacoes as listSolicitacoesRepo,
  listVersoesArte,
  updateSolicitacaoFields,
  type AgendamentoPreferencia,
  type AjusteEntry,
  type HistoricoEntry,
  type RespostaEntry,
  type SolicitacaoDetail,
  type VersaoArteEntry,
} from '../repositories/solicitacao.repository.js';
import { ATENDIMENTO_QUESTIONS } from './atendimentoQuestions.js';
import type { ListSolicitacoesQuery, UpdateSolicitacaoInput } from '../schemas/solicitacao.schemas.js';

const AJUSTE_REFERENCIA_URL_EXPIRES_IN_SECONDS = 300;
const REFERENCIA_PROMPT = ATENDIMENTO_QUESTIONS.find((q) => q.key === 'referencia')!.prompt;

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
  options?: { allowAnyDesigner?: boolean },
): Promise<{
  solicitacao: SolicitacaoDetail;
  historico: HistoricoEntry[];
  respostasAtendimento: RespostaEntry[];
  versoes: VersaoArteEntry[];
  ajustes: AjusteEntry[];
  agendamento: ActiveAgendamentoSummary | null;
  preferenciaAgendamento: AgendamentoPreferencia | null;
}> {
  const solicitacao = await getSolicitacaoDetailRepo(userClient, id);
  // RF016/QUADRO 61 ("Consultar"): o Administrador pode ler qualquer
  // solicitação (RLS `solicitacao_select_owner_or_admin` já autoriza via
  // `is_admin()` em todas as tabelas relacionadas) — só o Designer
  // continua restrito à própria solicitação (defesa em profundidade além
  // da RLS, seção 12.1 do CLAUDE.md).
  if (!solicitacao || (!options?.allowAnyDesigner && solicitacao.idDesigner !== callerId)) {
    throw new NotFoundError('Solicitação não encontrada.');
  }

  const [historico, respostasAtendimento, versoes, ajustes, agendamento, preferenciaAgendamento] =
    await Promise.all([
      listHistoricoSolicitacao(userClient, id),
      listRespostasBySolicitacao(userClient, id),
      listVersoesArte(userClient, id),
      listAjustesBySolicitacao(userClient, id),
      solicitacao.status === 'Agendado' ? getActiveAgendamentoSummary(userClient, id) : Promise.resolve(null),
      getAgendamentoPreferencia(userClient, id),
    ]);

  return { solicitacao, historico, respostasAtendimento, versoes, ajustes, agendamento, preferenciaAgendamento };
}

export interface AjusteReferenciaUrl {
  url: string;
  expiresInSeconds: number;
}

/** RF010 + seção 12.5: URL assinada de curta duração da referência do ajuste, só para o designer dono da solicitação. */
export async function getAjusteReferenciaUrl(
  userClient: SupabaseClient,
  idSolicitacao: number,
  idAjuste: number,
  callerId: string,
): Promise<AjusteReferenciaUrl> {
  const solicitacao = await getSolicitacaoDetailRepo(userClient, idSolicitacao);
  if (!solicitacao || solicitacao.idDesigner !== callerId) {
    throw new NotFoundError('Solicitação não encontrada.');
  }

  const path = await getAjusteReferenciaPath(userClient, idAjuste, idSolicitacao);
  if (!path) {
    throw new NotFoundError('Referência do ajuste não encontrada.');
  }

  const adminClient = getSupabaseAdminClient();
  const url = await createVersaoArteDownloadUrl(adminClient, path, AJUSTE_REFERENCIA_URL_EXPIRES_IN_SECONDS);
  return { url, expiresInSeconds: AJUSTE_REFERENCIA_URL_EXPIRES_IN_SECONDS };
}

/**
 * RF004/item 5 + seção 12.5: URL assinada de curta duração da imagem/arquivo
 * de referência que o cliente enviou pelo WhatsApp durante o atendimento
 * inicial — nunca expõe o path cru do Storage ao designer.
 */
export async function getAtendimentoReferenciaUrl(
  userClient: SupabaseClient,
  idSolicitacao: number,
  callerId: string,
): Promise<AjusteReferenciaUrl> {
  const solicitacao = await getSolicitacaoDetailRepo(userClient, idSolicitacao);
  if (!solicitacao || solicitacao.idDesigner !== callerId) {
    throw new NotFoundError('Solicitação não encontrada.');
  }

  const path = await getReferenciaPathBySolicitacao(userClient, idSolicitacao, REFERENCIA_PROMPT);
  if (!path) {
    throw new NotFoundError('Referência não encontrada.');
  }

  const adminClient = getSupabaseAdminClient();
  const url = await createVersaoArteDownloadUrl(adminClient, path, AJUSTE_REFERENCIA_URL_EXPIRES_IN_SECONDS);
  return { url, expiresInSeconds: AJUSTE_REFERENCIA_URL_EXPIRES_IN_SECONDS };
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
