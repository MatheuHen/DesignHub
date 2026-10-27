import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  getSupabaseAdminClientMock,
  upsertPushSubscriptionMock,
  deletePushSubscriptionMock,
  deletePushSubscriptionByEndpointMock,
  listPushSubscriptionsByDesignerMock,
  sendWebPushNotificationMock,
} = vi.hoisted(() => ({
  getSupabaseAdminClientMock: vi.fn(() => ({ __kind: 'admin-client' })),
  upsertPushSubscriptionMock: vi.fn(),
  deletePushSubscriptionMock: vi.fn(),
  deletePushSubscriptionByEndpointMock: vi.fn(),
  listPushSubscriptionsByDesignerMock: vi.fn(),
  sendWebPushNotificationMock: vi.fn(),
}));

vi.mock('../config/supabase.js', () => ({ getSupabaseAdminClient: getSupabaseAdminClientMock }));
vi.mock('../config/env.js', () => ({ env: { FRONTEND_URL: 'https://app.exemplo' } }));
vi.mock('../integrations/webpush/webPushClient.js', () => {
  class WebPushSubscriptionGoneError extends Error {}
  return {
    sendWebPushNotification: sendWebPushNotificationMock,
    WebPushSubscriptionGoneError,
  };
});
vi.mock('../repositories/pushSubscription.repository.js', () => ({
  upsertPushSubscription: upsertPushSubscriptionMock,
  deletePushSubscription: deletePushSubscriptionMock,
  deletePushSubscriptionByEndpoint: deletePushSubscriptionByEndpointMock,
  listPushSubscriptionsByDesigner: listPushSubscriptionsByDesignerMock,
}));

const { contarDispositivosInscritos, enviarPushDeTeste, subscribePush, unsubscribePush } =
  await import('./pushSubscription.service.js');
const { WebPushSubscriptionGoneError } = await import('../integrations/webpush/webPushClient.js');
const { NotFoundError } = await import('../lib/errors.js');

describe('subscribePush (item 9)', () => {
  it('salva a assinatura vinculada ao próprio caller (nunca a um id_usuario enviado pelo cliente)', async () => {
    upsertPushSubscriptionMock.mockReset().mockResolvedValue(undefined);

    await subscribePush('designer-1', {
      endpoint: 'https://push.example/abc',
      keys: { p256dh: 'p', auth: 'a' },
    });

    expect(upsertPushSubscriptionMock).toHaveBeenCalledWith(expect.anything(), {
      idUsuario: 'designer-1',
      endpoint: 'https://push.example/abc',
      p256dh: 'p',
      authKey: 'a',
    });
  });
});

describe('unsubscribePush (item 9)', () => {
  it('remove só a assinatura do próprio caller', async () => {
    deletePushSubscriptionMock.mockReset().mockResolvedValue(undefined);

    await unsubscribePush('designer-1', 'https://push.example/abc');

    expect(deletePushSubscriptionMock).toHaveBeenCalledWith(expect.anything(), 'designer-1', 'https://push.example/abc');
  });
});

describe('enviarPushDeTeste (item 7 — prova real no dispositivo)', () => {
  beforeEach(() => {
    listPushSubscriptionsByDesignerMock.mockReset();
    sendWebPushNotificationMock.mockReset().mockResolvedValue(undefined);
    deletePushSubscriptionByEndpointMock.mockReset().mockResolvedValue(undefined);
  });

  it('envia só para o dispositivo indicado, não para todos os do designer', async () => {
    listPushSubscriptionsByDesignerMock.mockResolvedValue([
      { endpoint: 'https://push.example/a', p256dh: 'p1', authKey: 'a1' },
      { endpoint: 'https://push.example/b', p256dh: 'p2', authKey: 'a2' },
    ]);

    const entregue = await enviarPushDeTeste('designer-1', 'https://push.example/b');

    expect(entregue).toBe(true);
    expect(sendWebPushNotificationMock).toHaveBeenCalledTimes(1);
    expect(sendWebPushNotificationMock).toHaveBeenCalledWith(
      { endpoint: 'https://push.example/b', p256dh: 'p2', authKey: 'a2' },
      expect.objectContaining({ title: 'DesignHub — TESTE' }),
    );
  });

  it('rejeita endpoint que não pertence ao caller (IDOR) sem enviar nada', async () => {
    listPushSubscriptionsByDesignerMock.mockResolvedValue([
      { endpoint: 'https://push.example/a', p256dh: 'p1', authKey: 'a1' },
    ]);

    await expect(
      enviarPushDeTeste('designer-1', 'https://push.example/de-outro-designer'),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(sendWebPushNotificationMock).not.toHaveBeenCalled();
  });

  it('devolve false e remove a assinatura quando o serviço de push responde 410', async () => {
    listPushSubscriptionsByDesignerMock.mockResolvedValue([
      { endpoint: 'https://push.example/a', p256dh: 'p1', authKey: 'a1' },
    ]);
    sendWebPushNotificationMock.mockRejectedValue(new WebPushSubscriptionGoneError('expirada'));

    const entregue = await enviarPushDeTeste('designer-1', 'https://push.example/a');

    expect(entregue).toBe(false);
    expect(deletePushSubscriptionByEndpointMock).toHaveBeenCalledWith(
      expect.anything(),
      'https://push.example/a',
    );
  });
});

describe('contarDispositivosInscritos', () => {
  it('conta as assinaturas do próprio designer (suporte a vários aparelhos)', async () => {
    listPushSubscriptionsByDesignerMock.mockReset().mockResolvedValue([
      { endpoint: 'https://push.example/a', p256dh: 'p', authKey: 'a' },
      { endpoint: 'https://push.example/b', p256dh: 'p', authKey: 'a' },
      { endpoint: 'https://push.example/c', p256dh: 'p', authKey: 'a' },
    ]);

    await expect(contarDispositivosInscritos('designer-1')).resolves.toBe(3);
    expect(listPushSubscriptionsByDesignerMock).toHaveBeenCalledWith(expect.anything(), 'designer-1');
  });
});
