import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { envMock, internalJobConfigStatusMock, notificarPublicacoesProximasMock } = vi.hoisted(() => ({
  envMock: { INTERNAL_JOB_SECRET: 'segredo-de-teste' },
  internalJobConfigStatusMock: { hasSecret: true },
  notificarPublicacoesProximasMock: vi.fn(),
}));

vi.mock('../config/env.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../config/env.js')>();
  return {
    ...actual,
    env: { ...actual.env, ...envMock },
    internalJobConfigStatus: internalJobConfigStatusMock,
  };
});

vi.mock('../services/publicacaoNotificacao.service.js', () => ({
  notificarPublicacoesProximas: notificarPublicacoesProximasMock,
}));

const { createApp } = await import('../app.js');

describe('POST /api/internal/notificacoes/processar (item 9)', () => {
  beforeEach(() => {
    internalJobConfigStatusMock.hasSecret = true;
    notificarPublicacoesProximasMock.mockReset();
  });

  it('retorna 503 quando INTERNAL_JOB_SECRET não está configurado (fail-closed)', async () => {
    internalJobConfigStatusMock.hasSecret = false;

    const response = await request(createApp())
      .post('/api/internal/notificacoes/processar')
      .set('X-Internal-Job-Secret', 'qualquer-valor');

    expect(response.status).toBe(503);
    expect(notificarPublicacoesProximasMock).not.toHaveBeenCalled();
  });

  it('retorna 401 sem o header do segredo', async () => {
    const response = await request(createApp()).post('/api/internal/notificacoes/processar');

    expect(response.status).toBe(401);
    expect(notificarPublicacoesProximasMock).not.toHaveBeenCalled();
  });

  it('retorna 401 com segredo incorreto', async () => {
    const response = await request(createApp())
      .post('/api/internal/notificacoes/processar')
      .set('X-Internal-Job-Secret', 'segredo-errado');

    expect(response.status).toBe(401);
    expect(notificarPublicacoesProximasMock).not.toHaveBeenCalled();
  });

  it('processa e retorna 200 com o segredo correto', async () => {
    notificarPublicacoesProximasMock.mockResolvedValue({ processados: 1, enviados: 1, semAssinatura: 0, falhas: 0 });

    const response = await request(createApp())
      .post('/api/internal/notificacoes/processar')
      .set('X-Internal-Job-Secret', 'segredo-de-teste');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ processados: 1, enviados: 1, semAssinatura: 0, falhas: 0 });
    expect(notificarPublicacoesProximasMock).toHaveBeenCalledOnce();
  });
});
