import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConflictError, ExpiredLinkError, NotFoundError, ValidationError } from '../lib/errors.js';

const {
  getSupabaseAdminClientMock,
  sendTextMessageMock,
  findClienteByIdMock,
  getSolicitacaoDetailRepoMock,
  generateAvaliacaoLinkTokenMock,
  getAvaliacaoLinkStateMock,
  getVersaoArtePreviewMock,
  submitAvaliacaoMock,
  uploadArquivoToStorageMock,
  removeArquivoFromStorageBestEffortMock,
  createVersaoArteDownloadUrlMock,
} = vi.hoisted(() => ({
  getSupabaseAdminClientMock: vi.fn(() => ({ __kind: 'admin-client' })),
  sendTextMessageMock: vi.fn(),
  findClienteByIdMock: vi.fn(),
  getSolicitacaoDetailRepoMock: vi.fn(),
  generateAvaliacaoLinkTokenMock: vi.fn(),
  getAvaliacaoLinkStateMock: vi.fn(),
  getVersaoArtePreviewMock: vi.fn(),
  submitAvaliacaoMock: vi.fn(),
  uploadArquivoToStorageMock: vi.fn(),
  removeArquivoFromStorageBestEffortMock: vi.fn(),
  createVersaoArteDownloadUrlMock: vi.fn(),
}));

vi.mock('../config/supabase.js', () => ({ getSupabaseAdminClient: getSupabaseAdminClientMock }));
vi.mock('../config/env.js', () => ({ env: { FRONTEND_URL: 'https://app.exemplo.com' } }));
vi.mock('../integrations/whatsapp/whatsappClient.js', () => ({ sendTextMessage: sendTextMessageMock }));
vi.mock('../repositories/atendimento.repository.js', () => ({ findClienteById: findClienteByIdMock }));
vi.mock('../repositories/solicitacao.repository.js', () => ({
  getSolicitacaoDetail: getSolicitacaoDetailRepoMock,
}));
vi.mock('../repositories/avaliacao.repository.js', () => ({
  generateAvaliacaoLinkToken: generateAvaliacaoLinkTokenMock,
  getAvaliacaoLinkState: getAvaliacaoLinkStateMock,
  getVersaoArtePreview: getVersaoArtePreviewMock,
  submitAvaliacao: submitAvaliacaoMock,
}));
vi.mock('../repositories/versaoArte.repository.js', () => ({
  uploadArquivoToStorage: uploadArquivoToStorageMock,
  removeArquivoFromStorageBestEffort: removeArquivoFromStorageBestEffortMock,
  createVersaoArteDownloadUrl: createVersaoArteDownloadUrlMock,
}));

const { gerarLinkAvaliacao, getAvaliacaoPreview, submitAvaliacaoDecisao } = await import(
  './avaliacao.service.js'
);

const PDF_BYTES = Buffer.from('%PDF-1.4 conteúdo de teste');

describe('gerarLinkAvaliacao (RF009/RN19)', () => {
  beforeEach(() => {
    getSolicitacaoDetailRepoMock.mockReset();
    findClienteByIdMock.mockReset();
    generateAvaliacaoLinkTokenMock.mockReset().mockResolvedValue({ idVersao: 1, numeroVersao: 1 });
    sendTextMessageMock.mockReset();
  });

  it('rejeita quando o callerId não é o dono da solicitação', async () => {
    getSolicitacaoDetailRepoMock.mockResolvedValue({
      idDesigner: 'outro-designer',
      status: 'Enviado para avaliação',
      idCliente: 1,
    });

    await expect(gerarLinkAvaliacao({} as never, 10, 'designer-1')).rejects.toBeInstanceOf(NotFoundError);
    expect(generateAvaliacaoLinkTokenMock).not.toHaveBeenCalled();
  });

  it('rejeita quando o status não é "Enviado para avaliação"', async () => {
    getSolicitacaoDetailRepoMock.mockResolvedValue({
      idDesigner: 'designer-1',
      status: 'Em produção',
      idCliente: 1,
    });

    await expect(gerarLinkAvaliacao({} as never, 10, 'designer-1')).rejects.toBeInstanceOf(ConflictError);
  });

  it('gera o link e reporta sucesso do WhatsApp sem mascarar falha', async () => {
    getSolicitacaoDetailRepoMock.mockResolvedValue({
      idDesigner: 'designer-1',
      status: 'Enviado para avaliação',
      idCliente: 1,
    });
    findClienteByIdMock.mockResolvedValue({ id: 1, whatsapp: '5511999999999' });
    sendTextMessageMock.mockResolvedValue({ wamid: 'abc' });

    const result = await gerarLinkAvaliacao({} as never, 10, 'designer-1');

    expect(result.whatsappNotified).toBe(true);
    expect(result.whatsappError).toBeUndefined();
    expect(result.url).toMatch(/^https:\/\/app\.exemplo\.com\/avaliacao\/[0-9a-f]{64}$/);
  });

  it('reporta explicitamente quando o envio via WhatsApp falha (não mascara erro)', async () => {
    getSolicitacaoDetailRepoMock.mockResolvedValue({
      idDesigner: 'designer-1',
      status: 'Enviado para avaliação',
      idCliente: 1,
    });
    findClienteByIdMock.mockResolvedValue({ id: 1, whatsapp: '5511999999999' });
    sendTextMessageMock.mockRejectedValue(new Error('WhatsApp indisponível'));

    const result = await gerarLinkAvaliacao({} as never, 10, 'designer-1');

    expect(result.whatsappNotified).toBe(false);
    expect(result.whatsappError).toBe('WhatsApp indisponível');
    expect(result.url).toContain('/avaliacao/');
  });
});

