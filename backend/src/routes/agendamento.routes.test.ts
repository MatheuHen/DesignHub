import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getUserMock, maybeSingleMock, listAgendamentosMock } = vi.hoisted(() => ({
  getUserMock: vi.fn(),
  maybeSingleMock: vi.fn(),
  listAgendamentosMock: vi.fn(),
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

vi.mock('../services/agendamento.service.js', () => ({
  listAgendamentos: listAgendamentosMock,
}));

const { createApp } = await import('../app.js');

function mockAuthenticatedUser(perfil: 'designer' | 'administrador') {
  getUserMock.mockResolvedValue({ data: { user: { id: 'user-1', email: 'user@exemplo.com' } }, error: null });
  maybeSingleMock.mockResolvedValue({
    data: { perfil, status: 'ativo', nome_completo: 'Usuário Teste', email: 'user@exemplo.com' },
    error: null,
  });
}

describe('GET /api/agendamentos (RF012)', () => {
  beforeEach(() => {
    getUserMock.mockReset();
    maybeSingleMock.mockReset();
    listAgendamentosMock.mockReset();
  });

  it('é exclusivo do designer — administrador recebe 403', async () => {
    mockAuthenticatedUser('administrador');

    const response = await request(createApp())
      .get('/api/agendamentos')
      .set('Authorization', 'Bearer token-admin');

    expect(response.status).toBe(403);
    expect(listAgendamentosMock).not.toHaveBeenCalled();
  });

  it('permite designer e delega ao service com os filtros', async () => {
    mockAuthenticatedUser('designer');
    listAgendamentosMock.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 });

    const response = await request(createApp())
      .get('/api/agendamentos?status=Agendado')
      .set('Authorization', 'Bearer token-designer');

    expect(response.status).toBe(200);
    expect(listAgendamentosMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ status: 'Agendado' }),
    );
  });

  it('rejeita status desconhecido com 400', async () => {
    mockAuthenticatedUser('designer');

    const response = await request(createApp())
      .get('/api/agendamentos?status=Inexistente')
      .set('Authorization', 'Bearer token-designer');

    expect(response.status).toBe(400);
    expect(listAgendamentosMock).not.toHaveBeenCalled();
  });
});
