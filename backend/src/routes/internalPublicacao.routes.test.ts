import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { envMock, internalJobConfigStatusMock, processarAgendamentosVencidosMock } = vi.hoisted(() => ({
  envMock: { INTERNAL_JOB_SECRET: 'segredo-de-teste' },
  internalJobConfigStatusMock: { hasSecret: true },
  processarAgendamentosVencidosMock: vi.fn(),
}));

vi.mock('../config/env.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../config/env.js')>();
  return {
    ...actual,
    env: { ...actual.env, ...envMock },
    internalJobConfigStatus: internalJobConfigStatusMock,
  };
});

vi.mock('../services/publicacao.service.js', () => ({
  processarAgendamentosVencidos: processarAgendamentosVencidosMock,
}));

const { createApp } = await import('../app.js');

describe('POST /api/internal/publicacoes/processar (RF014/seção 11)', () => {
  beforeEach(() => {
    internalJobConfigStatusMock.hasSecret = true;
    processarAgendamentosVencidosMock.mockReset();
  });

  it('retorna 503 quando INTERNAL_JOB_SECRET não está configurado (fail-closed)', async () => {
    internalJobConfigStatusMock.hasSecret = false;

    const response = await request(createApp())
      .post('/api/internal/publicacoes/processar')
      .set('X-Internal-Job-Secret', 'qualquer-valor');

    expect(response.status).toBe(503);
    expect(processarAgendamentosVencidosMock).not.toHaveBeenCalled();
  });

  it('retorna 401 sem o header do segredo', async () => {
    const response = await request(createApp()).post('/api/internal/publicacoes/processar');

    expect(response.status).toBe(401);
    expect(processarAgendamentosVencidosMock).not.toHaveBeenCalled();
  });

  it('retorna 401 com segredo incorreto', async () => {
    const response = await request(createApp())
      .post('/api/internal/publicacoes/processar')
      .set('X-Internal-Job-Secret', 'segredo-errado');

    expect(response.status).toBe(401);
    expect(processarAgendamentosVencidosMock).not.toHaveBeenCalled();
  });

  it('processa e retorna 200 com o segredo correto', async () => {
    processarAgendamentosVencidosMock.mockResolvedValue({
      processados: 1,
      publicadosAutomaticamente: 1,
      falhas: 0,
      pendentesParaManual: 0,
    });

    const response = await request(createApp())
      .post('/api/internal/publicacoes/processar')
      .set('X-Internal-Job-Secret', 'segredo-de-teste');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      processados: 1,
      publicadosAutomaticamente: 1,
      falhas: 0,
      pendentesParaManual: 0,
    });
    expect(processarAgendamentosVencidosMock).toHaveBeenCalledOnce();
  });
});
