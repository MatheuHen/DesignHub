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

const { removeDesignerMock, changeDesignerPasswordMock, changeDesignerStatusMock, listPendenciasDesignerMock } =
  vi.hoisted(() => ({
    removeDesignerMock: vi.fn(),
    changeDesignerPasswordMock: vi.fn(),
    changeDesignerStatusMock: vi.fn(),
    listPendenciasDesignerMock: vi.fn(),
  }));

vi.mock('../services/designer.service.js', () => ({
  listDesigners: listDesignersMock,
  getDesigner: vi.fn(),
  createDesigner: vi.fn(),
  updateDesigner: vi.fn(),
  changeDesignerStatus: changeDesignerStatusMock,
  listPendenciasDesigner: listPendenciasDesignerMock,
  removeDesigner: removeDesignerMock,
  changeDesignerPassword: changeDesignerPasswordMock,
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

describe('DELETE /api/designers/:id — item 2.4 (correções 13/09/2026): exclusão ADITIVA ao Ativo/Inativo', () => {
  const VALID_ID = '11111111-1111-4111-8111-111111111111';

  beforeEach(() => {
    removeDesignerMock.mockReset();
  });

  it('rejeita com 403 quando o perfil autenticado não é administrador', async () => {
    mockAuthenticatedUser({ perfil: 'designer', status: 'ativo' });

    const response = await request(createApp())
      .delete(`/api/designers/${VALID_ID}`)
      .set('Authorization', 'Bearer token-designer');

    expect(response.status).toBe(403);
    expect(removeDesignerMock).not.toHaveBeenCalled();
  });

  it('exclui e retorna 204 quando o admin confirma e não há impedimento histórico', async () => {
    mockAuthenticatedUser({ perfil: 'administrador', status: 'ativo' });
    removeDesignerMock.mockResolvedValue(undefined);

    const response = await request(createApp())
      .delete(`/api/designers/${VALID_ID}`)
      .set('Authorization', 'Bearer token-admin');

    expect(response.status).toBe(204);
    expect(removeDesignerMock).toHaveBeenCalledWith('user-1', VALID_ID);
  });

  it('retorna 409 quando o designer tem cliente/solicitação vinculados (impedimento histórico)', async () => {
    mockAuthenticatedUser({ perfil: 'administrador', status: 'ativo' });
    const { ConflictError } = await import('../lib/errors.js');
    removeDesignerMock.mockRejectedValue(
      new ConflictError('Não é possível excluir: designer possui clientes ou solicitações vinculados. Reatribua-os antes de excluir.'),
    );

    const response = await request(createApp())
      .delete(`/api/designers/${VALID_ID}`)
      .set('Authorization', 'Bearer token-admin');

    expect(response.status).toBe(409);
  });
});

describe('PATCH /api/designers/:id/senha — item 2.1 (correções 13/09/2026): admin altera senha do designer', () => {
  const VALID_ID = '22222222-2222-4222-8222-222222222222';

  beforeEach(() => {
    changeDesignerPasswordMock.mockReset();
  });

  it('rejeita com 403 quando o perfil autenticado não é administrador', async () => {
    mockAuthenticatedUser({ perfil: 'designer', status: 'ativo' });

    const response = await request(createApp())
      .patch(`/api/designers/${VALID_ID}/senha`)
      .set('Authorization', 'Bearer token-designer')
      .send({ novaSenha: 'senha1234', confirmarSenha: 'senha1234' });

    expect(response.status).toBe(403);
    expect(changeDesignerPasswordMock).not.toHaveBeenCalled();
  });

  it('rejeita com 400 quando as senhas não coincidem', async () => {
    mockAuthenticatedUser({ perfil: 'administrador', status: 'ativo' });

    const response = await request(createApp())
      .patch(`/api/designers/${VALID_ID}/senha`)
      .set('Authorization', 'Bearer token-admin')
      .send({ novaSenha: 'senha1234', confirmarSenha: 'outrasenha' });

    expect(response.status).toBe(400);
    expect(changeDesignerPasswordMock).not.toHaveBeenCalled();
  });

  it('altera a senha e retorna 204 quando o admin confirma com senhas coincidentes', async () => {
    mockAuthenticatedUser({ perfil: 'administrador', status: 'ativo' });
    changeDesignerPasswordMock.mockResolvedValue(undefined);

    const response = await request(createApp())
      .patch(`/api/designers/${VALID_ID}/senha`)
      .set('Authorization', 'Bearer token-admin')
      .send({ novaSenha: 'senha1234', confirmarSenha: 'senha1234' });

    expect(response.status).toBe(204);
    expect(changeDesignerPasswordMock).toHaveBeenCalledWith('user-1', VALID_ID, 'senha1234');
  });
});

describe('PATCH /api/designers/:id/status — item 4 (rodada final): estratégia obrigatória com pendências', () => {
  const VALID_ID = '33333333-3333-4333-8333-333333333333';

  beforeEach(() => {
    changeDesignerStatusMock.mockReset();
  });

  it('rejeita com 403 quando o perfil autenticado não é administrador', async () => {
    mockAuthenticatedUser({ perfil: 'designer', status: 'ativo' });

    const response = await request(createApp())
      .patch(`/api/designers/${VALID_ID}/status`)
      .set('Authorization', 'Bearer token-designer')
      .send({ status: 'inativo' });

    expect(response.status).toBe(403);
    expect(changeDesignerStatusMock).not.toHaveBeenCalled();
  });

  it('retorna 204 e repassa atorId/estratégia ao service quando não há pendências', async () => {
    mockAuthenticatedUser({ perfil: 'administrador', status: 'ativo' });
    changeDesignerStatusMock.mockResolvedValue({});

    const response = await request(createApp())
      .patch(`/api/designers/${VALID_ID}/status`)
      .set('Authorization', 'Bearer token-admin')
      .send({ status: 'inativo' });

    expect(response.status).toBe(204);
    expect(changeDesignerStatusMock).toHaveBeenCalledWith('user-1', VALID_ID, { status: 'inativo' });
  });

  it('retorna 409 com a lista de pendências quando o service não recebe estratégia e existem pendências', async () => {
    mockAuthenticatedUser({ perfil: 'administrador', status: 'ativo' });
    changeDesignerStatusMock.mockResolvedValue({
      pendencias: [{ idSolicitacao: 1, clienteNome: 'Waynne', tema: 'Post', status: 'Em produção', atrasada: true }],
    });

    const response = await request(createApp())
      .patch(`/api/designers/${VALID_ID}/status`)
      .set('Authorization', 'Bearer token-admin')
      .send({ status: 'inativo' });

    const body = response.body as { error: string; pendencias: unknown[] };
    expect(response.status).toBe(409);
    expect(body.error).toBe('DESIGNER_PENDENCIAS');
    expect(body.pendencias).toHaveLength(1);
  });

  it('aceita a estratégia "reatribuir_pendentes" com a lista de reatribuições', async () => {
    mockAuthenticatedUser({ perfil: 'administrador', status: 'ativo' });
    changeDesignerStatusMock.mockResolvedValue({});

    const response = await request(createApp())
      .patch(`/api/designers/${VALID_ID}/status`)
      .set('Authorization', 'Bearer token-admin')
      .send({
        status: 'inativo',
        estrategia: 'reatribuir_pendentes',
        reatribuicoes: [{ idSolicitacao: 1, novoDesignerId: VALID_ID }],
      });

    expect(response.status).toBe(204);
  });
});

describe('GET /api/designers/:id/pendencias — item 4 (rodada final)', () => {
  const VALID_ID = '44444444-4444-4444-8444-444444444444';

  beforeEach(() => {
    listPendenciasDesignerMock.mockReset();
  });

  it('rejeita com 403 quando o perfil autenticado não é administrador', async () => {
    mockAuthenticatedUser({ perfil: 'designer', status: 'ativo' });

    const response = await request(createApp())
      .get(`/api/designers/${VALID_ID}/pendencias`)
      .set('Authorization', 'Bearer token-designer');

    expect(response.status).toBe(403);
    expect(listPendenciasDesignerMock).not.toHaveBeenCalled();
  });

  it('devolve a lista de pendências para o administrador', async () => {
    mockAuthenticatedUser({ perfil: 'administrador', status: 'ativo' });
    listPendenciasDesignerMock.mockResolvedValue([
      { idSolicitacao: 1, clienteNome: 'Waynne', tema: 'Post', status: 'Em produção', atrasada: true },
    ]);

    const response = await request(createApp())
      .get(`/api/designers/${VALID_ID}/pendencias`)
      .set('Authorization', 'Bearer token-admin');

    const body = response.body as { items: unknown[] };
    expect(response.status).toBe(200);
    expect(body.items).toHaveLength(1);
  });
});
