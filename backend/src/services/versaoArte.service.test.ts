import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConflictError, NotFoundError, ValidationError } from '../lib/errors.js';

const {
  getSupabaseAdminClientMock,
  getSolicitacaoCoreMock,
  syncDesignerBloqueioMock,
  uploadArquivoToStorageMock,
  removeArquivoFromStorageBestEffortMock,
  registerVersaoArteMock,
  getVersaoArteByIdAndSolicitacaoMock,
  createVersaoArteDownloadUrlMock,
} = vi.hoisted(() => ({
  getSupabaseAdminClientMock: vi.fn(() => ({ __kind: 'admin-client' })),
  getSolicitacaoCoreMock: vi.fn(),
  syncDesignerBloqueioMock: vi.fn(),
  uploadArquivoToStorageMock: vi.fn(),
  removeArquivoFromStorageBestEffortMock: vi.fn(),
  registerVersaoArteMock: vi.fn(),
  getVersaoArteByIdAndSolicitacaoMock: vi.fn(),
  createVersaoArteDownloadUrlMock: vi.fn(),
}));

vi.mock('../config/supabase.js', () => ({
  getSupabaseAdminClient: getSupabaseAdminClientMock,
}));

vi.mock('../repositories/solicitacao.repository.js', () => ({
  getSolicitacaoCore: getSolicitacaoCoreMock,
  syncDesignerBloqueio: syncDesignerBloqueioMock,
}));

vi.mock('../repositories/versaoArte.repository.js', () => ({
  uploadArquivoToStorage: uploadArquivoToStorageMock,
  removeArquivoFromStorageBestEffort: removeArquivoFromStorageBestEffortMock,
  registerVersaoArte: registerVersaoArteMock,
  getVersaoArteByIdAndSolicitacao: getVersaoArteByIdAndSolicitacaoMock,
  createVersaoArteDownloadUrl: createVersaoArteDownloadUrlMock,
}));

const { uploadVersaoArte, getVersaoArteDownloadUrl } = await import('./versaoArte.service.js');

const PDF_BYTES = Buffer.from('%PDF-1.4 conteúdo de teste');
const EXE_BYTES = Buffer.from('MZ conteúdo executável disfarçado de pdf');

