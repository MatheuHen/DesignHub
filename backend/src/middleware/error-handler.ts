import { randomUUID } from 'node:crypto';
import type { ErrorRequestHandler } from 'express';
import { AppError } from '../lib/errors.js';

export const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
  const errorId = randomUUID();

  if (error instanceof AppError) {
    if (error.status >= 500) {
      console.error('[designhub:error]', { errorId, code: error.code, message: error.message });
    }
    response.status(error.status).json({
      error: error.code,
      message: error.message,
      errorId,
    });
    return;
  }

  console.error('[designhub:error]', {
    errorId,
    name: error instanceof Error ? error.name : 'UnknownError',
    message: error instanceof Error ? error.message : 'Erro desconhecido',
  });

  response.status(500).json({
    error: 'INTERNAL_SERVER_ERROR',
    message: 'Não foi possível concluir a operação.',
    errorId,
  });
};
