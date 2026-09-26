import { describe, expect, it } from 'vitest';
import {
  consumeOAuthState,
  createDataDeletionRequest,
  createOAuthState,
  deleteConexao,
  deleteConexaoByInstagramUserId,
  getConexaoAtiva,
  getDataDeletionRequestStatus,
  getStatusConexao,
  upsertConexao,
} from './clienteInstagram.repository.js';

type AnyClient = Parameters<typeof getConexaoAtiva>[0];

describe('createOAuthState (RF014/ADR 0005)', () => {
  it('insere o estado do handshake OAuth com a origem informada (item 12.2/13.3)', async () => {
    const insert = (payload: unknown) => {
      expect(payload).toMatchObject({
        state_hash: 'hash-1',
        id_cliente: 1,
        id_designer: 'designer-1',
        origem: 'designer',
      });
      return Promise.resolve({ error: null });
    };
    const client = { from: () => ({ insert }) } as unknown as AnyClient;

    await expect(
      createOAuthState(client, { stateHash: 'hash-1', idCliente: 1, idDesigner: 'designer-1', origem: 'designer' }),
    ).resolves.toBeUndefined();
  });

  it('propaga erro do banco', async () => {
    const client = { from: () => ({ insert: () => Promise.resolve({ error: { message: 'falhou' } }) }) } as unknown as AnyClient;

    await expect(
      createOAuthState(client, { stateHash: 'hash-1', idCliente: 1, idDesigner: 'designer-1', origem: 'designer' }),
    ).rejects.toThrow(/falhou/);
  });
});

describe('consumeOAuthState (RF014/ADR 0005 — single-use)', () => {
  it('retorna null quando o state não existe/já foi usado/expirou', async () => {
    const client = {
      from: () => ({
        update: () => ({
          eq: () => ({
            is: () => ({
              gt: () => ({
                select: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }),
              }),
            }),
          }),
        }),
      }),
    } as unknown as AnyClient;

    await expect(consumeOAuthState(client, 'hash-1')).resolves.toBeNull();
  });

  it('retorna id_cliente/id_designer/origem quando o state é válido e consumido', async () => {
    const client = {
      from: () => ({
        update: () => ({
          eq: () => ({
            is: () => ({
              gt: () => ({
                select: () => ({
                  maybeSingle: () =>
                    Promise.resolve({
                      data: { id_cliente: 5, id_designer: 'designer-9', origem: 'cliente_link' },
                      error: null,
                    }),
                }),
              }),
            }),
          }),
        }),
      }),
    } as unknown as AnyClient;

    await expect(consumeOAuthState(client, 'hash-1')).resolves.toEqual({
      id_cliente: 5,
      id_designer: 'designer-9',
      origem: 'cliente_link',
    });
  });
});

describe('getConexaoAtiva (RF014/ADR 0005, item N.5.5 — token cifrado)', () => {
  it('retorna null quando a RPC não encontra conexão válida', async () => {
    const client = { rpc: () => Promise.resolve({ data: [], error: null }) } as unknown as AnyClient;

    await expect(getConexaoAtiva(client, 1, 'chave-de-teste-com-32-caracteres')).resolves.toBeNull();
  });

  it('chama a RPC com o id_cliente e a chave de cifragem, retorna a conexão decifrada', async () => {
    const rpc = (fn: string, args: unknown) => {
      expect(fn).toBe('get_instagram_conexao_ativa');
      expect(args).toEqual({ p_id_cliente: 1, p_enc_key: 'chave-de-teste-com-32-caracteres' });
      return Promise.resolve({
        data: [
          {
            instagram_user_id: 'conta-1',
            access_token: 'token-1',
            token_expira_em: '2027-01-01T00:00:00Z',
          },
        ],
        error: null,
      });
    };
    const client = { rpc } as unknown as AnyClient;

    await expect(getConexaoAtiva(client, 1, 'chave-de-teste-com-32-caracteres')).resolves.toEqual({
      instagramUserId: 'conta-1',
      accessToken: 'token-1',
      tokenExpiraEm: '2027-01-01T00:00:00Z',
    });
  });

  it('propaga erro da RPC', async () => {
    const client = { rpc: () => Promise.resolve({ data: null, error: { message: 'falhou' } }) } as unknown as AnyClient;

    await expect(getConexaoAtiva(client, 1, 'chave-de-teste-com-32-caracteres')).rejects.toThrow(/falhou/);
  });
});

describe('getStatusConexao (RF014 — status para exibição, nunca o token)', () => {
  it('conectado=false quando não há linha', async () => {
    const client = {
      from: () => ({ select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }) }),
    } as unknown as AnyClient;

    await expect(getStatusConexao(client, 1)).resolves.toEqual({ conectado: false, conectadoEm: null, expiraEm: null });
  });

  it('conectado=false quando o token já expirou', async () => {
    const client = {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: () =>
              Promise.resolve({
                data: { created_at: '2020-01-01T00:00:00Z', token_expira_em: '2020-03-01T00:00:00Z' },
                error: null,
              }),
          }),
        }),
      }),
    } as unknown as AnyClient;

    await expect(getStatusConexao(client, 1)).resolves.toMatchObject({ conectado: false });
  });

  it('conectado=true quando o token ainda é válido', async () => {
    const futureDate = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString();
    const client = {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: () =>
              Promise.resolve({ data: { created_at: '2026-08-20T00:00:00Z', token_expira_em: futureDate }, error: null }),
          }),
        }),
      }),
    } as unknown as AnyClient;

    await expect(getStatusConexao(client, 1)).resolves.toEqual({
      conectado: true,
      conectadoEm: '2026-08-20T00:00:00Z',
      expiraEm: futureDate,
    });
  });
});

