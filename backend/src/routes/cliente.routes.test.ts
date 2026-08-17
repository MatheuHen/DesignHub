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
