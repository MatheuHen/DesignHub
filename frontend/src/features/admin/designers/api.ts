import { apiRequest } from '../../../lib/apiClient';

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
}

export interface UpdateDesignerInput {
  nomeCompleto?: string;
  whatsapp?: string;
  statusOperacional?: string | null;
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

/** RF001: inativação/reativação. */
export function setDesignerStatus(id: string, status: 'ativo' | 'inativo'): Promise<void> {
  return apiRequest<void>(`/api/designers/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

/** RF001: exclusão — pode ser recusada pelo backend por impedimento histórico. */
export function deleteDesigner(id: string): Promise<void> {
  return apiRequest<void>(`/api/designers/${id}`, { method: 'DELETE' });
}
