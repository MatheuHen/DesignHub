const apiUrl = import.meta.env.VITE_API_URL ?? '';

export type AvaliacaoLinkState = 'valid' | 'invalid' | 'expired' | 'used';

export interface AvaliacaoPreview {
  state: AvaliacaoLinkState;
  tema?: string | null;
  numeroVersao?: number;
  formato?: string;
  observacoes?: string | null;
  downloadUrl?: string;
  expiresInSeconds?: number;
}

export interface SubmitAvaliacaoResult {
  idSolicitacao: number;
  statusNovo: string;
}

export interface SubmitAvaliacaoInput {
  decisao: 'Aprovado' | 'Ajustes' | 'Cancelado';
  descricao?: string | undefined;
  observacoes?: string | undefined;
  referencia?: File | undefined;
}

interface ApiErrorBody {
  error?: string;
  message?: string;
}

/** RF009: rota pública — sem sessão/JWT, o token na URL é a própria prova de acesso. */
export class PublicApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function parseOrThrow<T>(response: Response): Promise<T> {
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
    throw new PublicApiError(response.status, code, message);
  }
  return (await response.json()) as T;
}

export async function getAvaliacaoPreview(token: string): Promise<AvaliacaoPreview> {
  const response = await fetch(`${apiUrl}/api/avaliacao/${token}`);
  return parseOrThrow<AvaliacaoPreview>(response);
}

/** RF009/RF010/RN20/RN21: decisão do cliente, com referência opcional em Ajustes. */
export async function submitAvaliacao(
  token: string,
  input: SubmitAvaliacaoInput,
): Promise<SubmitAvaliacaoResult> {
  const formData = new FormData();
  formData.append('decisao', input.decisao);
  if (input.descricao) formData.append('descricao', input.descricao);
  if (input.observacoes) formData.append('observacoes', input.observacoes);
  if (input.referencia) formData.append('referencia', input.referencia);

  const response = await fetch(`${apiUrl}/api/avaliacao/${token}`, { method: 'POST', body: formData });
  return parseOrThrow<SubmitAvaliacaoResult>(response);
}
