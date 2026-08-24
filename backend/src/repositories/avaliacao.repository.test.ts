import { describe, expect, it } from 'vitest';
import { ConflictError, ExpiredLinkError, NotFoundError } from '../lib/errors.js';
import {
  generateAvaliacaoLinkToken,
  getAvaliacaoLinkState,
  getVersaoArtePreview,
  submitAvaliacao,
} from './avaliacao.repository.js';

function rpcClient(response: { data: unknown; error: { message: string; code?: string } | null }) {
  return { rpc: () => Promise.resolve(response) } as unknown as Parameters<typeof generateAvaliacaoLinkToken>[0];
}

describe('generateAvaliacaoLinkToken (RF009 — RPC atômica)', () => {
  it('mapeia P0002 (solicitação não encontrada/não pertence ao designer) para NotFoundError', async () => {
    const client = rpcClient({ data: null, error: { message: 'não encontrada', code: 'P0002' } });
    await expect(
      generateAvaliacaoLinkToken(client, {
        idSolicitacao: 1,
        idDesigner: 'designer-1',
        tokenHash: 'hash',
        expiresAt: new Date(),
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('mapeia P0001 (status não aguarda avaliação) para ConflictError', async () => {
    const client = rpcClient({ data: null, error: { message: 'status inválido', code: 'P0001' } });
    await expect(
      generateAvaliacaoLinkToken(client, {
        idSolicitacao: 1,
        idDesigner: 'designer-1',
        tokenHash: 'hash',
        expiresAt: new Date(),
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('retorna id/numero da versão quando a RPC resolve com sucesso', async () => {
    const client = rpcClient({ data: [{ id_versao: 5, numero_versao: 2 }], error: null });
    await expect(
      generateAvaliacaoLinkToken(client, {
        idSolicitacao: 1,
        idDesigner: 'designer-1',
        tokenHash: 'hash',
        expiresAt: new Date(),
      }),
    ).resolves.toEqual({ idVersao: 5, numeroVersao: 2 });
  });
});

function selectClient(row: unknown) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: () => Promise.resolve({ data: row, error: null }) }),
      }),
    }),
  } as unknown as Parameters<typeof getAvaliacaoLinkState>[0];
}

describe('getAvaliacaoLinkState (RF009 — três buckets amigáveis)', () => {
  it('retorna "invalid" quando o token não existe', async () => {
    await expect(getAvaliacaoLinkState(selectClient(null), 'hash')).resolves.toEqual({
      state: 'invalid',
      idVersao: null,
    });
  });

  it('retorna "invalid" quando o token foi revogado', async () => {
    const row = {
      expires_at: new Date(Date.now() + 100_000).toISOString(),
      revoked_at: new Date().toISOString(),
      used_at: null,
      id_versao: 1,
    };
    await expect(getAvaliacaoLinkState(selectClient(row), 'hash')).resolves.toEqual({
      state: 'invalid',
      idVersao: null,
    });
  });

  it('retorna "used" com idVersao (RN13/RN14: acompanhamento somente-leitura continua identificando a solicitação)', async () => {
    const row = {
      expires_at: new Date(Date.now() + 100_000).toISOString(),
      revoked_at: null,
      used_at: new Date().toISOString(),
      id_versao: 1,
    };
    await expect(getAvaliacaoLinkState(selectClient(row), 'hash')).resolves.toEqual({
      state: 'used',
      idVersao: 1,
    });
  });

  it('retorna "expired" quando o prazo já passou', async () => {
    const row = {
      expires_at: new Date(Date.now() - 1000).toISOString(),
      revoked_at: null,
      used_at: null,
      id_versao: 1,
    };
    await expect(getAvaliacaoLinkState(selectClient(row), 'hash')).resolves.toEqual({
      state: 'expired',
      idVersao: null,
    });
  });

  it('retorna "valid" com o id_versao quando o token está íntegro', async () => {
    const row = {
      expires_at: new Date(Date.now() + 100_000).toISOString(),
      revoked_at: null,
      used_at: null,
      id_versao: 7,
    };
    await expect(getAvaliacaoLinkState(selectClient(row), 'hash')).resolves.toEqual({
      state: 'valid',
      idVersao: 7,
    });
  });
});

describe('getVersaoArtePreview (RF009 — dados mínimos, sem PII)', () => {
  it('retorna null quando a versão não existe', async () => {
    const client = {
      from: () => ({
        select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }),
      }),
    } as unknown as Parameters<typeof getVersaoArtePreview>[0];
    await expect(getVersaoArtePreview(client, 1)).resolves.toBeNull();
  });

  it('retorna os campos mínimos quando a versão existe', async () => {
    const client = {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: () =>
              Promise.resolve({
                data: {
                  id_solicitacao: 10,
                  numero_versao: 2,
                  formato: 'PDF',
                  observacoes: null,
                  arquivo_url: 'solicitacoes/10/versoes/x.pdf',
                  solicitacao: { tema: 'Post promocional' },
                },
                error: null,
              }),
          }),
        }),
      }),
    } as unknown as Parameters<typeof getVersaoArtePreview>[0];

    await expect(getVersaoArtePreview(client, 5)).resolves.toEqual({
      idSolicitacao: 10,
      numeroVersao: 2,
      formato: 'PDF',
      observacoes: null,
      arquivoUrl: 'solicitacoes/10/versoes/x.pdf',
      tema: 'Post promocional',
    });
  });
});

