import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getUserMock, maybeSingleMock, listSolicitacoesMock, reassignSolicitacaoMock } = vi.hoisted(() => ({
  getUserMock: vi.fn(),
  maybeSingleMock: vi.fn(),
  listSolicitacoesMock: vi.fn(),
  reassignSolicitacaoMock: vi.fn(),
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

vi.mock('../services/solicitacao.service.js', () => ({
  listSolicitacoes: listSolicitacoesMock,
  getSolicitacaoDetail: vi.fn(),
  updateSolicitacao: vi.fn(),
}));

vi.mock('../services/designer.service.js', () => ({
  reassignSolicitacao: reassignSolicitacaoMock,
}));

const { uploadVersaoArteMock, getVersaoArteDownloadUrlMock } = vi.hoisted(() => ({
  uploadVersaoArteMock: vi.fn(),
  getVersaoArteDownloadUrlMock: vi.fn(),
}));

vi.mock('../services/versaoArte.service.js', () => ({
  uploadVersaoArte: uploadVersaoArteMock,
  getVersaoArteDownloadUrl: getVersaoArteDownloadUrlMock,
}));

const { gerarLinkAvaliacaoMock } = vi.hoisted(() => ({
  gerarLinkAvaliacaoMock: vi.fn(),
}));

vi.mock('../services/avaliacao.service.js', () => ({
  gerarLinkAvaliacao: gerarLinkAvaliacaoMock,
}));

const { createAgendamentoMock, updateAgendamentoMock, cancelAgendamentoMock } = vi.hoisted(() => ({
  createAgendamentoMock: vi.fn(),
  updateAgendamentoMock: vi.fn(),
  cancelAgendamentoMock: vi.fn(),
}));

vi.mock('../services/agendamento.service.js', () => ({
  createAgendamento: createAgendamentoMock,
  updateAgendamento: updateAgendamentoMock,
  cancelAgendamento: cancelAgendamentoMock,
}));

const { registrarPublicacaoManualMock } = vi.hoisted(() => ({
  registrarPublicacaoManualMock: vi.fn(),
}));

vi.mock('../services/publicacao.service.js', () => ({
  registrarPublicacaoManual: registrarPublicacaoManualMock,
}));

const { createApp } = await import('../app.js');

function mockAuthenticatedUser(perfil: 'designer' | 'administrador') {
  getUserMock.mockResolvedValue({ data: { user: { id: 'user-1', email: 'user@exemplo.com' } }, error: null });
  maybeSingleMock.mockResolvedValue({
    data: { perfil, status: 'ativo', nome_completo: 'Usuário Teste', email: 'user@exemplo.com' },
    error: null,
  });
}

describe('Autorização por perfil em /api/solicitacoes (RF005/RF016)', () => {
  beforeEach(() => {
    getUserMock.mockReset();
    maybeSingleMock.mockReset();
    listSolicitacoesMock.mockReset();
    reassignSolicitacaoMock.mockReset();
    uploadVersaoArteMock.mockReset();
    getVersaoArteDownloadUrlMock.mockReset();
    gerarLinkAvaliacaoMock.mockReset();
    createAgendamentoMock.mockReset();
    updateAgendamentoMock.mockReset();
    cancelAgendamentoMock.mockReset();
    registrarPublicacaoManualMock.mockReset();
  });

  it('GET / é exclusivo do designer — administrador recebe 403', async () => {
    mockAuthenticatedUser('administrador');

    const response = await request(createApp())
      .get('/api/solicitacoes')
      .set('Authorization', 'Bearer token-admin');

    expect(response.status).toBe(403);
    expect(listSolicitacoesMock).not.toHaveBeenCalled();
  });

  it('GET / permite designer e delega ao service', async () => {
    mockAuthenticatedUser('designer');
    listSolicitacoesMock.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 });

    const response = await request(createApp())
      .get('/api/solicitacoes')
      .set('Authorization', 'Bearer token-designer');

    expect(response.status).toBe(200);
    expect(listSolicitacoesMock).toHaveBeenCalledOnce();
  });

  it('GET /admin/todas é exclusivo do administrador — designer recebe 403', async () => {
    mockAuthenticatedUser('designer');

    const response = await request(createApp())
      .get('/api/solicitacoes/admin/todas')
      .set('Authorization', 'Bearer token-designer');

    expect(response.status).toBe(403);
    expect(listSolicitacoesMock).not.toHaveBeenCalled();
  });

  it('GET /admin/todas permite administrador e delega ao service (RF016)', async () => {
    mockAuthenticatedUser('administrador');
    listSolicitacoesMock.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 });

    const response = await request(createApp())
      .get('/api/solicitacoes/admin/todas')
      .set('Authorization', 'Bearer token-admin');

    expect(response.status).toBe(200);
    expect(listSolicitacoesMock).toHaveBeenCalledOnce();
  });

  it('PATCH /:id rejeita campos desconhecidos (mass assignment, ex.: status/id_designer)', async () => {
    mockAuthenticatedUser('designer');

    const response = await request(createApp())
      .patch('/api/solicitacoes/10')
      .set('Authorization', 'Bearer token-designer')
      .send({ tema: 'Novo tema', status: 'Aprovado' });

    expect(response.status).toBe(400);
  });

  it('POST /:id/versoes é exclusivo do designer — administrador recebe 403', async () => {
    mockAuthenticatedUser('administrador');

    const response = await request(createApp())
      .post('/api/solicitacoes/10/versoes')
      .set('Authorization', 'Bearer token-admin')
      .attach('arquivo', Buffer.from('%PDF-1.4 conteúdo'), {
        filename: 'arte.pdf',
        contentType: 'application/pdf',
      });

    expect(response.status).toBe(403);
    expect(uploadVersaoArteMock).not.toHaveBeenCalled();
  });

  it('POST /:id/versoes rejeita quando nenhum arquivo é anexado', async () => {
    mockAuthenticatedUser('designer');

    const response = await request(createApp())
      .post('/api/solicitacoes/10/versoes')
      .set('Authorization', 'Bearer token-designer')
      .field('observacoes', 'sem arquivo');

    expect(response.status).toBe(400);
    expect(uploadVersaoArteMock).not.toHaveBeenCalled();
  });

  it('POST /:id/versoes rejeita Content-Type não permitido antes de chamar o service', async () => {
    mockAuthenticatedUser('designer');

    const response = await request(createApp())
      .post('/api/solicitacoes/10/versoes')
      .set('Authorization', 'Bearer token-designer')
      .attach('arquivo', Buffer.from('executável disfarçado'), {
        filename: 'malware.exe',
        contentType: 'application/x-msdownload',
      });

    expect(response.status).toBe(400);
    expect(uploadVersaoArteMock).not.toHaveBeenCalled();
  });

  it('POST /:id/versoes permite designer, delega ao service e retorna 201', async () => {
    mockAuthenticatedUser('designer');
    uploadVersaoArteMock.mockResolvedValue({
      idVersao: 1,
      numeroVersao: 1,
      status: 'Enviado para avaliação',
    });

    const response = await request(createApp())
      .post('/api/solicitacoes/10/versoes')
      .set('Authorization', 'Bearer token-designer')
      .field('observacoes', 'primeira versão')
      .attach('arquivo', Buffer.from('%PDF-1.4 conteúdo'), {
        filename: 'arte.pdf',
        contentType: 'application/pdf',
      });

    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      idVersao: 1,
      numeroVersao: 1,
      status: 'Enviado para avaliação',
    });
    expect(uploadVersaoArteMock).toHaveBeenCalledOnce();
  });

  it('GET /:id/versoes/:versaoId/download-url é exclusivo do designer — administrador recebe 403', async () => {
    mockAuthenticatedUser('administrador');

    const response = await request(createApp())
      .get('/api/solicitacoes/10/versoes/1/download-url')
      .set('Authorization', 'Bearer token-admin');

    expect(response.status).toBe(403);
    expect(getVersaoArteDownloadUrlMock).not.toHaveBeenCalled();
  });

  it('GET /:id/versoes/:versaoId/download-url permite designer e delega ao service', async () => {
    mockAuthenticatedUser('designer');
    getVersaoArteDownloadUrlMock.mockResolvedValue({
      url: 'https://exemplo.supabase.co/signed-url',
      expiresInSeconds: 300,
    });

    const response = await request(createApp())
      .get('/api/solicitacoes/10/versoes/1/download-url')
      .set('Authorization', 'Bearer token-designer');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      url: 'https://exemplo.supabase.co/signed-url',
      expiresInSeconds: 300,
    });
    expect(getVersaoArteDownloadUrlMock).toHaveBeenCalledWith(expect.anything(), 10, 1, 'user-1');
  });

  it('POST /:id/link-avaliacao é exclusivo do designer — administrador recebe 403', async () => {
    mockAuthenticatedUser('administrador');

    const response = await request(createApp())
      .post('/api/solicitacoes/10/link-avaliacao')
      .set('Authorization', 'Bearer token-admin');

    expect(response.status).toBe(403);
    expect(gerarLinkAvaliacaoMock).not.toHaveBeenCalled();
  });

  it('POST /:id/link-avaliacao permite designer e delega ao service', async () => {
    mockAuthenticatedUser('designer');
    gerarLinkAvaliacaoMock.mockResolvedValue({
      url: 'https://app.exemplo.com/avaliacao/token',
      expiresAt: '2026-01-08T00:00:00Z',
      whatsappNotified: true,
    });

    const response = await request(createApp())
      .post('/api/solicitacoes/10/link-avaliacao')
      .set('Authorization', 'Bearer token-designer');

    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      url: 'https://app.exemplo.com/avaliacao/token',
      expiresAt: '2026-01-08T00:00:00Z',
      whatsappNotified: true,
    });
    expect(gerarLinkAvaliacaoMock).toHaveBeenCalledWith(expect.anything(), 10, 'user-1');
  });

  it('POST /:id/agendamento é exclusivo do designer — administrador recebe 403', async () => {
    mockAuthenticatedUser('administrador');

    const response = await request(createApp())
      .post('/api/solicitacoes/10/agendamento')
      .set('Authorization', 'Bearer token-admin')
      .send({ dataPublicacao: '2026-09-01', horario: '10:00', legenda: 'Legenda' });

    expect(response.status).toBe(403);
    expect(createAgendamentoMock).not.toHaveBeenCalled();
  });

  it('POST /:id/agendamento rejeita corpo sem data/horário (400)', async () => {
    mockAuthenticatedUser('designer');

    const response = await request(createApp())
      .post('/api/solicitacoes/10/agendamento')
      .set('Authorization', 'Bearer token-designer')
      .send({ legenda: 'Legenda' });

    expect(response.status).toBe(400);
    expect(createAgendamentoMock).not.toHaveBeenCalled();
  });

  it('POST /:id/agendamento rejeita data/horário fora de faixa mesmo com formato sintaticamente correto (400)', async () => {
    mockAuthenticatedUser('designer');

    const response = await request(createApp())
      .post('/api/solicitacoes/10/agendamento')
      .set('Authorization', 'Bearer token-designer')
      .send({ dataPublicacao: '2026-13-45', horario: '25:99' });

    expect(response.status).toBe(400);
    expect(createAgendamentoMock).not.toHaveBeenCalled();
  });

  it('POST /:id/agendamento permite designer e delega ao service', async () => {
    mockAuthenticatedUser('designer');
    createAgendamentoMock.mockResolvedValue({ idAgendamento: 7 });

    const response = await request(createApp())
      .post('/api/solicitacoes/10/agendamento')
      .set('Authorization', 'Bearer token-designer')
      .send({ dataPublicacao: '2026-09-01', horario: '10:00', legenda: 'Legenda' });

    expect(response.status).toBe(201);
    expect(response.body).toEqual({ idAgendamento: 7 });
    expect(createAgendamentoMock).toHaveBeenCalledWith(
      expect.anything(),
      10,
      'user-1',
      expect.objectContaining({ dataPublicacao: '2026-09-01', horario: '10:00', legenda: 'Legenda' }),
    );
  });

  it('PATCH /:id/agendamento é exclusivo do designer — administrador recebe 403', async () => {
    mockAuthenticatedUser('administrador');

    const response = await request(createApp())
      .patch('/api/solicitacoes/10/agendamento')
      .set('Authorization', 'Bearer token-admin')
      .send({ dataPublicacao: '2026-09-02', horario: '11:00' });

    expect(response.status).toBe(403);
    expect(updateAgendamentoMock).not.toHaveBeenCalled();
  });

  it('PATCH /:id/agendamento permite designer e delega ao service', async () => {
    mockAuthenticatedUser('designer');
    updateAgendamentoMock.mockResolvedValue(undefined);

    const response = await request(createApp())
      .patch('/api/solicitacoes/10/agendamento')
      .set('Authorization', 'Bearer token-designer')
      .send({ dataPublicacao: '2026-09-02', horario: '11:00' });

    expect(response.status).toBe(204);
    expect(updateAgendamentoMock).toHaveBeenCalledWith(
      expect.anything(),
      10,
      'user-1',
      expect.objectContaining({ dataPublicacao: '2026-09-02', horario: '11:00' }),
    );
  });

  it('DELETE /:id/agendamento é exclusivo do designer — administrador recebe 403', async () => {
    mockAuthenticatedUser('administrador');

    const response = await request(createApp())
      .delete('/api/solicitacoes/10/agendamento')
      .set('Authorization', 'Bearer token-admin');

    expect(response.status).toBe(403);
    expect(cancelAgendamentoMock).not.toHaveBeenCalled();
  });

  it('DELETE /:id/agendamento permite designer e delega ao service', async () => {
    mockAuthenticatedUser('designer');
    cancelAgendamentoMock.mockResolvedValue(undefined);

    const response = await request(createApp())
      .delete('/api/solicitacoes/10/agendamento')
      .set('Authorization', 'Bearer token-designer');

    expect(response.status).toBe(204);
    expect(cancelAgendamentoMock).toHaveBeenCalledWith(expect.anything(), 10, 'user-1');
  });

  it('POST /:id/publicacao-manual é exclusivo do designer — administrador recebe 403', async () => {
    mockAuthenticatedUser('administrador');

    const response = await request(createApp())
      .post('/api/solicitacoes/10/publicacao-manual')
      .set('Authorization', 'Bearer token-admin');

    expect(response.status).toBe(403);
    expect(registrarPublicacaoManualMock).not.toHaveBeenCalled();
  });

  it('POST /:id/publicacao-manual permite designer e delega ao service', async () => {
    mockAuthenticatedUser('designer');
    registrarPublicacaoManualMock.mockResolvedValue(undefined);

    const response = await request(createApp())
      .post('/api/solicitacoes/10/publicacao-manual')
      .set('Authorization', 'Bearer token-designer');

    expect(response.status).toBe(204);
    expect(registrarPublicacaoManualMock).toHaveBeenCalledWith(expect.anything(), 10, 'user-1');
  });

  it('PATCH /:id/reatribuir é exclusivo do administrador — designer recebe 403', async () => {
    mockAuthenticatedUser('designer');

    const response = await request(createApp())
      .patch('/api/solicitacoes/10/reatribuir')
      .set('Authorization', 'Bearer token-designer')
      .send({ novoDesignerId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' });

    expect(response.status).toBe(403);
    expect(reassignSolicitacaoMock).not.toHaveBeenCalled();
  });

  it('PATCH /:id/reatribuir permite administrador e delega ao service', async () => {
    mockAuthenticatedUser('administrador');
    reassignSolicitacaoMock.mockResolvedValue(undefined);

    const response = await request(createApp())
      .patch('/api/solicitacoes/10/reatribuir')
      .set('Authorization', 'Bearer token-admin')
      .send({ novoDesignerId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' });

    expect(response.status).toBe(204);
    expect(reassignSolicitacaoMock).toHaveBeenCalledOnce();
  });
});
