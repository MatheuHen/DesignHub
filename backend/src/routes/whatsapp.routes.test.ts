import { createHmac } from 'node:crypto';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const TEST_SECRET = 'test-app-secret';
const TEST_VERIFY_TOKEN = 'test-verify-token';

const { processInboundWebhookMock } = vi.hoisted(() => ({
  processInboundWebhookMock: vi.fn(),
}));

vi.mock('../config/env.js', () => ({
  env: {
    NODE_ENV: 'test',
    PORT: 3001,
    FRONTEND_URL: 'http://localhost:5173',
    META_APP_SECRET: TEST_SECRET,
    WHATSAPP_VERIFY_TOKEN: TEST_VERIFY_TOKEN,
  },
  supabaseConfigStatus: { hasPublicClient: false, hasAdminClient: false },
  whatsappConfigStatus: { hasWebhookSecurity: true, hasSendingClient: false },
}));

vi.mock('../services/atendimento.service.js', () => ({
  processInboundWebhook: processInboundWebhookMock,
  iniciarAtendimento: vi.fn(),
}));

const { createApp } = await import('../app.js');

function sign(rawBody: string): string {
  return `sha256=${createHmac('sha256', TEST_SECRET).update(rawBody).digest('hex')}`;
}

const validPayload = {
  object: 'whatsapp_business_account',
  entry: [
    {
      changes: [
        {
          field: 'messages',
          value: { messages: [{ from: '5511999999999', id: 'wamid.1', type: 'text', text: { body: 'oi' } }] },
        },
      ],
    },
  ],
};

describe('Webhook WhatsApp (RF004/seção 12.3)', () => {
  beforeEach(() => {
    processInboundWebhookMock.mockReset().mockResolvedValue(undefined);
  });

  it('GET aceita o handshake com hub.verify_token correto', async () => {
    const response = await request(createApp())
      .get('/api/webhooks/whatsapp')
      .query({ 'hub.mode': 'subscribe', 'hub.verify_token': TEST_VERIFY_TOKEN, 'hub.challenge': 'abc123' });

    expect(response.status).toBe(200);
    expect(response.text).toBe('abc123');
  });

  it('GET rejeita hub.verify_token incorreto', async () => {
    const response = await request(createApp())
      .get('/api/webhooks/whatsapp')
      .query({ 'hub.mode': 'subscribe', 'hub.verify_token': 'token-errado', 'hub.challenge': 'abc123' });

    expect(response.status).toBe(403);
  });

  it('POST rejeita payload sem assinatura X-Hub-Signature-256', async () => {
    const response = await request(createApp()).post('/api/webhooks/whatsapp').send(validPayload);

    expect(response.status).toBe(401);
    expect(processInboundWebhookMock).not.toHaveBeenCalled();
  });

  it('POST rejeita payload com assinatura inválida', async () => {
    const response = await request(createApp())
      .post('/api/webhooks/whatsapp')
      .set('X-Hub-Signature-256', 'sha256=0000000000000000000000000000000000000000000000000000000000000000')
      .send(validPayload);

    expect(response.status).toBe(401);
    expect(processInboundWebhookMock).not.toHaveBeenCalled();
  });

  it('POST aceita e processa payload com assinatura válida', async () => {
    const rawBody = JSON.stringify(validPayload);
    const response = await request(createApp())
      .post('/api/webhooks/whatsapp')
      .set('Content-Type', 'application/json')
      .set('X-Hub-Signature-256', sign(rawBody))
      .send(rawBody);

    expect(response.status).toBe(200);
    expect(processInboundWebhookMock).toHaveBeenCalledOnce();
  });
});
