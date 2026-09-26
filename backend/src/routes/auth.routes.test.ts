import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getUserMock, maybeSingleMock, syncDesignerBloqueioMock } = vi.hoisted(() => ({
  getUserMock: vi.fn(),
  maybeSingleMock: vi.fn(),
  syncDesignerBloqueioMock: vi.fn(),
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
  getSupabaseAdminClient: () => ({ __kind: 'admin-client' }),
}));

vi.mock('../repositories/solicitacao.repository.js', () => ({
  syncDesignerBloqueio: syncDesignerBloqueioMock,
}));

const { createApp } = await import('../app.js');

function mockUser(perfil: 'designer' | 'administrador') {
  getUserMock.mockResolvedValue({ data: { user: { id: 'user-1', email: 'user@exemplo.com' } }, error: null });
  maybeSingleMock.mockResolvedValue({
    data: { perfil, status: 'ativo', nome_completo: 'Nome Teste', email: 'user@exemplo.com' },
    error: null,
  });
}

describe('GET /api/auth/me (RF002/RF006)', () => {
  beforeEach(() => {
    getUserMock.mockReset();
    maybeSingleMock.mockReset();
    syncDesignerBloqueioMock.mockReset();
  });

  it('inclui bloqueado=false quando o designer não está bloqueado', async () => {
    mockUser('designer');
    syncDesignerBloqueioMock.mockResolvedValue(false);

    const response = await request(createApp()).get('/api/auth/me').set('Authorization', 'Bearer tok');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ perfil: 'designer', bloqueado: false });
  });

  it('inclui bloqueado=true quando o designer está bloqueado por solicitação vencida (RF006), recalculado ao vivo (item 5.1)', async () => {
    mockUser('designer');
    syncDesignerBloqueioMock.mockResolvedValue(true);

    const response = await request(createApp()).get('/api/auth/me').set('Authorization', 'Bearer tok');
    const body = response.body as { bloqueado: boolean | null };

    expect(body.bloqueado).toBe(true);
    expect(syncDesignerBloqueioMock).toHaveBeenCalledWith(expect.anything(), 'user-1');
  });

  it('não consulta bloqueio e retorna bloqueado=null para administrador', async () => {
    mockUser('administrador');

    const response = await request(createApp()).get('/api/auth/me').set('Authorization', 'Bearer tok');
    const body = response.body as { bloqueado: boolean | null };

    expect(body.bloqueado).toBeNull();
    expect(syncDesignerBloqueioMock).not.toHaveBeenCalled();
  });
});
