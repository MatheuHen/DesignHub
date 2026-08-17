import { describe, expect, it, vi } from 'vitest';
import { ConflictError, NotFoundError } from '../lib/errors.js';
import {
  createVersaoArteDownloadUrl,
  getVersaoArteByIdAndSolicitacao,
  registerVersaoArte,
} from './versaoArte.repository.js';

function rpcClient(response: { data: unknown; error: { message: string; code?: string } | null }) {
  return { rpc: () => Promise.resolve(response) } as unknown as Parameters<typeof registerVersaoArte>[0];
}

describe('registerVersaoArte (RF007/RF008 — chamada da RPC atômica)', () => {
  it('mapeia erro P0002 (solicitação não encontrada/não pertence ao designer) para NotFoundError', async () => {
    const client = rpcClient({ data: null, error: { message: 'não encontrada', code: 'P0002' } });
    await expect(
      registerVersaoArte(client, {
        idSolicitacao: 1,
        idDesigner: 'designer-1',
        arquivoPath: 'x',
        formato: 'PDF',
        observacoes: undefined,
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('mapeia erro P0001 (status não permite novo envio) para ConflictError', async () => {
    const client = rpcClient({ data: null, error: { message: 'status inválido', code: 'P0001' } });
    await expect(
      registerVersaoArte(client, {
        idSolicitacao: 1,
        idDesigner: 'designer-1',
        arquivoPath: 'x',
        formato: 'PDF',
        observacoes: undefined,
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('retorna id/numero da versão quando a RPC resolve com sucesso', async () => {
    const client = rpcClient({
      data: [{ id_versao: 5, numero_versao: 2, status_anterior: 'Ajustes' }],
      error: null,
    });
    await expect(
      registerVersaoArte(client, {
        idSolicitacao: 1,
        idDesigner: 'designer-1',
        arquivoPath: 'x',
        formato: 'PDF',
        observacoes: undefined,
      }),
    ).resolves.toEqual({ idVersao: 5, numeroVersao: 2, statusAnterior: 'Ajustes' });
  });
});

describe('getVersaoArteByIdAndSolicitacao (RF008 — filtro duplo contra IDOR)', () => {
  it('retorna null quando a versão não pertence à solicitação informada', async () => {
    const client = {
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }),
          }),
        }),
      }),
    } as unknown as Parameters<typeof getVersaoArteByIdAndSolicitacao>[0];

    await expect(getVersaoArteByIdAndSolicitacao(client, 999, 1)).resolves.toBeNull();
  });

  it('retorna a versão quando id_versao e id_solicitacao correspondem', async () => {
    const client = {
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: () =>
                Promise.resolve({
                  data: { id_versao: 5, arquivo_url: 'solicitacoes/1/versoes/x.pdf' },
                  error: null,
                }),
            }),
          }),
        }),
      }),
    } as unknown as Parameters<typeof getVersaoArteByIdAndSolicitacao>[0];

    await expect(getVersaoArteByIdAndSolicitacao(client, 5, 1)).resolves.toEqual({
      idVersao: 5,
      arquivoUrl: 'solicitacoes/1/versoes/x.pdf',
    });
  });
});

describe('createVersaoArteDownloadUrl (RF008, seção 12.5)', () => {
  it('força download (Content-Disposition: attachment) em vez de exibição inline', async () => {
    const createSignedUrlMock = vi
      .fn()
      .mockResolvedValue({ data: { signedUrl: 'https://exemplo.supabase.co/signed' }, error: null });
    const client = {
      storage: { from: () => ({ createSignedUrl: createSignedUrlMock }) },
    } as unknown as Parameters<typeof createVersaoArteDownloadUrl>[0];

    await createVersaoArteDownloadUrl(client, 'solicitacoes/1/versoes/x.pdf', 300);

    expect(createSignedUrlMock).toHaveBeenCalledWith('solicitacoes/1/versoes/x.pdf', 300, {
      download: true,
    });
  });

  it('permite exibição inline (forceDownload=false) para a tela pública de avaliação (RF009)', async () => {
    const createSignedUrlMock = vi
      .fn()
      .mockResolvedValue({ data: { signedUrl: 'https://exemplo.supabase.co/signed' }, error: null });
    const client = {
      storage: { from: () => ({ createSignedUrl: createSignedUrlMock }) },
    } as unknown as Parameters<typeof createVersaoArteDownloadUrl>[0];

    await createVersaoArteDownloadUrl(client, 'solicitacoes/1/versoes/x.pdf', 300, false);

    expect(createSignedUrlMock).toHaveBeenCalledWith('solicitacoes/1/versoes/x.pdf', 300, {
      download: false,
    });
  });
});
