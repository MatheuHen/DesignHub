import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { envMock, internalJobConfigStatusMock, processarAtendimentosExpiradosMock } = vi.hoisted(() => ({
  envMock: { INTERNAL_JOB_SECRET: 'segredo-de-teste' },
  internalJobConfigStatusMock: { hasSecret: true },
  processarAtendimentosExpiradosMock: vi.fn(),
}));

vi.mock('../config/env.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../config/env.js')>();
  return {
    ...actual,
    env: { ...actual.env, ...envMock },
    internalJobConfigStatus: internalJobConfigStatusMock,
  };
});

vi.mock('../services/atendimento.service.js', () => ({
  processInboundWebhook: vi.fn(),
  iniciarAtendimento: vi.fn(),
  processarAtendimentosExpirados: processarAtendimentosExpiradosMock,
}));

const { createApp } = await import('../app.js');

describe('POST /api/internal/atendimentos/processar (RN05/seção 11)', () => {
  beforeEach(() => {
    internalJobConfigStatusMock.hasSecret = true;
    processarAtendimentosExpiradosMock.mockReset();
  });

  it('retorna 503 quando INTERNAL_JOB_SECRET não está configurado (fail-closed)', async () => {
    internalJobConfigStatusMock.hasSecret = false;

    const response = await request(createApp())
      .post('/api/internal/atendimentos/processar')
      .set('X-Internal-Job-Secret', 'qualquer-valor');

    expect(response.status).toBe(503);
    expect(processarAtendimentosExpiradosMock).not.toHaveBeenCalled();
  });

  it('retorna 401 sem o header do segredo', async () => {
    const response = await request(createApp()).post('/api/internal/atendimentos/processar');

    expect(response.status).toBe(401);
    expect(processarAtendimentosExpiradosMock).not.toHaveBeenCalled();
  });

  it('retorna 401 com segredo incorreto', async () => {
    const response = await request(createApp())
      .post('/api/internal/atendimentos/processar')
      .set('X-Internal-Job-Secret', 'segredo-errado');

    expect(response.status).toBe(401);
    expect(processarAtendimentosExpiradosMock).not.toHaveBeenCalled();
  });

  it('processa e retorna 200 com o segredo correto', async () => {
    processarAtendimentosExpiradosMock.mockResolvedValue({ expirados: 2 });

    const response = await request(createApp())
      .post('/api/internal/atendimentos/processar')
      .set('X-Internal-Job-Secret', 'segredo-de-teste');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ expirados: 2 });
    expect(processarAtendimentosExpiradosMock).toHaveBeenCalledOnce();
  });
});