describe('uploadVersaoArte (RF007/RF008)', () => {
  beforeEach(() => {
    getSolicitacaoCoreMock.mockReset();
    syncDesignerBloqueioMock.mockReset().mockResolvedValue(false);
    uploadArquivoToStorageMock.mockReset().mockResolvedValue(undefined);
    removeArquivoFromStorageBestEffortMock.mockReset().mockResolvedValue(undefined);
    registerVersaoArteMock.mockReset();
  });

  it('rejeita quando o conteúdo real do arquivo não corresponde a PDF/JPG/PNG (MIME real, seção 12.2)', async () => {
    await expect(
      uploadVersaoArte({} as never, 10, 'designer-1', { buffer: EXE_BYTES, observacoes: undefined }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(getSolicitacaoCoreMock).not.toHaveBeenCalled();
    expect(uploadArquivoToStorageMock).not.toHaveBeenCalled();
  });

  it('rejeita quando o callerId não é o dono da solicitação (defesa em profundidade além do RLS)', async () => {
    getSolicitacaoCoreMock.mockResolvedValue({
      idSolicitacao: 10,
      idDesigner: 'outro-designer',
      status: 'Em produção',
    });

    await expect(
      uploadVersaoArte({} as never, 10, 'designer-1', { buffer: PDF_BYTES, observacoes: undefined }),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(uploadArquivoToStorageMock).not.toHaveBeenCalled();
  });

  it('rejeita quando o status não permite novo envio (RN26)', async () => {
    getSolicitacaoCoreMock.mockResolvedValue({
      idSolicitacao: 10,
      idDesigner: 'designer-1',
      status: 'Aprovado',
    });

    await expect(
      uploadVersaoArte({} as never, 10, 'designer-1', { buffer: PDF_BYTES, observacoes: undefined }),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(uploadArquivoToStorageMock).not.toHaveBeenCalled();
  });

  it('envia o arquivo e registra a versão quando status = Em produção (1º envio, RN11)', async () => {
    getSolicitacaoCoreMock.mockResolvedValue({
      idSolicitacao: 10,
      idDesigner: 'designer-1',
      status: 'Em produção',
    });
    registerVersaoArteMock.mockResolvedValue({
      idVersao: 1,
      numeroVersao: 1,
      statusAnterior: 'Em produção',
    });

    const result = await uploadVersaoArte({} as never, 10, 'designer-1', {
      buffer: PDF_BYTES,
      observacoes: 'primeira versão',
    });

    expect(result).toEqual({ idVersao: 1, numeroVersao: 1, status: 'Enviado para avaliação' });
    expect(uploadArquivoToStorageMock).toHaveBeenCalledOnce();
    expect(registerVersaoArteMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ idSolicitacao: 10, idDesigner: 'designer-1', formato: 'PDF' }),
    );
    expect(syncDesignerBloqueioMock).toHaveBeenCalledWith(expect.anything(), 'designer-1');
  });

  it('permite novo envio quando status = Ajustes (RN25/RN26)', async () => {
    getSolicitacaoCoreMock.mockResolvedValue({
      idSolicitacao: 10,
      idDesigner: 'designer-1',
      status: 'Ajustes',
    });
    registerVersaoArteMock.mockResolvedValue({
      idVersao: 2,
      numeroVersao: 2,
      statusAnterior: 'Ajustes',
    });

    const result = await uploadVersaoArte({} as never, 10, 'designer-1', {
      buffer: PDF_BYTES,
      observacoes: undefined,
    });

    expect(result.numeroVersao).toBe(2);
  });

  it('remove o objeto do Storage (compensação) quando o registro da versão falha', async () => {
    getSolicitacaoCoreMock.mockResolvedValue({
      idSolicitacao: 10,
      idDesigner: 'designer-1',
      status: 'Em produção',
    });
    registerVersaoArteMock.mockRejectedValue(new ConflictError('corrida detectada'));

    await expect(
      uploadVersaoArte({} as never, 10, 'designer-1', { buffer: PDF_BYTES, observacoes: undefined }),
    ).rejects.toBeInstanceOf(ConflictError);

    expect(removeArquivoFromStorageBestEffortMock).toHaveBeenCalledOnce();
  });

  it('não propaga falha de sincronização do bloqueio (melhor-esforço)', async () => {
    getSolicitacaoCoreMock.mockResolvedValue({
      idSolicitacao: 10,
      idDesigner: 'designer-1',
      status: 'Em produção',
    });
    registerVersaoArteMock.mockResolvedValue({
      idVersao: 1,
      numeroVersao: 1,
      statusAnterior: 'Em produção',
    });
    syncDesignerBloqueioMock.mockRejectedValue(new Error('falha transitória'));

    await expect(
      uploadVersaoArte({} as never, 10, 'designer-1', { buffer: PDF_BYTES, observacoes: undefined }),
    ).resolves.toEqual({ idVersao: 1, numeroVersao: 1, status: 'Enviado para avaliação' });
  });
});

describe('getVersaoArteDownloadUrl (RF008, seção 12.5)', () => {
  beforeEach(() => {
    getSolicitacaoCoreMock.mockReset();
    getVersaoArteByIdAndSolicitacaoMock.mockReset();
    createVersaoArteDownloadUrlMock.mockReset();
  });

  it('rejeita quando o callerId não é o dono da solicitação', async () => {
    getSolicitacaoCoreMock.mockResolvedValue({
      idSolicitacao: 10,
      idDesigner: 'outro-designer',
      status: 'Enviado para avaliação',
    });

    await expect(
      getVersaoArteDownloadUrl({} as never, 10, 1, 'designer-1'),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(getVersaoArteByIdAndSolicitacaoMock).not.toHaveBeenCalled();
  });

  it('rejeita quando a versão não pertence à solicitação informada (IDOR)', async () => {
    getSolicitacaoCoreMock.mockResolvedValue({
      idSolicitacao: 10,
      idDesigner: 'designer-1',
      status: 'Enviado para avaliação',
    });
    getVersaoArteByIdAndSolicitacaoMock.mockResolvedValue(null);

    await expect(
      getVersaoArteDownloadUrl({} as never, 10, 999, 'designer-1'),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('gera URL assinada quando ownership e versão são válidos', async () => {
    getSolicitacaoCoreMock.mockResolvedValue({
      idSolicitacao: 10,
      idDesigner: 'designer-1',
      status: 'Enviado para avaliação',
    });
    getVersaoArteByIdAndSolicitacaoMock.mockResolvedValue({
      idVersao: 1,
      arquivoUrl: 'solicitacoes/10/versoes/arquivo.pdf',
    });
    createVersaoArteDownloadUrlMock.mockResolvedValue('https://exemplo.supabase.co/signed-url');

    const result = await getVersaoArteDownloadUrl({} as never, 10, 1, 'designer-1');

    expect(result).toEqual({
      url: 'https://exemplo.supabase.co/signed-url',
      expiresInSeconds: 300,
    });
  });
});
