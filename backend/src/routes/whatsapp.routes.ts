import { Router } from 'express';
import {
  verifyWebhookHandshake,
  verifyWebhookSignature,
} from '../integrations/whatsapp/webhookSignature.js';
import { toAppError } from '../lib/errors.js';
import { whatsappWebhookPayloadSchema, type WhatsAppWebhookPayload } from '../schemas/whatsapp.schemas.js';
import { processInboundWebhook } from '../services/atendimento.service.js';

export const whatsappRouter = Router();

/**
 * Observabilidade de entrega (sem mudança de comportamento): registra o
 * resultado REAL de cada mensagem enviada, que a Cloud API só informa aqui,
 * depois do HTTP 200 + `wamid` do envio. Sem isso, uma mensagem recusada na
 * entrega — por exemplo a recusa 131047 quando a janela de atendimento de
 * 24h está fechada — não deixava nenhum rastro, e o log de envio continuava
 * dizendo "mensagem enviada".
 *
 * Nunca registra telefone (`recipient_id`), conteúdo ou token: só o `wamid`,
 * o status e o código de erro da Meta (RNF010/seção 12.5). `failed` vai como
 * erro para aparecer na triagem; os demais status ficam em nível info.
 */
function logDeliveryStatuses(payload: WhatsAppWebhookPayload): void {
  for (const entry of payload.entry) {
    for (const change of entry.changes) {
      for (const status of change.value.statuses ?? []) {
        const base = {
          wamid: status.id,
          status: status.status,
          metaErrorCodes: status.errors?.map((error) => error.code).filter((code) => code !== undefined),
        };
        if (status.status === 'failed') {
          console.error('[designhub:whatsapp] entrega FALHOU', base);
        } else {
          console.info('[designhub:whatsapp] status de entrega', base);
        }
      }
    }
  }
}

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
    logDeliveryStatuses(payload);
    await processInboundWebhook(payload);
    response.status(200).json({ received: true });
  } catch (error) {
    // Payload assinado mas em formato inesperado (400) não deve virar 500 —
    // sinaliza corretamente à Meta que reentregar não vai adiantar.
    next(toAppError(error));
  }
});
