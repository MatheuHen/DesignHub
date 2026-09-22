import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { toAppError } from '../lib/errors.js';
import { requireInternalJobSecret } from '../middleware/internalAuth.js';
import { notificarPublicacoesProximas } from '../services/publicacaoNotificacao.service.js';

export const internalNotificacaoRouter = Router();

/** Mesmo padrão de `internalPublicacao.routes.ts` — segredo compartilhado, sem sessão de usuário. */
const processarNotificacoesRateLimit = rateLimit({
  windowMs: 60_000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Item 9: varre agendamentos ~2h à frente e envia Web Push ao designer
 * responsável. Chamado pelo job/cron (Supabase Cron/pg_cron), nunca por um
 * usuário — protegido por segredo compartilhado, mesmo padrão do job de
 * publicação (RF014).
 */
internalNotificacaoRouter.post(
  '/processar',
  processarNotificacoesRateLimit,
  requireInternalJobSecret,
  async (_request, response, next) => {
    try {
      const result = await notificarPublicacoesProximas();
      response.status(200).json(result);
    } catch (error) {
      next(toAppError(error));
    }
  },
);
