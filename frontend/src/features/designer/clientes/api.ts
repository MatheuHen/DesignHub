import { apiRequest } from '../../../lib/apiClient';

export interface Cliente {
  id: number;
  idDesigner: string;
  nome: string;
  whatsapp: string;
  instagram: string | null;
}

export interface ListClientesResult {
  items: Cliente[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ListClientesParams {
  search?: string | undefined;
  page?: number;
}

export interface CreateClienteInput {
  nome: string;
  whatsapp: string;
  instagram?: string | undefined;
}

export interface UpdateClienteInput {
  nome?: string;
  whatsapp?: string;
  instagram?: string | null;
}

/** RF003: lista/pesquisa os clientes do próprio designer. */
export function listClientes(params: ListClientesParams): Promise<ListClientesResult> {
  const query = new URLSearchParams();
  if (params.search) query.set('search', params.search);
  query.set('page', String(params.page ?? 1));
  return apiRequest<ListClientesResult>(`/api/clientes?${query.toString()}`);
}

/** RF003/RN07: nome e WhatsApp obrigatórios, Instagram opcional. */
export function createCliente(input: CreateClienteInput): Promise<Cliente> {
  return apiRequest<Cliente>('/api/clientes', { method: 'POST', body: JSON.stringify(input) });
}

export function updateCliente(id: number, input: UpdateClienteInput): Promise<void> {
  return apiRequest<void>(`/api/clientes/${id}`, { method: 'PATCH', body: JSON.stringify(input) });
}

/** RF003: exclusão — pode ser recusada pelo backend por impedimento histórico. */
export function deleteCliente(id: number): Promise<void> {
  return apiRequest<void>(`/api/clientes/${id}`, { method: 'DELETE' });
}

/** RF004/RN02/RN03: inicia o atendimento estruturado via WhatsApp para este cliente. */
export function iniciarAtendimento(id: number): Promise<{ idAtendimento: number }> {
  return apiRequest<{ idAtendimento: number }>(`/api/clientes/${id}/atendimentos`, { method: 'POST' });
}
