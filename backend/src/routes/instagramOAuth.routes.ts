import { Router } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { z } from 'zod';
import { env } from '../config/env.js';
import { processarCallbackInstagram } from '../services/clienteInstagram.service.js';

export const instagramOAuthRouter = Router();

/**
 * RF014/ADR 0005/seção 12.3: rota pública sem autenticação — chamada pelo
 * redirect do próprio instagram.com, não por um fetch autenticado do
 * frontend. A única prova de autorização é o `state` opaco de 256 bits
 * (mesmo padrão do link público de avaliação, RF009); ainda assim recebe
 * rate limit dedicado por IP.
 */
const callbackRateLimit = rateLimit({
  windowMs: 10 * 60_000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (request) => ipKeyGenerator(request.ip ?? 'unknown'),
});

const callbackQuerySchema = z.object({
  code: z.string().min(1).optional(),
  state: z.string().min(1).optional(),
  error: z.string().optional(),
});

/** Redireciona sempre para a tela de Clientes do designer — nunca expõe token/código na URL de destino. */
function redirectToClientes(query: string): string {
  return `${env.FRONTEND_URL}/designer/clientes?${query}`;
}

instagramOAuthRouter.get('/callback', callbackRateLimit, async (request, response) => {
  const parsed = callbackQuerySchema.safeParse(request.query);
  if (!parsed.success || parsed.data.error || !parsed.data.code || !parsed.data.state) {
    response.redirect(302, redirectToClientes('instagram=erro'));
    return;
  }

  try {
    await processarCallbackInstagram(parsed.data.state, parsed.data.code);
    response.redirect(302, redirectToClientes('instagram=conectado'));
  } catch {
    // Nunca expõe detalhe técnico/payload da Meta na URL pública (seção 12.6) — só o resultado.
    response.redirect(302, redirectToClientes('instagram=erro'));
  }
});
