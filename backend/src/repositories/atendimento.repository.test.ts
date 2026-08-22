import { describe, expect, it } from 'vitest';
import {
  expireStaleAtendimentos,
  findSolicitacaoEmAndamentoByClienteId,
  insertResposta,
  normalizePhone,
  registerWebhookEventOnce,
} from './atendimento.repository.js';

describe('normalizePhone (RF004: ambiguidade do 9º dígito BR entre wa_id e cadastro)', () => {
  it('canoniza um número BR de 13 dígitos (com o 9º dígito) para a forma de 12 dígitos', () => {
    expect(normalizePhone('55 64 98888-5274')).toBe(normalizePhone('55 64 8888-5274'));
  });

  it('mantém um número BR de 12 dígitos (sem o 9º dígito) inalterado', () => {
    expect(normalizePhone('556484035274')).toBe('556484035274');
  });

  it('não altera números não-BR (país diferente de 55) mesmo com 13 dígitos', () => {
    expect(normalizePhone('1234567891234')).toBe('1234567891234');
  });
});

function insertClient(error: { code?: string; message: string } | null) {
  return {
    from: () => ({ insert: () => Promise.resolve({ error }) }),
  } as unknown as Parameters<typeof insertResposta>[0];
}

describe('insertResposta (seção 12.4 — corrida entre mensagens concorrentes)', () => {
  it('retorna true quando o insert é bem-sucedido', async () => {
    const client = insertClient(null);
    await expect(insertResposta(client, 1, 'pergunta', 'resposta')).resolves.toBe(true);
  });

  it('retorna false (sem lançar erro) quando outra requisição já respondeu a mesma pergunta', async () => {
    const client = insertClient({ code: '23505', message: 'duplicate key value violates unique constraint' });
    await expect(insertResposta(client, 1, 'pergunta', 'resposta')).resolves.toBe(false);
  });

  it('propaga outros erros normalmente', async () => {
    const client = insertClient({ message: 'connection lost' });
    await expect(insertResposta(client, 1, 'pergunta', 'resposta')).rejects.toThrow('connection lost');
  });
});

describe('registerWebhookEventOnce (idempotência de reentrega)', () => {
  it('retorna true na primeira vez que o evento é registrado', async () => {
    const client = insertClient(null);
    await expect(registerWebhookEventOnce(client, 'wamid.1')).resolves.toBe(true);
  });

  it('retorna false quando o evento já foi processado antes', async () => {
    const client = insertClient({ code: '23505', message: 'duplicate key value violates unique constraint' });
    await expect(registerWebhookEventOnce(client, 'wamid.1')).resolves.toBe(false);
  });
});

function solicitacaoQueryClient(data: unknown[] | null, error: { message: string } | null) {
  const builder = {
    select: () => builder,
    eq: () => builder,
    not: () => builder,
    limit: () => Promise.resolve({ data, error }),
  };
  return { from: () => builder } as unknown as Parameters<typeof findSolicitacaoEmAndamentoByClienteId>[0];
}

describe('findSolicitacaoEmAndamentoByClienteId (RF004 — verificação de solicitação existente)', () => {
  it('retorna null quando o cliente não tem solicitação em andamento', async () => {
    const client = solicitacaoQueryClient([], null);
    await expect(findSolicitacaoEmAndamentoByClienteId(client, 1)).resolves.toBeNull();
  });

  it('retorna a solicitação encontrada quando o cliente já tem uma em andamento', async () => {
    const client = solicitacaoQueryClient([{ id_solicitacao: 42, status: 'Ajustes' }], null);
    await expect(findSolicitacaoEmAndamentoByClienteId(client, 1)).resolves.toEqual({
      id: 42,
      status: 'Ajustes',
    });
  });

  it('propaga erro de consulta', async () => {
    const client = solicitacaoQueryClient(null, { message: 'connection lost' });
    await expect(findSolicitacaoEmAndamentoByClienteId(client, 1)).rejects.toThrow('connection lost');
  });
});

function rpcClient(data: unknown, error: { message: string } | null) {
  return { rpc: () => Promise.resolve({ data, error }) } as unknown as Parameters<typeof expireStaleAtendimentos>[0];
}

describe('expireStaleAtendimentos (RN05/seção 11)', () => {
  it('retorna a contagem de atendimentos expirados', async () => {
    const client = rpcClient(3, null);
    await expect(expireStaleAtendimentos(client)).resolves.toBe(3);
  });

  it('propaga erro da RPC', async () => {
    const client = rpcClient(null, { message: 'connection lost' });
    await expect(expireStaleAtendimentos(client)).rejects.toThrow('connection lost');
  });
});
