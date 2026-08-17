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