describe('submitAvaliacao (RF009/RF010 — RPC atômica)', () => {
  it('mapeia P0002 (token inexistente/revogado) para NotFoundError', async () => {
    const client = rpcClient({ data: null, error: { message: 'inválido', code: 'P0002' } });
    await expect(
      submitAvaliacao(client, {
        tokenHash: 'hash',
        decisao: 'Aprovado',
        descricaoAjuste: undefined,
        observacoesAjuste: undefined,
        imagemReferenciaPath: undefined,
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('mapeia P0004 (token já utilizado) para ConflictError', async () => {
    const client = rpcClient({ data: null, error: { message: 'já utilizado', code: 'P0004' } });
    await expect(
      submitAvaliacao(client, {
        tokenHash: 'hash',
        decisao: 'Aprovado',
        descricaoAjuste: undefined,
        observacoesAjuste: undefined,
        imagemReferenciaPath: undefined,
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('mapeia P0003 (token expirado) para ExpiredLinkError', async () => {
    const client = rpcClient({ data: null, error: { message: 'expirado', code: 'P0003' } });
    await expect(
      submitAvaliacao(client, {
        tokenHash: 'hash',
        decisao: 'Aprovado',
        descricaoAjuste: undefined,
        observacoesAjuste: undefined,
        imagemReferenciaPath: undefined,
      }),
    ).rejects.toBeInstanceOf(ExpiredLinkError);
  });

  it('mapeia P0001 (solicitação não aguarda mais avaliação) para ConflictError', async () => {
    const client = rpcClient({ data: null, error: { message: 'status inválido', code: 'P0001' } });
    await expect(
      submitAvaliacao(client, {
        tokenHash: 'hash',
        decisao: 'Aprovado',
        descricaoAjuste: undefined,
        observacoesAjuste: undefined,
        imagemReferenciaPath: undefined,
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('retorna o resultado quando a RPC resolve com sucesso', async () => {
    const client = rpcClient({
      data: [{ id_solicitacao: 10, status_novo: 'Aprovado', numero_versao: 2 }],
      error: null,
    });
    await expect(
      submitAvaliacao(client, {
        tokenHash: 'hash',
        decisao: 'Aprovado',
        descricaoAjuste: undefined,
        observacoesAjuste: undefined,
        imagemReferenciaPath: undefined,
      }),
    ).resolves.toEqual({ idSolicitacao: 10, statusNovo: 'Aprovado', numeroVersao: 2 });
  });
});
