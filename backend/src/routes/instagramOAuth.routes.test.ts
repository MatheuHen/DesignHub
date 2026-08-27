import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConflictError } from '../lib/errors.js';

const { processarCallbackInstagramMock } = vi.hoisted(() => ({
  processarCallbackInstagramMock: vi.fn(),
}));

vi.mock('../services/clienteInstagram.service.js', () => ({
  processarCallbackInstagram: processarCallbackInstagramMock,
}));

const { createApp } = await import('../app.js');

describe('GET /api/instagram/oauth/callback (RF014/ADR 0005 — rota pública)', () => {
  beforeEach(() => {
    processarCallbackInstagramMock.mockReset();
  });

  it('redireciona com instagram=erro quando a Meta retorna erro (usuário negou acesso)', async () => {
    const response = await request(createApp()).get(
      '/api/instagram/oauth/callback?error=access_denied&state=abc',
    );

    expect(response.status).toBe(302);
    expect(response.headers.location).toContain('instagram=erro');
    expect(processarCallbackInstagramMock).not.toHaveBeenCalled();
  });

  it('redireciona com instagram=erro quando faltam code/state', async () => {
    const response = await request(createApp()).get('/api/instagram/oauth/callback');

    expect(response.status).toBe(302);
    expect(response.headers.location).toContain('instagram=erro');
  });

  it('redireciona com instagram=erro quando o state é inválido/expirado — nunca expõe detalhe técnico na URL', async () => {
    processarCallbackInstagramMock.mockRejectedValue(new ConflictError('link de conexão inválido'));

    const response = await request(createApp()).get(
      '/api/instagram/oauth/callback?code=abc&state=invalido',
    );

    expect(response.status).toBe(302);
    expect(response.headers.location).toContain('instagram=erro');
    expect(response.headers.location).not.toMatch(/invalido|link de conexão/);
  });

  it('redireciona com instagram=conectado quando o callback é processado com sucesso', async () => {
    processarCallbackInstagramMock.mockResolvedValue({ idCliente: 7 });

    const response = await request(createApp()).get(
      '/api/instagram/oauth/callback?code=abc&state=valido',
    );

    expect(response.status).toBe(302);
    expect(response.headers.location).toContain('instagram=conectado');
    expect(processarCallbackInstagramMock).toHaveBeenCalledWith('valido', 'abc');
  });
});
