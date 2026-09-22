import { describe, expect, it } from 'vitest';
import { subscribePushSchema, unsubscribePushSchema } from './pushSubscription.schemas.js';

describe('subscribePushSchema (item 9)', () => {
  it('aceita um PushSubscriptionJSON válido', () => {
    const result = subscribePushSchema.safeParse({
      endpoint: 'https://push.example/abc',
      keys: { p256dh: 'p', auth: 'a' },
    });
    expect(result.success).toBe(true);
  });

  it('rejeita endpoint que não é uma URL', () => {
    const result = subscribePushSchema.safeParse({ endpoint: 'não-é-url', keys: { p256dh: 'p', auth: 'a' } });
    expect(result.success).toBe(false);
  });

  it('rejeita campo desconhecido (mass assignment)', () => {
    const result = subscribePushSchema.safeParse({
      endpoint: 'https://push.example/abc',
      keys: { p256dh: 'p', auth: 'a' },
      idUsuario: 'outro-designer',
    });
    expect(result.success).toBe(false);
  });

  it('rejeita sem keys.auth', () => {
    const result = subscribePushSchema.safeParse({ endpoint: 'https://push.example/abc', keys: { p256dh: 'p' } });
    expect(result.success).toBe(false);
  });
});

describe('unsubscribePushSchema (item 9)', () => {
  it('aceita um endpoint válido', () => {
    expect(unsubscribePushSchema.safeParse({ endpoint: 'https://push.example/abc' }).success).toBe(true);
  });
});
