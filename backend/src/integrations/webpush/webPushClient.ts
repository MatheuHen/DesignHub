import webpush from 'web-push';
import { env, webPushConfigStatus } from '../../config/env.js';
import { BlockedExternalCredentialError } from '../../lib/errors.js';

/**
 * Item 9 (rodada correções): Web Push (VAPID) — aviso "publicação em 2h" ao
 * designer responsável. Biblioteca gratuita, sem serviço pago (usa os
 * serviços de push nativos dos navegadores). Nunca publica/decide nada por
 * si só; é só um canal de aviso best-effort, igual ao padrão já usado para
 * WhatsApp business-initiated (BLOCKED_EXTERNAL quando não configurado).
 */

let configured = false;

function ensureConfigured(): void {
  if (configured) return;
  if (!webPushConfigStatus.hasVapidKeys) {
    throw new BlockedExternalCredentialError(
      'WEB_PUSH_VAPID_PUBLIC_KEY/WEB_PUSH_VAPID_PRIVATE_KEY ausentes — notificação de dispositivo indisponível até a credencial ser configurada.',
    );
  }
  webpush.setVapidDetails(env.WEB_PUSH_VAPID_SUBJECT, env.WEB_PUSH_VAPID_PUBLIC_KEY!, env.WEB_PUSH_VAPID_PRIVATE_KEY!);
  configured = true;
}

export interface WebPushSubscription {
  endpoint: string;
  p256dh: string;
  authKey: string;
}

export interface WebPushPayload {
  title: string;
  body: string;
  url?: string;
}

/** Erro específico para assinatura expirada/inválida (410/404) — o chamador deve apagar essa assinatura. */
export class WebPushSubscriptionGoneError extends Error {}

export async function sendWebPushNotification(
  subscription: WebPushSubscription,
  payload: WebPushPayload,
): Promise<void> {
  ensureConfigured();

  try {
    await webpush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.authKey },
      },
      JSON.stringify(payload),
    );
  } catch (error) {
    const statusCode = (error as { statusCode?: number }).statusCode;
    if (statusCode === 404 || statusCode === 410) {
      throw new WebPushSubscriptionGoneError('Assinatura de push expirada ou revogada pelo navegador.');
    }
    throw error;
  }
}
