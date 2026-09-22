import { describe, expect, it, vi } from 'vitest';

const { getSupabaseAdminClientMock, upsertPushSubscriptionMock, deletePushSubscriptionMock } = vi.hoisted(() => ({
  getSupabaseAdminClientMock: vi.fn(() => ({ __kind: 'admin-client' })),
  upsertPushSubscriptionMock: vi.fn(),
  deletePushSubscriptionMock: vi.fn(),
}));

vi.mock('../config/supabase.js', () => ({ getSupabaseAdminClient: getSupabaseAdminClientMock }));
vi.mock('../repositories/pushSubscription.repository.js', () => ({
  upsertPushSubscription: upsertPushSubscriptionMock,
  deletePushSubscription: deletePushSubscriptionMock,
}));

const { subscribePush, unsubscribePush } = await import('./pushSubscription.service.js');

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
