import { apiRequest } from '../../../lib/apiClient';

export interface PushSubscriptionJson {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

/** Item 9: chave pública (não é segredo) — rota sem autenticação. */
export async function getVapidPublicKey(): Promise<string | null> {
  const apiUrl = import.meta.env.VITE_API_URL ?? '';
  const response = await fetch(`${apiUrl}/api/push/vapid-public-key`);
  if (!response.ok) return null;
  const body = (await response.json()) as { publicKey: string };
  return body.publicKey;
}

export function subscribePush(subscription: PushSubscriptionJson): Promise<void> {
  return apiRequest<void>('/api/push/subscribe', { method: 'POST', body: JSON.stringify(subscription) });
}

export function unsubscribePush(endpoint: string): Promise<void> {
  return apiRequest<void>('/api/push/unsubscribe', { method: 'POST', body: JSON.stringify({ endpoint }) });
}

/** Quantos dispositivos desta conta estão inscritos (vários aparelhos são suportados). */
export function getPushStatus(): Promise<{ dispositivos: number }> {
  return apiRequest<{ dispositivos: number }>('/api/push/status');
}

/**
 * Dispara uma notificação real para ESTE dispositivo.
 * `entregue: false` = assinatura expirada (já removida no servidor) — o
 * dispositivo precisa reativar.
 */
export function enviarPushDeTeste(endpoint: string): Promise<{ entregue: boolean }> {
  return apiRequest<{ entregue: boolean }>('/api/push/teste', {
    method: 'POST',
    body: JSON.stringify({ endpoint }),
  });
}
