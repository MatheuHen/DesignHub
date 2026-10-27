import { env } from '../config/env.js';
import { getSupabaseAdminClient } from '../config/supabase.js';
import {
  WebPushSubscriptionGoneError,
  sendWebPushNotification,
} from '../integrations/webpush/webPushClient.js';
import { NotFoundError } from '../lib/errors.js';
import {
  deletePushSubscription,
  deletePushSubscriptionByEndpoint,
  listPushSubscriptionsByDesigner,
  upsertPushSubscription,
} from '../repositories/pushSubscription.repository.js';
import type { SubscribePushInput } from '../schemas/pushSubscription.schemas.js';
import { buildPushTitle } from './designerPush.service.js';

/** Item 9: o designer autenticado registra a própria assinatura de push — nunca a de outro usuário. */
export async function subscribePush(callerId: string, input: SubscribePushInput): Promise<void> {
  const adminClient = getSupabaseAdminClient();
  await upsertPushSubscription(adminClient, {
    idUsuario: callerId,
    endpoint: input.endpoint,
    p256dh: input.keys.p256dh,
    authKey: input.keys.auth,
  });
}

export async function unsubscribePush(callerId: string, endpoint: string): Promise<void> {
  const adminClient = getSupabaseAdminClient();
  await deletePushSubscription(adminClient, callerId, endpoint);
}

/** Quantos dispositivos deste designer estão inscritos — o Dashboard mostra o estado real. */
export async function contarDispositivosInscritos(callerId: string): Promise<number> {
  const adminClient = getSupabaseAdminClient();
  const subscriptions = await listPushSubscriptionsByDesigner(adminClient, callerId);
  return subscriptions.length;
}

/**
 * Notificação de teste do próprio designer, para o dispositivo indicado.
 *
 * Enviar para UM endpoint (o do navegador que pediu) em vez de todos é
 * deliberado: o botão existe para provar que ESTE aparelho recebe, e disparar
 * em todos poluiria os demais dispositivos do designer.
 *
 * Devolve `false` quando o serviço de push respondeu 404/410 — assinatura
 * expirada/revogada, já removida aqui. Nunca devolve sucesso sem o serviço de
 * push ter aceitado o envio.
 */
export async function enviarPushDeTeste(callerId: string, endpoint: string): Promise<boolean> {
  const adminClient = getSupabaseAdminClient();
  const subscriptions = await listPushSubscriptionsByDesigner(adminClient, callerId);

  // Ownership: só envia para um endpoint que pertence a quem pediu — nunca
  // aceita um endpoint arbitrário vindo do corpo da requisição.
  const alvo = subscriptions.find((subscription) => subscription.endpoint === endpoint);
  if (!alvo) {
    throw new NotFoundError('Este dispositivo não está inscrito para notificações.');
  }

  try {
    await sendWebPushNotification(alvo, {
      title: buildPushTitle('Teste'),
      body: 'Se você está vendo esta mensagem, as notificações deste dispositivo estão funcionando.',
      url: `${env.FRONTEND_URL}/designer`,
    });
    return true;
  } catch (error) {
    if (error instanceof WebPushSubscriptionGoneError) {
      await deletePushSubscriptionByEndpoint(adminClient, endpoint).catch(() => undefined);
      return false;
    }
    throw error;
  }
}