describe('getAvaliacaoPreview (RF009 — leitura pública)', () => {
  beforeEach(() => {
    getAvaliacaoLinkStateMock.mockReset();
    getVersaoArtePreviewMock.mockReset();
    createVersaoArteDownloadUrlMock.mockReset();
  });

  it('retorna apenas o estado quando o link não é válido', async () => {
    getAvaliacaoLinkStateMock.mockResolvedValue({ state: 'expired', idVersao: null });

    await expect(getAvaliacaoPreview('a'.repeat(64))).resolves.toEqual({ state: 'expired' });
    expect(getVersaoArtePreviewMock).not.toHaveBeenCalled();
  });

  it('retorna a prévia completa com URL assinada quando o link é válido', async () => {
    getAvaliacaoLinkStateMock.mockResolvedValue({ state: 'valid', idVersao: 5 });
    getVersaoArtePreviewMock.mockResolvedValue({
      idSolicitacao: 10,
      numeroVersao: 2,
      formato: 'PDF',
      observacoes: null,
      arquivoUrl: 'solicitacoes/10/versoes/x.pdf',
      tema: 'Post promocional',
    });
    createVersaoArteDownloadUrlMock.mockResolvedValue('https://exemplo.supabase.co/signed');

    const result = await getAvaliacaoPreview('a'.repeat(64));

    expect(result).toEqual({
      state: 'valid',
      tema: 'Post promocional',
      numeroVersao: 2,
      formato: 'PDF',
      observacoes: null,
      downloadUrl: 'https://exemplo.supabase.co/signed',
      expiresInSeconds: 300,
    });
    expect(createVersaoArteDownloadUrlMock).toHaveBeenCalledWith(
      expect.anything(),
      'solicitacoes/10/versoes/x.pdf',
      300,
      false,
    );
  });
});

