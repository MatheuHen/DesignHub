import { Router } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { toAppError } from '../lib/errors.js';
import { uploadAvaliacaoReferencia } from '../middleware/upload.js';
import { avaliacaoTokenParamSchema, submitAvaliacaoBodySchema } from '../schemas/avaliacao.schemas.js';
import { getAvaliacaoPreview, submitAvaliacaoDecisao } from '../services/avaliacao.service.js';

export const avaliacaoRouter = Router();

/**
 * RF009/seção 12.3: rota pública sem autenticação — a única prova de
 * acesso é o token na URL. Um token de 256 bits é inviável de adivinhar por
 * força bruta, mas ainda assim é uma superfície pública, então recebe rate
 * limit dedicado por IP (não há usuário autenticado para chavear por
 * conta, diferente do upload da Fase 8).
 */
const avaliacaoPublicaRateLimit = rateLimit({
  windowMs: 10 * 60_000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (request) => ipKeyGenerator(request.ip ?? 'unknown'),
});

avaliacaoRouter.use(avaliacaoPublicaRateLimit);

/** RF009: leitura do estado do link + dados mínimos da arte em avaliação. Sempre 200 — o estado está no corpo. */
avaliacaoRouter.get('/:token', async (request, response, next) => {
  try {
    const { token } = avaliacaoTokenParamSchema.parse(request.params);
    const preview = await getAvaliacaoPreview(token);
    response.status(200).json(preview);
  } catch (error) {
    next(toAppError(error));
  }
});

/** RF009/RF010: decisão do cliente (Aprovar/Ajustes/Cancelar), com referência opcional em Ajustes. */
avaliacaoRouter.post(
  '/:token',
  (request, response, next) => {
    uploadAvaliacaoReferencia(request, response, (error: unknown) => {
      if (error) {
        next(toAppError(error));
        return;
      }
      next();
    });
  },
  async (request, response, next) => {
    try {
      const { token } = avaliacaoTokenParamSchema.parse(request.params);
      const body = submitAvaliacaoBodySchema.parse(request.body);
      const result = await submitAvaliacaoDecisao(token, {
        decisao: body.decisao,
        descricao: body.descricao,
        observacoes: body.observacoes,
        referenciaBuffer: request.file?.buffer,
        desejaAgendamento: body.desejaAgendamento,
        dataDesejada: body.dataDesejada,
        horarioDesejado: body.horarioDesejado,
      });
      response.status(200).json(result);
    } catch (error) {
      next(toAppError(error));
    }
  },
);
