import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';

const TEST_SECRET = 'test-app-secret';
const TEST_VERIFY_TOKEN = 'test-verify-token';

vi.mock('../../config/env.js', () => ({
  env: { META_APP_SECRET: TEST_SECRET, WHATSAPP_VERIFY_TOKEN: TEST_VERIFY_TOKEN },
  whatsappConfigStatus: { hasWebhookSecurity: true, hasSendingClient: true },
}));

const { verifyWebhookHandshake, verifyWebhookSignature } = await import('./webhookSignature.js');

function sign(rawBody: Buffer): string {
  return `sha256=${createHmac('sha256', TEST_SECRET).update(rawBody).digest('hex')}`;
}

describe('verifyWebhookSignature (RF004/seção 12.3)', () => {
  it('aceita assinatura HMAC válida', () => {
    const body = Buffer.from(JSON.stringify({ hello: 'world' }));
    expect(verifyWebhookSignature(body, sign(body))).toBe(true);
  });

  it('rejeita assinatura incorreta', () => {
    const body = Buffer.from(JSON.stringify({ hello: 'world' }));
    expect(verifyWebhookSignature(body, `sha256=${'a'.repeat(64)}`)).toBe(false);
  });

  it('rejeita quando o header está ausente', () => {
    const body = Buffer.from('{}');
    expect(verifyWebhookSignature(body, undefined)).toBe(false);
  });

  it('rejeita quando o corpo foi alterado após a assinatura (integridade)', () => {
    const original = Buffer.from(JSON.stringify({ hello: 'world' }));
    const signature = sign(original);
    const tampered = Buffer.from(JSON.stringify({ hello: 'mundo' }));
    expect(verifyWebhookSignature(tampered, signature)).toBe(false);
  });

  it('rejeita header sem o prefixo sha256=', () => {
    const body = Buffer.from('{}');
    expect(verifyWebhookSignature(body, 'plain-not-a-signature')).toBe(false);
  });
});

describe('verifyWebhookHandshake', () => {
  it('aceita mode=subscribe com token correto', () => {
    expect(verifyWebhookHandshake('subscribe', TEST_VERIFY_TOKEN)).toBe(true);
  });

  it('rejeita token incorreto', () => {
    expect(verifyWebhookHandshake('subscribe', 'token-errado')).toBe(false);
  });

  it('rejeita mode diferente de subscribe', () => {
    expect(verifyWebhookHandshake('unsubscribe', TEST_VERIFY_TOKEN)).toBe(false);
  });
});