describe('upsertConexao/deleteConexao (RF014/ADR 0005, item N.5.5 — token cifrado)', () => {
  it('upsertConexao chama a RPC com o access_token e a chave de cifragem', async () => {
    const rpc = (fn: string, args: unknown) => {
      expect(fn).toBe('upsert_cliente_instagram_conexao');
      expect(args).toEqual({
        p_id_cliente: 1,
        p_instagram_user_id: 'conta-1',
        p_access_token: 'token-1',
        p_token_expira_em: '2027-01-01T00:00:00Z',
        p_enc_key: 'chave-de-teste-com-32-caracteres',
      });
      return Promise.resolve({ error: null });
    };
    const client = { rpc } as unknown as AnyClient;

    await expect(
      upsertConexao(client, {
        idCliente: 1,
        instagramUserId: 'conta-1',
        accessToken: 'token-1',
        tokenExpiraEm: '2027-01-01T00:00:00Z',
        encKey: 'chave-de-teste-com-32-caracteres',
      }),
    ).resolves.toBeUndefined();
  });

  it('deleteConexao remove a linha do cliente', async () => {
    const client = { from: () => ({ delete: () => ({ eq: () => Promise.resolve({ error: null }) }) }) } as unknown as AnyClient;

    await expect(deleteConexao(client, 1)).resolves.toBeUndefined();
  });
});

describe('deleteConexaoByInstagramUserId (item A1/A2 — Deauthorize/Data Deletion)', () => {
  it('retorna true quando encontrou e removeu uma conexão', async () => {
    const client = {
      from: () => ({
        delete: () => ({ eq: () => ({ select: () => Promise.resolve({ data: [{ id_cliente: 1 }], error: null }) }) }),
      }),
    } as unknown as AnyClient;

    await expect(deleteConexaoByInstagramUserId(client, 'ig-user-1')).resolves.toBe(true);
  });

  it('retorna false (idempotente) quando não havia conexão para aquele instagram_user_id', async () => {
    const client = {
      from: () => ({
        delete: () => ({ eq: () => ({ select: () => Promise.resolve({ data: [], error: null }) }) }),
      }),
    } as unknown as AnyClient;

    await expect(deleteConexaoByInstagramUserId(client, 'ig-user-inexistente')).resolves.toBe(false);
  });

  it('propaga erro do banco', async () => {
    const client = {
      from: () => ({
        delete: () => ({ eq: () => ({ select: () => Promise.resolve({ data: null, error: { message: 'falhou' } }) }) }),
      }),
    } as unknown as AnyClient;

    await expect(deleteConexaoByInstagramUserId(client, 'ig-user-1')).rejects.toThrow(/falhou/);
  });
});

describe('createDataDeletionRequest/getDataDeletionRequestStatus (item A2)', () => {
  it('createDataDeletionRequest insere o registro do pedido', async () => {
    const insert = (payload: unknown) => {
      expect(payload).toMatchObject({
        confirmation_code: 'codigo-1',
        instagram_user_id: 'ig-user-1',
        conexao_removida: true,
      });
      return Promise.resolve({ error: null });
    };
    const client = { from: () => ({ insert }) } as unknown as AnyClient;

    await expect(
      createDataDeletionRequest(client, { confirmationCode: 'codigo-1', instagramUserId: 'ig-user-1', conexaoRemovida: true }),
    ).resolves.toBeUndefined();
  });

  it('createDataDeletionRequest propaga erro do banco', async () => {
    const client = { from: () => ({ insert: () => Promise.resolve({ error: { message: 'falhou' } }) }) } as unknown as AnyClient;

    await expect(
      createDataDeletionRequest(client, { confirmationCode: 'codigo-1', instagramUserId: 'ig-user-1', conexaoRemovida: false }),
    ).rejects.toThrow(/falhou/);
  });

  it('getDataDeletionRequestStatus retorna "concluido" quando o pedido existe', async () => {
    const client = {
      from: () => ({
        select: () => ({
          eq: () => ({ maybeSingle: () => Promise.resolve({ data: { completed_at: '2026-09-24T00:00:00Z' }, error: null }) }),
        }),
      }),
    } as unknown as AnyClient;

    await expect(getDataDeletionRequestStatus(client, 'codigo-1')).resolves.toBe('concluido');
  });

  it('getDataDeletionRequestStatus retorna "nao_encontrado" quando o confirmation_code não existe', async () => {
    const client = {
      from: () => ({ select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }) }),
    } as unknown as AnyClient;

    await expect(getDataDeletionRequestStatus(client, 'codigo-inexistente')).resolves.toBe('nao_encontrado');
  });
});
