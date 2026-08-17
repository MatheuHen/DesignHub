import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConflictError, ExpiredLinkError, NotFoundError, ValidationError } from '../lib/errors.js';

const { getAvaliacaoPreviewMock, submitAvaliacaoDecisaoMock } = vi.hoisted(() => ({
  getAvaliacaoPreviewMock: vi.fn(),
  submitAvaliacaoDecisaoMock: vi.fn(),
}));

vi.mock('../services/avaliacao.service.js', () => ({
  getAvaliacaoPreview: getAvaliacaoPreviewMock,
  submitAvaliacaoDecisao: submitAvaliacaoDecisaoMock,
}));

const { createApp } = await import('../app.js');

const VALID_TOKEN = 'a'.repeat(64);

describe('rotas públicas /api/avaliacao (RF009/RF010)', () => {
  beforeEach(() => {
    getAvaliacaoPreviewMock.mockReset();
    submitAvaliacaoDecisaoMock.mockReset();
  });

  it('GET /:token rejeita token malformado antes de chamar o service', async () => {
    const response = await request(createApp()).get('/api/avaliacao/token-invalido');

    expect(response.status).toBe(400);
    expect(getAvaliacaoPreviewMock).not.toHaveBeenCalled();
  });

  it('GET /:token retorna 200 com o estado do link mesmo quando inválido/expirado (corpo comunica o estado)', async () => {
    getAvaliacaoPreviewMock.mockResolvedValue({ state: 'expired' });

    const response = await request(createApp()).get(`/api/avaliacao/${VALID_TOKEN}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ state: 'expired' });
  });

  it('GET /:token retorna a prévia completa quando o link é válido', async () => {
    getAvaliacaoPreviewMock.mockResolvedValue({
      state: 'valid',
      tema: 'Post promocional',
      numeroVersao: 1,
      formato: 'PDF',
      observacoes: null,
      downloadUrl: 'https://exemplo.supabase.co/signed',
      expiresInSeconds: 300,
    });

    const response = await request(createApp()).get(`/api/avaliacao/${VALID_TOKEN}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      state: 'valid',
      tema: 'Post promocional',
      numeroVersao: 1,
      formato: 'PDF',
      observacoes: null,
      downloadUrl: 'https://exemplo.supabase.co/signed',
      expiresInSeconds: 300,
    });
  });

  it('POST /:token aprova sem exigir arquivo', async () => {
    submitAvaliacaoDecisaoMock.mockResolvedValue({ idSolicitacao: 10, statusNovo: 'Aprovado' });

    const response = await request(createApp())
      .post(`/api/avaliacao/${VALID_TOKEN}`)
      .field('decisao', 'Aprovado');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ idSolicitacao: 10, statusNovo: 'Aprovado' });
  });

  it('POST /:token rejeita decisao=Ajustes sem descrição (RF010)', async () => {
    const response = await request(createApp())
      .post(`/api/avaliacao/${VALID_TOKEN}`)
      .field('decisao', 'Ajustes');

    expect(response.status).toBe(400);
    expect(submitAvaliacaoDecisaoMock).not.toHaveBeenCalled();
  });

  it('POST /:token aceita Ajustes com descrição e referência opcional', async () => {
    submitAvaliacaoDecisaoMock.mockResolvedValue({ idSolicitacao: 10, statusNovo: 'Ajustes' });

    const response = await request(createApp())
      .post(`/api/avaliacao/${VALID_TOKEN}`)
      .field('decisao', 'Ajustes')
      .field('descricao', 'Mudar a cor de fundo')
      .attach('referencia', Buffer.from('%PDF-1.4 referência'), {
        filename: 'ref.pdf',
        contentType: 'application/pdf',
      });

    expect(response.status).toBe(200);
    expect(submitAvaliacaoDecisaoMock).toHaveBeenCalledWith(
      VALID_TOKEN,
      expect.objectContaining({ decisao: 'Ajustes', descricao: 'Mudar a cor de fundo' }),
    );
  });

  it('POST /:token retorna 404 quando o service rejeita como link inválido', async () => {
    submitAvaliacaoDecisaoMock.mockRejectedValue(new NotFoundError('Link de avaliação inválido.'));

    const response = await request(createApp())
      .post(`/api/avaliacao/${VALID_TOKEN}`)
      .field('decisao', 'Aprovado');

    expect(response.status).toBe(404);
  });

  it('POST /:token retorna 410 quando o link está expirado', async () => {
    submitAvaliacaoDecisaoMock.mockRejectedValue(new ExpiredLinkError('Link de avaliação expirado.'));

    const response = await request(createApp())
      .post(`/api/avaliacao/${VALID_TOKEN}`)
      .field('decisao', 'Aprovado');

    expect(response.status).toBe(410);
  });

  it('POST /:token retorna 409 quando o link já foi utilizado', async () => {
    submitAvaliacaoDecisaoMock.mockRejectedValue(new ConflictError('Link de avaliação já utilizado.'));

    const response = await request(createApp())
      .post(`/api/avaliacao/${VALID_TOKEN}`)
      .field('decisao', 'Aprovado');

    expect(response.status).toBe(409);
  });

  it('POST /:token retorna 400 quando a referência não é um PDF/JPG/PNG real', async () => {
    submitAvaliacaoDecisaoMock.mockRejectedValue(
      new ValidationError('Formato de arquivo de referência não suportado. Envie PDF, JPG ou PNG.'),
    );

    const response = await request(createApp())
      .post(`/api/avaliacao/${VALID_TOKEN}`)
      .field('decisao', 'Ajustes')
      .field('descricao', 'Mudar a cor de fundo')
      .attach('referencia', Buffer.from('MZ executável disfarçado'), {
        filename: 'ref.pdf',
        contentType: 'application/pdf',
      });

    expect(response.status).toBe(400);
  });
});
