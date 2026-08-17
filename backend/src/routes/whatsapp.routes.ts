import { Router } from 'express';
import {
  verifyWebhookHandshake,
  verifyWebhookSignature,
} from '../integrations/whatsapp/webhookSignature.js';
import { toAppError } from '../lib/errors.js';
import { whatsappWebhookPayloadSchema } from '../schemas/whatsapp.schemas.js';
import { processInboundWebhook } from '../services/atendimento.service.js';

export const whatsappRouter = Router();

/**
 * RF004: handshake de verificação exigido pela Meta ao configurar o
 * webhook (GET com hub.mode/hub.verify_token/hub.challenge). Rota
 * pública — Meta não envia sessão/JWT, a segurança é o token de
 * verificação configurado apenas entre o backend e o painel da Meta.
 */
whatsappRouter.get('/', (request, response) => {
  const mode = typeof request.query['hub.mode'] === 'string' ? request.query['hub.mode'] : undefined;
  const token =
    typeof request.query['hub.verify_token'] === 'string' ? request.query['hub.verify_token'] : undefined;
  const challenge =
    typeof request.query['hub.challenge'] === 'string' ? request.query['hub.challenge'] : undefined;

  if (challenge && verifyWebhookHandshake(mode, token)) {
    response.status(200).send(challenge);
    return;
  }

  response.status(403).json({ error: 'FORBIDDEN', message: 'Verificação de webhook inválida.' });
});

/**
 * RF004/seção 12.3: recebe mensagens do WhatsApp Cloud API. Assinatura
 * HMAC obrigatória (X-Hub-Signature-256) antes de processar qualquer
 * payload — nunca confia no corpo da requisição sem essa validação.
 */
whatsappRouter.post('/', async (request, response, next) => {
  try {
    const signature = request.header('x-hub-signature-256');

    if (!request.rawBody || !verifyWebhookSignature(request.rawBody, signature)) {
      response
        .status(401)
        .json({ error: 'UNAUTHORIZED', message: 'Assinatura do webhook inválida.' });
      return;
    }

    const payload = whatsappWebhookPayloadSchema.parse(request.body);
    await processInboundWebhook(payload);
    response.status(200).json({ received: true });
  } catch (error) {
    // Payload assinado mas em formato inesperado (400) não deve virar 500 —
    // sinaliza corretamente à Meta que reentregar não vai adiantar.
    next(toAppError(error));
  }
});
