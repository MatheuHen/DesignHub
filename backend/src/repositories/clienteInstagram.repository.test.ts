import { describe, expect, it } from 'vitest';
import {
  consumeOAuthState,
  createOAuthState,
  deleteConexao,
  getConexaoAtiva,
  getStatusConexao,
  upsertConexao,
} from './clienteInstagram.repository.js';

type AnyClient = Parameters<typeof getConexaoAtiva>[0];

describe('createOAuthState (RF014/ADR 0005)', () => {
  it('insere o estado do handshake OAuth', async () => {
    const insert = (payload: unknown) => {
      expect(payload).toMatchObject({ state_hash: 'hash-1', id_cliente: 1, id_designer: 'designer-1' });
      return Promise.resolve({ error: null });
    };
    const client = { from: () => ({ insert }) } as unknown as AnyClient;

    await expect(
      createOAuthState(client, { stateHash: 'hash-1', idCliente: 1, idDesigner: 'designer-1' }),
    ).resolves.toBeUndefined();
  });

  it('propaga erro do banco', async () => {
    const client = { from: () => ({ insert: () => Promise.resolve({ error: { message: 'falhou' } }) }) } as unknown as AnyClient;

    await expect(
      createOAuthState(client, { stateHash: 'hash-1', idCliente: 1, idDesigner: 'designer-1' }),
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

  it('retorna id_cliente/id_designer quando o state é válido e consumido', async () => {
    const client = {
      from: () => ({
        update: () => ({
          eq: () => ({
            is: () => ({
              gt: () => ({
                select: () => ({
                  maybeSingle: () =>
                    Promise.resolve({ data: { id_cliente: 5, id_designer: 'designer-9' }, error: null }),
                }),
              }),
            }),
          }),
        }),
      }),
    } as unknown as AnyClient;

    await expect(consumeOAuthState(client, 'hash-1')).resolves.toEqual({ id_cliente: 5, id_designer: 'designer-9' });
  });
});

describe('getConexaoAtiva (RF014/ADR 0005)', () => {
  it('retorna null quando o cliente não tem conexão válida', async () => {
    const client = {
      from: () => ({
        select: () => ({ eq: () => ({ gt: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }) }),
      }),
    } as unknown as AnyClient;

    await expect(getConexaoAtiva(client, 1)).resolves.toBeNull();
  });

  it('retorna a conexão quando existe e não expirou', async () => {
    const client = {
      from: () => ({
        select: () => ({
          eq: () => ({
            gt: () => ({
              maybeSingle: () =>
                Promise.resolve({
                  data: {
                    instagram_user_id: 'conta-1',
                    access_token: 'token-1',
                    token_expira_em: '2027-01-01T00:00:00Z',
                  },
                  error: null,
                }),
            }),
          }),
        }),
      }),
    } as unknown as AnyClient;

    await expect(getConexaoAtiva(client, 1)).resolves.toEqual({
      instagramUserId: 'conta-1',
      accessToken: 'token-1',
      tokenExpiraEm: '2027-01-01T00:00:00Z',
    });
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

describe('upsertConexao/deleteConexao (RF014/ADR 0005)', () => {
  it('upsertConexao grava a conexão por id_cliente', async () => {
    const upsert = (payload: unknown, options: unknown) => {
      expect(payload).toMatchObject({ id_cliente: 1, instagram_user_id: 'conta-1', access_token: 'token-1' });
      expect(options).toEqual({ onConflict: 'id_cliente' });
      return Promise.resolve({ error: null });
    };
    const client = { from: () => ({ upsert }) } as unknown as AnyClient;

    await expect(
      upsertConexao(client, {
        idCliente: 1,
        instagramUserId: 'conta-1',
        accessToken: 'token-1',
        tokenExpiraEm: '2027-01-01T00:00:00Z',
      }),
    ).resolves.toBeUndefined();
  });

  it('deleteConexao remove a linha do cliente', async () => {
    const client = { from: () => ({ delete: () => ({ eq: () => Promise.resolve({ error: null }) }) }) } as unknown as AnyClient;

    await expect(deleteConexao(client, 1)).resolves.toBeUndefined();
  });
});
