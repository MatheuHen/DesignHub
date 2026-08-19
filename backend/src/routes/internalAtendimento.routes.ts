import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { toAppError } from '../lib/errors.js';
import { requireInternalJobSecret } from '../middleware/internalAuth.js';
import { processarAtendimentosExpirados } from '../services/atendimento.service.js';

export const internalAtendimentoRouter = Router();

/**
 * Seção 12.3: mesmo raciocínio do endpoint interno de publicação — rota
 * autenticada só por segredo compartilhado, limite dedicado e estrito por
 * IP em vez do limite global da aplicação.
 */
const processarAtendimentosRateLimit = rateLimit({
  windowMs: 60_000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * RN05 + seção 11: encerra atendimentos abertos há mais de 2 dias sem
 * resposta completa. Chamado pelo job/cron (Supabase Cron/pg_cron), nunca
 * por um usuário — protegido por segredo compartilhado, não por sessão de
 * designer.
 */
internalAtendimentoRouter.post(
  '/processar',
  processarAtendimentosRateLimit,
  requireInternalJobSecret,
  async (_request, response, next) => {
    try {
      const result = await processarAtendimentosExpirados();
      response.status(200).json(result);
    } catch (error) {
      next(toAppError(error));
    }
  },
);
