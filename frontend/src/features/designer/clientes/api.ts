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
  pageSize?: number;
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
  if (params.pageSize) query.set('pageSize', String(params.pageSize));
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

export interface InstagramStatus {
  conectado: boolean;
  conectadoEm: string | null;
  expiraEm: string | null;
}

/** RF014/ADR 0005: status de conexão do Instagram deste cliente — nunca o token. */
export function getInstagramStatus(id: number): Promise<InstagramStatus> {
  return apiRequest<InstagramStatus>(`/api/clientes/${id}/instagram/status`);
}

/** RF014/ADR 0005: URL de autorização oficial da Meta para conectar o Instagram deste cliente. */
export function getInstagramAuthorizeUrl(id: number): Promise<{ url: string }> {
  return apiRequest<{ url: string }>(`/api/clientes/${id}/instagram/authorize-url`, { method: 'POST' });
}

/** RF014/ADR 0005: desconecta o Instagram deste cliente. */
export function desconectarInstagram(id: number): Promise<void> {
  return apiRequest<void>(`/api/clientes/${id}/instagram/conexao`, { method: 'DELETE' });
}
