import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConflictError, ValidationError } from '../lib/errors.js';

const {
  processarCallbackInstagramMock,
  processarDeauthorizeInstagramMock,
  processarSolicitacaoExclusaoInstagramMock,
  getStatusExclusaoInstagramMock,
} = vi.hoisted(() => ({
  processarCallbackInstagramMock: vi.fn(),
  processarDeauthorizeInstagramMock: vi.fn(),
  processarSolicitacaoExclusaoInstagramMock: vi.fn(),
  getStatusExclusaoInstagramMock: vi.fn(),
}));

vi.mock('../services/clienteInstagram.service.js', () => ({
  processarCallbackInstagram: processarCallbackInstagramMock,
  processarDeauthorizeInstagram: processarDeauthorizeInstagramMock,
  processarSolicitacaoExclusaoInstagram: processarSolicitacaoExclusaoInstagramMock,
  getStatusExclusaoInstagram: getStatusExclusaoInstagramMock,
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

describe('POST /api/instagram/oauth/deauthorize (item A1 — Deauthorize Callback exigido pela Meta)', () => {
  beforeEach(() => {
    processarDeauthorizeInstagramMock.mockReset();
  });

  it('rejeita quando o corpo não tem signed_request', async () => {
    const response = await request(createApp())
      .post('/api/instagram/oauth/deauthorize')
      .type('form')
      .send({});

    expect(response.status).toBe(400);
    expect(processarDeauthorizeInstagramMock).not.toHaveBeenCalled();
  });

  it('rejeita (400) quando a assinatura é inválida — nunca expõe detalhe técnico', async () => {
    processarDeauthorizeInstagramMock.mockRejectedValue(new ValidationError('Assinatura inválida.'));

    const response = await request(createApp())
      .post('/api/instagram/oauth/deauthorize')
      .type('form')
      .send({ signed_request: 'assinatura.payload' });

    expect(response.status).toBe(400);
    expect(JSON.stringify(response.body)).not.toContain('Assinatura inválida');
  });

  it('processa e responde 200 quando a assinatura é válida', async () => {
    processarDeauthorizeInstagramMock.mockResolvedValue(undefined);

    const response = await request(createApp())
      .post('/api/instagram/oauth/deauthorize')
      .type('form')
      .send({ signed_request: 'assinatura.payload' });

    expect(response.status).toBe(200);
    expect(processarDeauthorizeInstagramMock).toHaveBeenCalledWith('assinatura.payload');
  });

  it('idempotente: reentrega do mesmo evento continua respondendo 200', async () => {
    processarDeauthorizeInstagramMock.mockResolvedValue(undefined);

    const primeira = await request(createApp())
      .post('/api/instagram/oauth/deauthorize')
      .type('form')
      .send({ signed_request: 'assinatura.payload' });
    const segunda = await request(createApp())
      .post('/api/instagram/oauth/deauthorize')
      .type('form')
      .send({ signed_request: 'assinatura.payload' });

    expect(primeira.status).toBe(200);
    expect(segunda.status).toBe(200);
  });
});

describe('POST /api/instagram/oauth/data-deletion (item A2 — Data Deletion Request Callback exigido pela Meta)', () => {
  beforeEach(() => {
    processarSolicitacaoExclusaoInstagramMock.mockReset();
  });

  it('rejeita quando o corpo não tem signed_request', async () => {
    const response = await request(createApp())
      .post('/api/instagram/oauth/data-deletion')
      .type('form')
      .send({});

    expect(response.status).toBe(400);
    expect(processarSolicitacaoExclusaoInstagramMock).not.toHaveBeenCalled();
  });

  it('rejeita (400) quando a assinatura é inválida', async () => {
    processarSolicitacaoExclusaoInstagramMock.mockRejectedValue(new ValidationError('Assinatura inválida.'));

    const response = await request(createApp())
      .post('/api/instagram/oauth/data-deletion')
      .type('form')
      .send({ signed_request: 'assinatura.payload' });

    expect(response.status).toBe(400);
  });

  it('responde no formato exigido pela Meta: { url, confirmation_code }', async () => {
    processarSolicitacaoExclusaoInstagramMock.mockResolvedValue({
      confirmationCode: 'codigo-abc',
      url: 'https://api.designhub.test/api/instagram/oauth/data-deletion/status?id=codigo-abc',
    });

    const response = await request(createApp())
      .post('/api/instagram/oauth/data-deletion')
      .type('form')
      .send({ signed_request: 'assinatura.payload' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      url: 'https://api.designhub.test/api/instagram/oauth/data-deletion/status?id=codigo-abc',
      confirmation_code: 'codigo-abc',
    });
  });
});

describe('GET /api/instagram/oauth/data-deletion/status (item A2 — página de acompanhamento)', () => {
  beforeEach(() => {
    getStatusExclusaoInstagramMock.mockReset();
  });

  it('200 quando o pedido existe e foi concluído', async () => {
    getStatusExclusaoInstagramMock.mockResolvedValue('concluido');

    const response = await request(createApp()).get('/api/instagram/oauth/data-deletion/status?id=codigo-abc');

    expect(response.status).toBe(200);
    expect(getStatusExclusaoInstagramMock).toHaveBeenCalledWith('codigo-abc');
  });

  it('404 quando o confirmation_code não existe', async () => {
    getStatusExclusaoInstagramMock.mockResolvedValue('nao_encontrado');

    const response = await request(createApp()).get('/api/instagram/oauth/data-deletion/status?id=inexistente');

    expect(response.status).toBe(404);
  });

  it('400 quando o parâmetro id está ausente', async () => {
    const response = await request(createApp()).get('/api/instagram/oauth/data-deletion/status');

    expect(response.status).toBe(400);
    expect(getStatusExclusaoInstagramMock).not.toHaveBeenCalled();
  });
});
