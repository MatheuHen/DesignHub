import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getUserMock, maybeSingleMock, listDesignersMock } = vi.hoisted(() => ({
  getUserMock: vi.fn(),
  maybeSingleMock: vi.fn(),
  listDesignersMock: vi.fn(),
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

vi.mock('../services/designer.service.js', () => ({
  listDesigners: listDesignersMock,
  getDesigner: vi.fn(),
  createDesigner: vi.fn(),
  updateDesigner: vi.fn(),
  changeDesignerStatus: vi.fn(),
}));

const { createApp } = await import('../app.js');

function mockAuthenticatedUser(profile: { perfil: 'designer' | 'administrador'; status: 'ativo' | 'inativo' }) {
  getUserMock.mockResolvedValue({ data: { user: { id: 'user-1', email: 'user@exemplo.com' } }, error: null });
  maybeSingleMock.mockResolvedValue({
    data: {
      perfil: profile.perfil,
      status: profile.status,
      nome_completo: 'Usuário Teste',
      email: 'user@exemplo.com',
    },
    error: null,
  });
}

describe('GET /api/designers — autorização por perfil (RF001/RF015)', () => {
  beforeEach(() => {
    getUserMock.mockReset();
    maybeSingleMock.mockReset();
    listDesignersMock.mockReset();
  });

  it('rejeita com 401 quando não há sessão', async () => {
    const response = await request(createApp()).get('/api/designers');
    expect(response.status).toBe(401);
  });

  it('rejeita com 403 quando o perfil autenticado é designer (autorização negativa)', async () => {
    mockAuthenticatedUser({ perfil: 'designer', status: 'ativo' });

    const response = await request(createApp())
      .get('/api/designers')
      .set('Authorization', 'Bearer token-designer');

    expect(response.status).toBe(403);
    expect(listDesignersMock).not.toHaveBeenCalled();
  });

  it('permite acesso e delega ao service quando o perfil é administrador', async () => {
    mockAuthenticatedUser({ perfil: 'administrador', status: 'ativo' });
    listDesignersMock.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 });

    const response = await request(createApp())
      .get('/api/designers')
      .set('Authorization', 'Bearer token-admin');

    expect(response.status).toBe(200);
    expect(listDesignersMock).toHaveBeenCalledOnce();
  });
});

describe('DELETE /api/designers/:id — ajuste do orientador (exclusão removida do fluxo operacional)', () => {
  it('não existe rota de exclusão de designer (404, mesmo autenticado como administrador)', async () => {
    mockAuthenticatedUser({ perfil: 'administrador', status: 'ativo' });

    const response = await request(createApp())
      .delete('/api/designers/designer-1')
      .set('Authorization', 'Bearer token-admin');

    expect(response.status).toBe(404);
  });
});
