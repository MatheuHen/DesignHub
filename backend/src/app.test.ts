import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from './app.js';

interface HealthResponseBody {
  status: string;
  service: string;
  dependencies: {
    supabasePublicClient: 'configured' | 'missing';
    supabaseAdminClient: 'configured' | 'missing';
    whatsappSendingClient: 'configured' | 'missing';
    whatsappWebhookSecurity: 'configured' | 'missing';
    webPushVapidKeys: 'configured' | 'missing';
    geminiClassifier: 'configured' | 'missing';
  };
}

describe('GET /api/health', () => {
  it('retorna o estado mínimo da API sem expor configuração', async () => {
    const response = await request(createApp()).get('/api/health');
    const body = response.body as HealthResponseBody;

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      status: 'ok',
      service: 'designhub-api',
    });
    expect(body.dependencies).toEqual({
      supabasePublicClient: expect.stringMatching(/^(configured|missing)$/) as unknown,
      supabaseAdminClient: expect.stringMatching(/^(configured|missing)$/) as unknown,
      whatsappSendingClient: expect.stringMatching(/^(configured|missing)$/) as unknown,
      whatsappWebhookSecurity: expect.stringMatching(/^(configured|missing)$/) as unknown,
      webPushVapidKeys: expect.stringMatching(/^(configured|missing)$/) as unknown,
      geminiClassifier: expect.stringMatching(/^(configured|missing)$/) as unknown,
    });
  });
});

describe('Correção de segurança — botão voltar/cache não pode reexibir dados protegidos', () => {
  it('toda resposta da API inclui Cache-Control: no-store', async () => {
    const response = await request(createApp()).get('/api/health');

    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('inclui no-store mesmo em respostas de erro (401 sem token)', async () => {
    const response = await request(createApp()).get('/api/clientes');

    expect(response.status).toBe(401);
    expect(response.headers['cache-control']).toBe('no-store');
  });
});