describe('submitAvaliacaoDecisao (RF009/RF010)', () => {
  beforeEach(() => {
    getAvaliacaoLinkStateMock.mockReset();
    getVersaoArtePreviewMock.mockReset();
    submitAvaliacaoMock.mockReset();
    uploadArquivoToStorageMock.mockReset().mockResolvedValue(undefined);
    removeArquivoFromStorageBestEffortMock.mockReset().mockResolvedValue(undefined);
  });

  it('rejeita quando o link já foi utilizado', async () => {
    getAvaliacaoLinkStateMock.mockResolvedValue({ state: 'used', idVersao: null });

    await expect(
      submitAvaliacaoDecisao('a'.repeat(64), {
        decisao: 'Aprovado',
        descricao: undefined,
        observacoes: undefined,
        referenciaBuffer: undefined,
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('rejeita quando o link está expirado', async () => {
    getAvaliacaoLinkStateMock.mockResolvedValue({ state: 'expired', idVersao: null });

    await expect(
      submitAvaliacaoDecisao('a'.repeat(64), {
        decisao: 'Aprovado',
        descricao: undefined,
        observacoes: undefined,
        referenciaBuffer: undefined,
      }),
    ).rejects.toBeInstanceOf(ExpiredLinkError);
  });

  it('rejeita quando o link é inválido', async () => {
    getAvaliacaoLinkStateMock.mockResolvedValue({ state: 'invalid', idVersao: null });

    await expect(
      submitAvaliacaoDecisao('a'.repeat(64), {
        decisao: 'Aprovado',
        descricao: undefined,
        observacoes: undefined,
        referenciaBuffer: undefined,
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('rejeita referência com conteúdo que não é PDF/JPG/PNG real (MIME real)', async () => {
    getAvaliacaoLinkStateMock.mockResolvedValue({ state: 'valid', idVersao: 5 });
    getVersaoArtePreviewMock.mockResolvedValue({
      idSolicitacao: 10,
      numeroVersao: 2,
      formato: 'PDF',
      observacoes: null,
      arquivoUrl: 'x',
      tema: null,
    });

    await expect(
      submitAvaliacaoDecisao('a'.repeat(64), {
        decisao: 'Ajustes',
        descricao: 'Mudar a cor de fundo',
        observacoes: undefined,
        referenciaBuffer: Buffer.from('MZ executável disfarçado'),
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(uploadArquivoToStorageMock).not.toHaveBeenCalled();
  });

  it('envia a referência ao Storage e submete a decisão de Ajustes', async () => {
    getAvaliacaoLinkStateMock.mockResolvedValue({ state: 'valid', idVersao: 5 });
    getVersaoArtePreviewMock.mockResolvedValue({
      idSolicitacao: 10,
      numeroVersao: 2,
      formato: 'PDF',
      observacoes: null,
      arquivoUrl: 'x',
      tema: null,
    });
    submitAvaliacaoMock.mockResolvedValue({ idSolicitacao: 10, statusNovo: 'Ajustes', numeroVersao: 2 });

    const result = await submitAvaliacaoDecisao('a'.repeat(64), {
      decisao: 'Ajustes',
      descricao: 'Mudar a cor de fundo',
      observacoes: undefined,
      referenciaBuffer: PDF_BYTES,
    });

    expect(result).toEqual({ idSolicitacao: 10, statusNovo: 'Ajustes' });
    expect(uploadArquivoToStorageMock).toHaveBeenCalledOnce();
    expect(submitAvaliacaoMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ decisao: 'Ajustes', descricaoAjuste: 'Mudar a cor de fundo' }),
    );
  });

  it('submete Aprovado sem referência (não toca o Storage)', async () => {
    getAvaliacaoLinkStateMock.mockResolvedValue({ state: 'valid', idVersao: 5 });
    submitAvaliacaoMock.mockResolvedValue({ idSolicitacao: 10, statusNovo: 'Aprovado', numeroVersao: 2 });

    const result = await submitAvaliacaoDecisao('a'.repeat(64), {
      decisao: 'Aprovado',
      descricao: undefined,
      observacoes: undefined,
      referenciaBuffer: undefined,
    });

    expect(result).toEqual({ idSolicitacao: 10, statusNovo: 'Aprovado' });
    expect(getVersaoArtePreviewMock).not.toHaveBeenCalled();
    expect(uploadArquivoToStorageMock).not.toHaveBeenCalled();
  });

  it('remove o objeto do Storage (compensação) quando a RPC falha após enviar a referência', async () => {
    getAvaliacaoLinkStateMock.mockResolvedValue({ state: 'valid', idVersao: 5 });
    getVersaoArtePreviewMock.mockResolvedValue({
      idSolicitacao: 10,
      numeroVersao: 2,
      formato: 'PDF',
      observacoes: null,
      arquivoUrl: 'x',
      tema: null,
    });
    submitAvaliacaoMock.mockRejectedValue(new ConflictError('token já utilizado por outra requisição'));

    await expect(
      submitAvaliacaoDecisao('a'.repeat(64), {
        decisao: 'Ajustes',
        descricao: 'Mudar a cor de fundo',
        observacoes: undefined,
        referenciaBuffer: PDF_BYTES,
      }),
    ).rejects.toBeInstanceOf(ConflictError);

    expect(removeArquivoFromStorageBestEffortMock).toHaveBeenCalledOnce();
  });
});
