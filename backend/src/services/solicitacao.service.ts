import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseAdminClient } from '../config/supabase.js';
import { createVersaoArteDownloadUrl } from '../repositories/versaoArte.repository.js';
import { ConflictError, NotFoundError } from '../lib/errors.js';
import {
  getActiveAgendamentoSummary,
  type ActiveAgendamentoSummary,
} from '../repositories/agendamento.repository.js';
import { findClienteById } from '../repositories/atendimento.repository.js';
import {
  cancelSolicitacaoDesignerRpc,
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
import { WhatsAppReengagementRequiredError, sendTextMessage } from '../integrations/whatsapp/whatsappClient.js';
import { ATENDIMENTO_QUESTIONS } from './atendimentoQuestions.js';
import type { ListSolicitacoesQuery, UpdateSolicitacaoInput } from '../schemas/solicitacao.schemas.js';

const CANCELAVEIS = new Set(['Em produção', 'Enviado para avaliação', 'Ajustes', 'Aprovado', 'Agendado']);

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

/**
 * RF010 + seção 12.5: URL assinada de curta duração da referência do ajuste,
 * só para o designer dono da solicitação. `inline=true` gera
 * `Content-Disposition: inline` (botão "Visualizar", abre em nova aba sem
 * forçar download); padrão continua `attachment` (botão "Baixar").
 */
export async function getAjusteReferenciaUrl(
  userClient: SupabaseClient,
  idSolicitacao: number,
  idAjuste: number,
  callerId: string,
  inline = false,
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
  const url = await createVersaoArteDownloadUrl(
    adminClient,
    path,
    AJUSTE_REFERENCIA_URL_EXPIRES_IN_SECONDS,
    !inline,
  );
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
  inline = false,
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
  const url = await createVersaoArteDownloadUrl(
    adminClient,
    path,
    AJUSTE_REFERENCIA_URL_EXPIRES_IN_SECONDS,
    !inline,
  );
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

/**
 * Item 12/30 (rodada correções): o designer responsável cancela a própria
 * solicitação em qualquer estado ativo — RPC atômica cancela também o
 * agendamento ativo, se houver. Idempotente contra duplo clique: a segunda
 * chamada encontra `status = 'Cancelado'` e é rejeitada pela própria RPC
 * (`ConflictError`, tratado como "não suportado" pelo cliente).
 */
export async function cancelSolicitacao(
  userClient: SupabaseClient,
  id: number,
  callerId: string,
): Promise<void> {
  const owned = await getSolicitacaoDetailRepo(userClient, id);
  if (!owned || owned.idDesigner !== callerId) {
    throw new NotFoundError('Solicitação não encontrada.');
  }
  if (!CANCELAVEIS.has(owned.status)) {
    throw new ConflictError(`Solicitação não pode mais ser cancelada (status atual: ${owned.status}).`);
  }

  const adminClient = getSupabaseAdminClient();
  await cancelSolicitacaoDesignerRpc(adminClient, { idSolicitacao: id, idDesigner: callerId });
  await notificarClienteCancelamentoDesignerBestEffort(adminClient, owned);
}

/**
 * Melhor esforço — a solicitação já foi cancelada com sucesso acima; uma
 * falha aqui nunca desfaz o cancelamento nem quebra a resposta ao designer,
 * mesmo padrão já usado no restante da rodada (ex.: aviso pós-aprovação).
 */
async function notificarClienteCancelamentoDesignerBestEffort(
  adminClient: SupabaseClient,
  solicitacao: SolicitacaoDetail,
): Promise<void> {
  try {
    const cliente = await findClienteById(adminClient, solicitacao.idCliente);
    if (!cliente?.whatsapp) return;

    const versoes = await listVersoesArte(adminClient, solicitacao.id);
    const ultimaVersao = versoes.at(-1)?.numero_versao;
    const message = solicitacao.tema
      ? `Esta solicitação de arte foi cancelada pelo designer: "${solicitacao.tema}"${ultimaVersao ? ` (versão ${ultimaVersao})` : ''}.`
      : 'Esta solicitação de arte foi cancelada pelo designer.';

    await sendTextMessage(cliente.whatsapp, message);
  } catch (error) {
    if (error instanceof WhatsAppReengagementRequiredError) {
      // Sem template dedicado aprovado pela Meta para este aviso (fora do
      // escopo desta rodada criar um — depende de aprovação externa/humana):
      // BLOCKED_EXTERNAL explícito, nunca finge sucesso. O cancelamento em
      // si já está confirmado e não depende deste aviso.
      console.warn(
        '[designhub:solicitacao] BLOCKED_EXTERNAL_WHATSAPP_CANCELAMENTO_DESIGNER: janela de 24h fechada e nenhum template aprovado configurado para este aviso',
        { idSolicitacao: solicitacao.id },
      );
      return;
    }
    console.error('[designhub:solicitacao] falha ao avisar cliente via WhatsApp (cancelamento pelo designer)', {
      idSolicitacao: solicitacao.id,
      message: error instanceof Error ? error.message.slice(0, 200) : 'erro desconhecido',
    });
  }
}
