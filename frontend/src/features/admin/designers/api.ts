import { apiRequest } from '../../../lib/apiClient';
import type { ListSolicitacoesResult, SolicitacaoStatus } from '../../designer/solicitacoes/api';

/** Item 4 (rodada final): estratégias aprovadas para inativar um designer com pendências. */
export type EstrategiaInativacao = 'cancelar_pendentes' | 'reatribuir_pendentes' | 'inativar_mesmo_assim';

/** Item 4 (rodada final): solicitação em estado não terminal ainda vinculada ao designer. */
export interface PendenciaDesigner {
  idSolicitacao: number;
  clienteNome: string;
  tema: string | null;
  status: SolicitacaoStatus;
  /** Só considerada para 'Em produção' (RF006/RN11) — nunca inventa SLA para as demais etapas. */
  atrasada: boolean;
}

export interface SetDesignerStatusInput {
  status: 'ativo' | 'inativo';
  estrategia?: EstrategiaInativacao;
  reatribuicoes?: { idSolicitacao: number; novoDesignerId: string }[];
}

export interface Designer {
  id: string;
  nomeCompleto: string;
  email: string;
  status: 'ativo' | 'inativo';
  whatsapp: string | null;
  bloqueado: boolean;
  statusOperacional: string | null;
}

export interface ListDesignersResult {
  items: Designer[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ListDesignersParams {
  search?: string | undefined;
  status?: 'ativo' | 'inativo' | undefined;
  page?: number;
}

export interface CreateDesignerInput {
  nomeCompleto: string;
  email: string;
  whatsapp: string;
  /** RF001/FIGURA 28: o Administrador define a senha inicial do designer. */
  senha: string;
}

export interface UpdateDesignerInput {
  nomeCompleto?: string;
  whatsapp?: string;
}

/** RF001/RF015: lista/pesquisa designers por nome, e-mail e status. */
export function listDesigners(params: ListDesignersParams): Promise<ListDesignersResult> {
  const query = new URLSearchParams();
  if (params.search) query.set('search', params.search);
  if (params.status) query.set('status', params.status);
  query.set('page', String(params.page ?? 1));
  return apiRequest<ListDesignersResult>(`/api/designers?${query.toString()}`);
}

/** RF001: inclusão — o backend convida o designer por e-mail via Supabase Auth. */
export function createDesigner(input: CreateDesignerInput): Promise<Designer> {
  return apiRequest<Designer>('/api/designers', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

/** RF001: edição de dados cadastrais. */
export function updateDesigner(id: string, input: UpdateDesignerInput): Promise<void> {
  return apiRequest<void>(`/api/designers/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

/**
 * RF001/item 4 (rodada final): inativação/reativação. Inativar um designer
 * com solicitações pendentes sem `estrategia` é rejeitado pelo backend com
 * 409 `DESIGNER_PENDENCIAS` (corpo com a lista de pendências) — o backend é
 * a autoridade, esta função só repassa o que a UI decidir.
 */
export function setDesignerStatus(id: string, input: SetDesignerStatusInput): Promise<void> {
  return apiRequest<void>(`/api/designers/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

/** Item 4 (rodada final): pendências (estados não terminais) de um designer — usável a qualquer momento. */
export function getDesignerPendencias(id: string): Promise<{ items: PendenciaDesigner[] }> {
  return apiRequest<{ items: PendenciaDesigner[] }>(`/api/designers/${id}/pendencias`);
}

/** RF001/item 2.1: Admin define uma nova senha para o designer. */
export function updateDesignerPassword(
  id: string,
  novaSenha: string,
  confirmarSenha: string,
): Promise<void> {
  return apiRequest<void>(`/api/designers/${id}/senha`, {
    method: 'PATCH',
    body: JSON.stringify({ novaSenha, confirmarSenha }),
  });
}

/**
 * RF016/RN47/RN49: leitura admin-only de todas as solicitações (qualquer
 * designer) para localizar o que reatribuir — FIGURA 2/27 "Solicitações
 * atribuídas" do protótipo oficial.
 */
export function listSolicitacoesAdmin(params: {
  status?: SolicitacaoStatus | undefined;
  idDesigner?: string | undefined;
  clienteNome?: string | undefined;
  page?: number;
}): Promise<ListSolicitacoesResult> {
  const query = new URLSearchParams();
  if (params.status) query.set('status', params.status);
  if (params.idDesigner) query.set('idDesigner', params.idDesigner);
  if (params.clienteNome) query.set('clienteNome', params.clienteNome);
  query.set('page', String(params.page ?? 1));
  return apiRequest<ListSolicitacoesResult>(`/api/solicitacoes/admin/todas?${query.toString()}`);
}

/** RF016/RN47: reatribui a solicitação a outro designer ativo, preservando todo o histórico. */
export function reassignSolicitacao(idSolicitacao: number, novoDesignerId: string): Promise<void> {
  return apiRequest<void>(`/api/solicitacoes/${idSolicitacao}/reatribuir`, {
    method: 'PATCH',
    body: JSON.stringify({ novoDesignerId }),
  });
}
