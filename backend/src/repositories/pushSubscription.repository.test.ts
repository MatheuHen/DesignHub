import { describe, expect, it, vi } from 'vitest';
import {
  deletePushSubscription,
  deletePushSubscriptionByEndpoint,
  listPushSubscriptionsByDesigner,
  upsertPushSubscription,
} from './pushSubscription.repository.js';

type AnyClient = Parameters<typeof upsertPushSubscription>[0];

describe('upsertPushSubscription (item 9)', () => {
  it('faz upsert por id_usuario+endpoint', async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const client = { from: () => ({ upsert }) } as unknown as AnyClient;

    await upsertPushSubscription(client, {
      idUsuario: 'designer-1',
      endpoint: 'https://push.example/abc',
      p256dh: 'p256dh-value',
      authKey: 'auth-value',
    });

    expect(upsert).toHaveBeenCalledWith(
      {
        id_usuario: 'designer-1',
        endpoint: 'https://push.example/abc',
        p256dh: 'p256dh-value',
        auth_key: 'auth-value',
      },
      { onConflict: 'id_usuario,endpoint' },
    );
  });

  it('propaga erro do banco', async () => {
    const client = { from: () => ({ upsert: () => Promise.resolve({ error: { message: 'falhou' } }) }) } as unknown as AnyClient;

    await expect(
      upsertPushSubscription(client, { idUsuario: 'designer-1', endpoint: 'x', p256dh: 'y', authKey: 'z' }),
    ).rejects.toThrow(/falhou/);
  });
});

describe('deletePushSubscription (item 9)', () => {
  it('remove só a assinatura do próprio designer (ownership por id_usuario)', async () => {
    const eqEndpoint = vi.fn().mockResolvedValue({ error: null });
    const eqUsuario = vi.fn(() => ({ eq: eqEndpoint }));
    const client = { from: () => ({ delete: () => ({ eq: eqUsuario }) }) } as unknown as AnyClient;

    await deletePushSubscription(client, 'designer-1', 'https://push.example/abc');

    expect(eqUsuario).toHaveBeenCalledWith('id_usuario', 'designer-1');
    expect(eqEndpoint).toHaveBeenCalledWith('endpoint', 'https://push.example/abc');
  });
});

describe('deletePushSubscriptionByEndpoint (item 9)', () => {
  it('remove pelo endpoint (usado quando o navegador revoga a assinatura)', async () => {
    const eq = vi.fn().mockResolvedValue({ error: null });
    const client = { from: () => ({ delete: () => ({ eq }) }) } as unknown as AnyClient;

    await deletePushSubscriptionByEndpoint(client, 'https://push.example/abc');

    expect(eq).toHaveBeenCalledWith('endpoint', 'https://push.example/abc');
  });
});

describe('listPushSubscriptionsByDesigner (item 9)', () => {
  it('mapeia as linhas retornadas', async () => {
    const eq = vi.fn().mockResolvedValue({
      data: [{ endpoint: 'https://push.example/abc', p256dh: 'p', auth_key: 'a' }],
      error: null,
    });
    const client = { from: () => ({ select: () => ({ eq }) }) } as unknown as AnyClient;

    await expect(listPushSubscriptionsByDesigner(client, 'designer-1')).resolves.toEqual([
      { idUsuario: 'designer-1', endpoint: 'https://push.example/abc', p256dh: 'p', authKey: 'a' },
    ]);
  });

  it('retorna lista vazia quando não há assinatura', async () => {
    const eq = vi.fn().mockResolvedValue({ data: [], error: null });
    const client = { from: () => ({ select: () => ({ eq }) }) } as unknown as AnyClient;

    await expect(listPushSubscriptionsByDesigner(client, 'designer-1')).resolves.toEqual([]);
  });
});
