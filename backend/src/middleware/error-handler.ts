import { randomUUID } from 'node:crypto';
import type { ErrorRequestHandler } from 'express';

export const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
  const errorId = randomUUID();

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
