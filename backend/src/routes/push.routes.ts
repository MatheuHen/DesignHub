import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { env, webPushConfigStatus } from '../config/env.js';
import { toAppError } from '../lib/errors.js';
import { attachProfile, requireAuth, requireProfile } from '../middleware/auth.js';
import { subscribePushSchema, unsubscribePushSchema } from '../schemas/pushSubscription.schemas.js';
import { subscribePush, unsubscribePush } from '../services/pushSubscription.service.js';

export const pushRouter = Router();

const pushSubscribeRateLimit = rateLimit({
  windowMs: 10 * 60_000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Chave pública (não é segredo) para o frontend montar `applicationServerKey`
 * do `pushManager.subscribe` — antes do gate de autenticação abaixo, porque
 * a tela de dashboard precisa dela para sequer oferecer o botão "Ativar
 * notificações" (a checagem de quem pode ativar continua sendo o backend
 * de cada assinatura em si, nunca esta rota).
 */
pushRouter.get('/vapid-public-key', (_request, response) => {
  if (!webPushConfigStatus.hasVapidKeys) {
    response.status(404).json({ error: 'NOT_CONFIGURED', message: 'Notificação de dispositivo indisponível.' });
    return;
  }
  response.status(200).json({ publicKey: env.WEB_PUSH_VAPID_PUBLIC_KEY });
});

/** Item 9: registrar/remover a própria assinatura de push é responsabilidade do Designer autenticado. */
pushRouter.use(requireAuth, attachProfile, requireProfile('designer'));

pushRouter.post('/subscribe', pushSubscribeRateLimit, async (request, response, next) => {
  try {
    const input = subscribePushSchema.parse(request.body);
    await subscribePush(request.auth!.userId, input);
    response.status(204).end();
  } catch (error) {
    next(toAppError(error));
  }
});

pushRouter.post('/unsubscribe', pushSubscribeRateLimit, async (request, response, next) => {
  try {
    const input = unsubscribePushSchema.parse(request.body);
    await unsubscribePush(request.auth!.userId, input.endpoint);
    response.status(204).end();
  } catch (error) {
    next(toAppError(error));
  }
});
