import express, { Router } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { z } from 'zod';
import { env } from '../config/env.js';
import {
  processarCallbackInstagram,
  processarDeauthorizeInstagram,
  processarSolicitacaoExclusaoInstagram,
  getStatusExclusaoInstagram,
} from '../services/clienteInstagram.service.js';

export const instagramOAuthRouter = Router();

/**
 * RF014/ADR 0005/seção 12.3: rotas públicas sem autenticação — chamadas
 * diretamente pela Meta (redirect do instagram.com no callback normal;
 * chamada servidor-a-servidor da Meta em deauthorize/data-deletion), nunca
 * por um fetch autenticado do frontend. Rate limit dedicado por IP em todas.
 */
const callbackRateLimit = rateLimit({
  windowMs: 10 * 60_000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (request) => ipKeyGenerator(request.ip ?? 'unknown'),
});

const metaCallbackRateLimit = rateLimit({
  windowMs: 10 * 60_000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (request) => ipKeyGenerator(request.ip ?? 'unknown'),
});

const dataDeletionStatusRateLimit = rateLimit({
  windowMs: 10 * 60_000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (request) => ipKeyGenerator(request.ip ?? 'unknown'),
});

/**
 * Deauthorize/Data Deletion chegam como `application/x-www-form-urlencoded`
 * com um único campo `signed_request` (mesmo formato do Facebook Login) —
 * escopado só a estas duas rotas, não ao app inteiro, para não alterar o
 * parsing de nenhuma outra rota. Limite pequeno: o payload real tem poucos
 * bytes (assinatura + JSON curto em base64url).
 */
const metaSignedRequestBody = express.urlencoded({ extended: false, limit: '8kb' });

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

const signedRequestBodySchema = z.object({ signed_request: z.string().min(1).max(4096) });

/**
 * Item A1: Deauthorize Callback exigido pela revisão do App da Meta. Só
 * remove a conexão/token daquele Instagram user — nunca cliente,
 * solicitação, arte ou histórico (seção 3.6.1/12.5). Idempotente: uma
 * segunda entrega do mesmo evento (retry da Meta) não encontra conexão para
 * remover e responde 200 do mesmo jeito.
 */
instagramOAuthRouter.post('/deauthorize', metaCallbackRateLimit, metaSignedRequestBody, async (request, response) => {
  const parsed = signedRequestBodySchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: 'INVALID_REQUEST' });
    return;
  }

  try {
    await processarDeauthorizeInstagram(parsed.data.signed_request);
    response.status(200).json({ received: true });
  } catch {
    // Única causa possível de `processarDeauthorizeInstagram` lançar é
    // assinatura inválida (ValidationError) — nunca ecoa detalhe técnico.
    response.status(400).json({ error: 'INVALID_SIGNATURE' });
  }
});

/**
 * Item A2: Data Deletion Request Callback exigido pela revisão do App da
 * Meta. Mesmo escopo de remoção do deauthorize. Responde no formato exigido
 * pela Meta: `{ url, confirmation_code }`.
 */
instagramOAuthRouter.post(
  '/data-deletion',
  metaCallbackRateLimit,
  metaSignedRequestBody,
  async (request, response) => {
    const parsed = signedRequestBodySchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ error: 'INVALID_REQUEST' });
      return;
    }

    try {
      const result = await processarSolicitacaoExclusaoInstagram(parsed.data.signed_request);
      response.status(200).json({ url: result.url, confirmation_code: result.confirmationCode });
    } catch {
      response.status(400).json({ error: 'INVALID_SIGNATURE' });
    }
  },
);

const dataDeletionStatusQuerySchema = z.object({ id: z.string().min(1).max(64) });

/**
 * Item A2: página de acompanhamento apontada pela URL devolvida em
 * `/data-deletion` — texto simples, sem nenhum dado pessoal do cliente,
 * só o status da exclusão daquele `confirmation_code`.
 */
instagramOAuthRouter.get('/data-deletion/status', dataDeletionStatusRateLimit, async (request, response) => {
  const parsed = dataDeletionStatusQuerySchema.safeParse(request.query);
  if (!parsed.success) {
    response.status(400).type('text/plain').send('Solicitacao invalida.');
    return;
  }

  const status = await getStatusExclusaoInstagram(parsed.data.id);
  const mensagem =
    status === 'concluido'
      ? 'A solicitacao de exclusao de dados foi concluida.'
      : 'Nenhuma solicitacao de exclusao encontrada para este identificador.';
  response.status(status === 'concluido' ? 200 : 404).type('text/plain').send(mensagem);
});
