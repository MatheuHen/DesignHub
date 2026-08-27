import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getUserMock, maybeSingleMock, listClientesMock } = vi.hoisted(() => ({
  getUserMock: vi.fn(),
  maybeSingleMock: vi.fn(),
  listClientesMock: vi.fn(),
}));

vi.mock('../config/supabase.js', () => ({
  getSupabasePublicClient: () => ({ auth: { getUser: getUserMock } }),
  getSupabaseUserClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: maybeSingleMock }),
      }),
    }),
  }),
}));

vi.mock('../services/cliente.service.js', () => ({
  listClientes: listClientesMock,
  getCliente: vi.fn(),
  createCliente: vi.fn(),
  updateCliente: vi.fn(),
  removeCliente: vi.fn(),
}));

const { gerarAutorizacaoInstagramUrlMock, getInstagramStatusMock, removerInstagramConexaoMock } = vi.hoisted(() => ({
  gerarAutorizacaoInstagramUrlMock: vi.fn(),
  getInstagramStatusMock: vi.fn(),
  removerInstagramConexaoMock: vi.fn(),
}));

vi.mock('../services/clienteInstagram.service.js', () => ({
  gerarAutorizacaoInstagramUrl: gerarAutorizacaoInstagramUrlMock,
  getInstagramStatus: getInstagramStatusMock,
  removerInstagramConexao: removerInstagramConexaoMock,
}));

const { createApp } = await import('../app.js');

function mockAuthenticatedUser(perfil: 'designer' | 'administrador') {
  getUserMock.mockResolvedValue({ data: { user: { id: 'user-1', email: 'user@exemplo.com' } }, error: null });
  maybeSingleMock.mockResolvedValue({
    data: { perfil, status: 'ativo', nome_completo: 'Usuário Teste', email: 'user@exemplo.com' },
    error: null,
  });
}

describe('GET /api/clientes — autorização por perfil (RF003)', () => {
  beforeEach(() => {
    getUserMock.mockReset();
    maybeSingleMock.mockReset();
    listClientesMock.mockReset();
  });

  it('rejeita com 403 quando o perfil autenticado é administrador (RF003 é exclusivo do Designer)', async () => {
    mockAuthenticatedUser('administrador');

    const response = await request(createApp())
      .get('/api/clientes')
      .set('Authorization', 'Bearer token-admin');

    expect(response.status).toBe(403);
    expect(listClientesMock).not.toHaveBeenCalled();
  });

  it('permite acesso e delega ao service quando o perfil é designer', async () => {
    mockAuthenticatedUser('designer');
    listClientesMock.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 });

    const response = await request(createApp())
      .get('/api/clientes')
      .set('Authorization', 'Bearer token-designer');

    expect(response.status).toBe(200);
    expect(listClientesMock).toHaveBeenCalledOnce();
  });
});

describe('/api/clientes/:id/instagram/* (RF014/ADR 0005)', () => {
  beforeEach(() => {
    getUserMock.mockReset();
    maybeSingleMock.mockReset();
    gerarAutorizacaoInstagramUrlMock.mockReset();
    getInstagramStatusMock.mockReset();
    removerInstagramConexaoMock.mockReset();
  });

  it('POST /:id/instagram/authorize-url é exclusivo do designer — administrador recebe 403', async () => {
    mockAuthenticatedUser('administrador');

    const response = await request(createApp())
      .post('/api/clientes/1/instagram/authorize-url')
      .set('Authorization', 'Bearer token-admin');

    expect(response.status).toBe(403);
    expect(gerarAutorizacaoInstagramUrlMock).not.toHaveBeenCalled();
  });

  it('POST /:id/instagram/authorize-url permite designer e devolve a URL', async () => {
    mockAuthenticatedUser('designer');
    gerarAutorizacaoInstagramUrlMock.mockResolvedValue({ url: 'https://www.instagram.com/oauth/authorize?state=abc' });

    const response = await request(createApp())
      .post('/api/clientes/1/instagram/authorize-url')
      .set('Authorization', 'Bearer token-designer');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ url: 'https://www.instagram.com/oauth/authorize?state=abc' });
    expect(gerarAutorizacaoInstagramUrlMock).toHaveBeenCalledWith(expect.anything(), 1, 'user-1');
  });

  it('GET /:id/instagram/status permite designer e devolve o status sem token', async () => {
    mockAuthenticatedUser('designer');
    getInstagramStatusMock.mockResolvedValue({ conectado: true, conectadoEm: '2026-08-20', expiraEm: '2026-10-19' });

    const response = await request(createApp())
      .get('/api/clientes/1/instagram/status')
      .set('Authorization', 'Bearer token-designer');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ conectado: true, conectadoEm: '2026-08-20', expiraEm: '2026-10-19' });
    expect(JSON.stringify(response.body)).not.toMatch(/token/i);
  });

  it('DELETE /:id/instagram/conexao é exclusivo do designer — administrador recebe 403', async () => {
    mockAuthenticatedUser('administrador');

    const response = await request(createApp())
      .delete('/api/clientes/1/instagram/conexao')
      .set('Authorization', 'Bearer token-admin');

    expect(response.status).toBe(403);
    expect(removerInstagramConexaoMock).not.toHaveBeenCalled();
  });

  it('DELETE /:id/instagram/conexao permite designer e delega ao service', async () => {
    mockAuthenticatedUser('designer');
    removerInstagramConexaoMock.mockResolvedValue(undefined);

    const response = await request(createApp())
      .delete('/api/clientes/1/instagram/conexao')
      .set('Authorization', 'Bearer token-designer');

    expect(response.status).toBe(204);
    expect(removerInstagramConexaoMock).toHaveBeenCalledWith(expect.anything(), 1);
  });
});
