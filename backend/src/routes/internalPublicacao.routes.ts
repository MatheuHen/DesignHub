import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { toAppError } from '../lib/errors.js';
import { requireInternalJobSecret } from '../middleware/internalAuth.js';
import { processarAgendamentosVencidos } from '../services/publicacao.service.js';

export const internalPublicacaoRouter = Router();

/**
 * Seção 12.3: essa rota é autenticada só por segredo compartilhado (sem
 * sessão de usuário), então um limite dedicado e estrito por IP reduz a
 * superfície de força bruta do segredo — o limite global da aplicação
 * (seção 3.6.1/app.ts) sozinho seria alto demais para essa rota sensível.
 */
const processarPublicacoesRateLimit = rateLimit({
  windowMs: 60_000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * RF014/RN32-RN35 + seção 11: varre agendamentos vencidos e tenta
 * publicação automática via Instagram API oficial. Chamado pelo
 * job/cron (Supabase Cron/pg_cron), nunca por um usuário — protegido por
 * segredo compartilhado, não por sessão de designer.
 */
internalPublicacaoRouter.post(
  '/processar',
  processarPublicacoesRateLimit,
  requireInternalJobSecret,
  async (_request, response, next) => {
    try {
      const result = await processarAgendamentosVencidos();
      response.status(200).json(result);
    } catch (error) {
      next(toAppError(error));
    }
  },
);
