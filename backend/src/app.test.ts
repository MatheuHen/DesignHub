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
    });
  });
});
