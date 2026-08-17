import { apiRequest } from '../../../lib/apiClient';

export const AGENDAMENTO_STATUSES = ['Agendado', 'Cancelado', 'Publicado'] as const;
export type AgendamentoStatus = (typeof AGENDAMENTO_STATUSES)[number];

export interface Agendamento {
  idAgendamento: number;
  idSolicitacao: number;
  tema: string | null;
  clienteNome: string;
  dataPublicacao: string;
  horario: string;
  legenda: string | null;
  status: AgendamentoStatus;
  createdAt: string;
}

export interface ListAgendamentosResult {
  items: Agendamento[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ListAgendamentosParams {
  status?: AgendamentoStatus | undefined;
  page?: number;
}

/** RF012: lista/filtra as próprias publicações agendadas do designer. */
export function listAgendamentos(params: ListAgendamentosParams): Promise<ListAgendamentosResult> {
  const query = new URLSearchParams();
  if (params.status) query.set('status', params.status);
  query.set('page', String(params.page ?? 1));
  return apiRequest<ListAgendamentosResult>(`/api/agendamentos?${query.toString()}`);
}
