import { MulterError } from 'multer';
import { ZodError } from 'zod';

export class AppError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/** Credencial externa (ex.: SUPABASE_SERVICE_ROLE_KEY) ausente/inválida. */
export class BlockedExternalCredentialError extends AppError {
  constructor(message: string) {
    super(503, 'BLOCKED_EXTERNAL_CREDENTIAL', message);
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(409, 'CONFLICT', message);
  }
}

export class NotFoundError extends AppError {
  constructor(message: string) {
    super(404, 'NOT_FOUND', message);
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(400, 'VALIDATION_ERROR', message);
  }
}

/** RF009: link de avaliação existente porém vencido. */
export class ExpiredLinkError extends AppError {
  constructor(message: string) {
    super(410, 'LINK_EXPIRED', message);
  }
}

/**
 * Traduz mensagens cruas do Supabase Auth Admin API (inglês) para PT-BR
 * antes de repassá-las ao usuário final. Nunca expõe o texto original do
 * provedor: se nenhum padrão conhecido casar, usa um texto genérico.
 */
const SUPABASE_AUTH_ERROR_PATTERNS: Array<[RegExp, string]> = [
  [/already been registered|user already registered|already exists/i, 'Já existe um usuário cadastrado com este e-mail.'],
  [/password should be at least/i, 'A senha deve ter pelo menos 6 caracteres.'],
  [/unable to validate email address|invalid.*email/i, 'Informe um e-mail válido.'],
];

export function translateSupabaseAuthErrorMessage(rawMessage: string | null | undefined): string {
  if (rawMessage) {
    for (const [pattern, translated] of SUPABASE_AUTH_ERROR_PATTERNS) {
      if (pattern.test(rawMessage)) return translated;
    }
  }
  return 'Não foi possível criar o designer.';
}

/** Normaliza erros de validação (Zod) para o formato de erro HTTP do domínio. */
export function toAppError(error: unknown): unknown {
  if (error instanceof ZodError) {
    return new ValidationError(error.issues.map((issue) => issue.message).join('; '));
  }
  if (error instanceof MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return new ValidationError('Arquivo excede o tamanho máximo permitido (15 MB).');
    }
    return new ValidationError('Falha ao processar o arquivo enviado.');
  }
  return error;
}
