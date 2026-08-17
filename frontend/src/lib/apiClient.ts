import { supabase } from './supabaseClient';

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const apiUrl = import.meta.env.VITE_API_URL ?? '';

async function authorizedFetch(path: string, init: RequestInit): Promise<Response> {
  const session = supabase ? (await supabase.auth.getSession()).data.session : null;
  const headers = new Headers(init.headers);
  // RF007: upload de arquivo usa FormData — o browser define o
  // Content-Type multipart/form-data com o boundary correto sozinho;
  // definir manualmente aqui quebraria o parsing no backend.
  if (!(init.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }
  if (session) {
    headers.set('Authorization', `Bearer ${session.access_token}`);
  }

  return fetch(`${apiUrl}${path}`, { ...init, headers });
}

interface ApiErrorBody {
  error?: string;
  message?: string;
}

/** Chama a API REST do backend (RF002: sempre com o JWT da sessão atual). */
export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await authorizedFetch(path, init);

  if (!response.ok) {
    let code = 'UNKNOWN_ERROR';
    let message = 'Não foi possível concluir a operação.';
    try {
      const body = (await response.json()) as ApiErrorBody;
      code = body.error ?? code;
      message = body.message ?? message;
    } catch {
      // resposta sem corpo JSON — mantém mensagem genérica
    }
    throw new ApiError(response.status, code, message);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}
