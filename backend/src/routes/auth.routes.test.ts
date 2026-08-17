import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getUserMock, maybeSingleMock, getDesignerByIdMock } = vi.hoisted(() => ({
  getUserMock: vi.fn(),
  maybeSingleMock: vi.fn(),
  getDesignerByIdMock: vi.fn(),
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

vi.mock('../repositories/designer.repository.js', () => ({
  getDesignerById: getDesignerByIdMock,
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
    getDesignerByIdMock.mockReset();
  });

  it('inclui bloqueado=false quando o designer não está bloqueado', async () => {
    mockUser('designer');
    getDesignerByIdMock.mockResolvedValue({
      id: 'user-1',
      nomeCompleto: 'Nome Teste',
      email: 'user@exemplo.com',
      status: 'ativo',
      whatsapp: null,
      bloqueado: false,
      statusOperacional: null,
    });

    const response = await request(createApp()).get('/api/auth/me').set('Authorization', 'Bearer tok');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ perfil: 'designer', bloqueado: false });
  });

  it('inclui bloqueado=true quando o designer está bloqueado por solicitação vencida (RF006)', async () => {
    mockUser('designer');
    getDesignerByIdMock.mockResolvedValue({
      id: 'user-1',
      nomeCompleto: 'Nome Teste',
      email: 'user@exemplo.com',
      status: 'ativo',
      whatsapp: null,
      bloqueado: true,
      statusOperacional: null,
    });

    const response = await request(createApp()).get('/api/auth/me').set('Authorization', 'Bearer tok');
    const body = response.body as { bloqueado: boolean | null };

    expect(body.bloqueado).toBe(true);
  });

  it('não consulta bloqueio e retorna bloqueado=null para administrador', async () => {
    mockUser('administrador');

    const response = await request(createApp()).get('/api/auth/me').set('Authorization', 'Bearer tok');
    const body = response.body as { bloqueado: boolean | null };

    expect(body.bloqueado).toBeNull();
    expect(getDesignerByIdMock).not.toHaveBeenCalled();
  });
});
