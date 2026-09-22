import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BlockedExternalCredentialError } from '../../lib/errors.js';

const { envMock, webPushConfigStatusMock, setVapidDetailsMock, sendNotificationMock } = vi.hoisted(() => ({
  envMock: {
    WEB_PUSH_VAPID_PUBLIC_KEY: 'chave-publica-teste',
    WEB_PUSH_VAPID_PRIVATE_KEY: 'chave-privada-teste',
    WEB_PUSH_VAPID_SUBJECT: 'mailto:designhub@example.com',
  },
  webPushConfigStatusMock: { hasVapidKeys: true },
  setVapidDetailsMock: vi.fn(),
  sendNotificationMock: vi.fn(),
}));

vi.mock('../../config/env.js', () => ({ env: envMock, webPushConfigStatus: webPushConfigStatusMock }));
vi.mock('web-push', () => ({
  default: { setVapidDetails: setVapidDetailsMock, sendNotification: sendNotificationMock },
}));

const { sendWebPushNotification, WebPushSubscriptionGoneError } = await import('./webPushClient.js');

const SUBSCRIPTION = { endpoint: 'https://push.example/1', p256dh: 'p', authKey: 'a' };
const PAYLOAD = { title: 'Publicação em 2 horas', body: 'Texto' };

describe('sendWebPushNotification (item 9)', () => {
  beforeEach(() => {
    webPushConfigStatusMock.hasVapidKeys = true;
    setVapidDetailsMock.mockReset();
    sendNotificationMock.mockReset();
  });

  it('lança BlockedExternalCredentialError quando as chaves VAPID não estão configuradas (fail-closed)', async () => {
    webPushConfigStatusMock.hasVapidKeys = false;

    await expect(sendWebPushNotification(SUBSCRIPTION, PAYLOAD)).rejects.toBeInstanceOf(
      BlockedExternalCredentialError,
    );
    expect(sendNotificationMock).not.toHaveBeenCalled();
  });

  it('envia a notificação com o payload e as chaves da assinatura', async () => {
    sendNotificationMock.mockResolvedValue(undefined);

    await sendWebPushNotification(SUBSCRIPTION, PAYLOAD);

    expect(sendNotificationMock).toHaveBeenCalledWith(
      { endpoint: 'https://push.example/1', keys: { p256dh: 'p', auth: 'a' } },
      JSON.stringify(PAYLOAD),
    );
  });

  it('converte erro 410 (assinatura revogada) em WebPushSubscriptionGoneError', async () => {
    sendNotificationMock.mockRejectedValue({ statusCode: 410 });

    await expect(sendWebPushNotification(SUBSCRIPTION, PAYLOAD)).rejects.toBeInstanceOf(WebPushSubscriptionGoneError);
  });

  it('converte erro 404 (endpoint não existe mais) em WebPushSubscriptionGoneError', async () => {
    sendNotificationMock.mockRejectedValue({ statusCode: 404 });

    await expect(sendWebPushNotification(SUBSCRIPTION, PAYLOAD)).rejects.toBeInstanceOf(WebPushSubscriptionGoneError);
  });

  it('propaga outros erros sem mascarar (ex.: 500 do serviço de push)', async () => {
    sendNotificationMock.mockRejectedValue({ statusCode: 500, message: 'erro do serviço de push' });

    await expect(sendWebPushNotification(SUBSCRIPTION, PAYLOAD)).rejects.toMatchObject({ statusCode: 500 });
  });
});
