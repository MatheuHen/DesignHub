import { describe, expect, it } from 'vitest';
import { ConflictError, ExpiredLinkError, NotFoundError } from '../lib/errors.js';
import {
  cancelAgendamentoCliente,
  generateAvaliacaoLinkToken,
  getAvaliacaoLinkState,
  getLinkAvaliacaoAtual,
  getVersaoArtePreview,
  marcarLinkAvaliacaoNotificado,
  submitAvaliacao,
} from './avaliacao.repository.js';

type AnyClient = Parameters<typeof getVersaoArtePreview>[0];

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
                  solicitacao: { tema: 'Post promocional', id_cliente: 3 },
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
      idCliente: 3,
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

describe('cancelAgendamentoCliente (RF012/RF013/item 8.4 — correções 13/09/2026)', () => {
  it('mapeia P0002 (agendamento não encontrado/não mais ativo) para NotFoundError', async () => {
    const client = rpcClient({ data: null, error: { message: 'não encontrado', code: 'P0002' } });
    await expect(cancelAgendamentoCliente(client, 10)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('mapeia P0005 (janela de 3h) para ConflictError', async () => {
    const client = rpcClient({ data: null, error: { message: 'janela de 3h', code: 'P0005' } });
    await expect(cancelAgendamentoCliente(client, 10)).rejects.toBeInstanceOf(ConflictError);
  });

  it('resolve sem erro quando a RPC confirma o cancelamento', async () => {
    const client = rpcClient({ data: null, error: null });
    await expect(cancelAgendamentoCliente(client, 10)).resolves.toBeUndefined();
  });
});

describe('marcarLinkAvaliacaoNotificado (item 7/7.1 — rodada final)', () => {
  it('atualiza whatsapp_notificado_em pelo token_hash', async () => {
    const eq = (column: string, value: string) => {
      expect(column).toBe('token_hash');
      expect(value).toBe('hash-1');
      return Promise.resolve({ error: null });
    };
    const client = { from: () => ({ update: () => ({ eq }) }) } as unknown as AnyClient;

    await expect(marcarLinkAvaliacaoNotificado(client, 'hash-1')).resolves.toBeUndefined();
  });

  it('propaga erro do banco', async () => {
    const client = {
      from: () => ({ update: () => ({ eq: () => Promise.resolve({ error: { message: 'falhou' } }) }) }),
    } as unknown as AnyClient;

    await expect(marcarLinkAvaliacaoNotificado(client, 'hash-1')).rejects.toThrow(/falhou/);
  });
});

describe('getLinkAvaliacaoAtual (item 7 — rodada final)', () => {
  it('retorna null quando a solicitação ainda não tem nenhuma versão enviada', async () => {
    const client = {
      from: () => ({
        select: () => ({
          eq: () => ({ order: () => ({ limit: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }) }),
        }),
      }),
    } as unknown as AnyClient;

    await expect(getLinkAvaliacaoAtual(client, 10)).resolves.toBeNull();
  });

  it('resolve "respondido" quando o link mais recente já foi usado', async () => {
    const client = {
      from: (table: string) => {
        if (table === 'versao_arte') {
          return {
            select: () => ({
              eq: () => ({
                order: () => ({ limit: () => ({ maybeSingle: () => Promise.resolve({ data: { id_versao: 5 }, error: null }) }) }),
              }),
            }),
          };
        }
        return {
          select: () => ({
            eq: () => ({
              order: () =>
                Promise.resolve({
                  data: [
                    {
                      created_at: '2026-09-20T10:00:00Z',
                      expires_at: '2026-09-27T10:00:00Z',
                      revoked_at: null,
                      used_at: '2026-09-21T10:00:00Z',
                      whatsapp_notificado_em: '2026-09-20T10:00:01Z',
                    },
                  ],
                  error: null,
                }),
            }),
          }),
        };
      },
    } as unknown as AnyClient;

    await expect(getLinkAvaliacaoAtual(client, 10)).resolves.toEqual({
      ultimoEnvioEm: '2026-09-20T10:00:00Z',
      whatsappNotificadoEm: '2026-09-20T10:00:01Z',
      situacao: 'respondido',
      validoAte: '2026-09-27T10:00:00Z',
      quantidadeEnvios: 1,
    });
  });

  it('resolve "falha_envio" quando o link não foi confirmado como notificado (item 7.1 — não confunde gerado com enviado)', async () => {
    const client = {
      from: (table: string) => {
        if (table === 'versao_arte') {
          return {
            select: () => ({
              eq: () => ({
                order: () => ({ limit: () => ({ maybeSingle: () => Promise.resolve({ data: { id_versao: 5 }, error: null }) }) }),
              }),
            }),
          };
        }
        return {
          select: () => ({
            eq: () => ({
              order: () =>
                Promise.resolve({
                  data: [
                    {
                      created_at: '2026-09-20T10:00:00Z',
                      expires_at: '2026-09-27T10:00:00Z',
                      revoked_at: null,
                      used_at: null,
                      whatsapp_notificado_em: null,
                    },
                  ],
                  error: null,
                }),
            }),
          }),
        };
      },
    } as unknown as AnyClient;

    const result = await getLinkAvaliacaoAtual(client, 10);
    expect(result?.situacao).toBe('falha_envio');
  });

  it('conta reenvios: quantidadeEnvios reflete todos os tokens da versão pendente, mais recente primeiro', async () => {
    const client = {
      from: (table: string) => {
        if (table === 'versao_arte') {
          return {
            select: () => ({
              eq: () => ({
                order: () => ({ limit: () => ({ maybeSingle: () => Promise.resolve({ data: { id_versao: 5 }, error: null }) }) }),
              }),
            }),
          };
        }
        return {
          select: () => ({
            eq: () => ({
              order: () =>
                Promise.resolve({
                  data: [
                    {
                      created_at: '2026-09-22T10:00:00Z',
                      expires_at: '2026-09-29T10:00:00Z',
                      revoked_at: null,
                      used_at: null,
                      whatsapp_notificado_em: '2026-09-22T10:00:01Z',
                    },
                    {
                      created_at: '2026-09-20T10:00:00Z',
                      expires_at: '2026-09-27T10:00:00Z',
                      revoked_at: '2026-09-22T10:00:00Z',
                      used_at: null,
                      whatsapp_notificado_em: '2026-09-20T10:00:01Z',
                    },
                  ],
                  error: null,
                }),
            }),
          }),
        };
      },
    } as unknown as AnyClient;

    const result = await getLinkAvaliacaoAtual(client, 10);
    expect(result?.quantidadeEnvios).toBe(2);
    expect(result?.situacao).toBe('aguardando_resposta');
    expect(result?.ultimoEnvioEm).toBe('2026-09-22T10:00:00Z');
  });
});
