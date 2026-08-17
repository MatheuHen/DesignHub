import { timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { env, internalJobConfigStatus } from '../config/env.js';

function timingSafeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * RF014/seção 11: protege o endpoint interno chamado pelo job/cron de
 * publicação vencida (Supabase Cron/pg_cron) — nunca por um usuário
 * autenticado via Supabase Auth, então não usa `requireAuth`/`attachProfile`.
 * Fail-closed: sem `INTERNAL_JOB_SECRET` configurado, o endpoint fica
 * indisponível (503) em vez de aberto.
 */
export function requireInternalJobSecret(request: Request, response: Response, next: NextFunction): void {
  if (!internalJobConfigStatus.hasSecret) {
    response.status(503).json({
      error: 'BLOCKED_EXTERNAL_CREDENTIAL',
      message: 'INTERNAL_JOB_SECRET ausente — endpoint interno indisponível.',
    });
    return;
  }

  const provided = request.header('x-internal-job-secret');
  if (!provided || !timingSafeCompare(provided, env.INTERNAL_JOB_SECRET!)) {
    response.status(401).json({ error: 'UNAUTHORIZED', message: 'Segredo inválido.' });
    return;
  }

  next();
}
