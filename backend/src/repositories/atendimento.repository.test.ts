import { describe, expect, it } from 'vitest';
import {
  expireStaleAtendimentos,
  findSolicitacaoEmAndamentoByClienteId,
  insertResposta,
  listActiveAtendimentos,
  markWebhookEventoConcluido,
  normalizePhone,
  phoneStorageCandidates,
  registerRespostaEAvancar,
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

describe('phoneStorageCandidates (auditoria — achado HIGH, filtro no banco em vez de full scan em memória)', () => {
  it('para um wa_id de 13 dígitos (com o 9º dígito), retorna também a variante de 12 dígitos', () => {
    expect(phoneStorageCandidates('5564988885274')).toEqual(
      expect.arrayContaining(['5564988885274', '556488885274']),
    );
  });

  it('para um cadastro de 12 dígitos (sem o 9º dígito), retorna também a variante de 13 dígitos', () => {
    expect(phoneStorageCandidates('556488885274')).toEqual(
      expect.arrayContaining(['556488885274', '5564988885274']),
    );
  });

  it('não gera variante para números não-BR', () => {
    expect(phoneStorageCandidates('1234567891234')).toEqual(['1234567891234']);
  });
});

describe('listActiveAtendimentos (auditoria — achado HIGH, filtro no banco quando whatsappCandidates é informado)', () => {
  it('aplica .in("cliente.whatsapp", ...) quando candidatos são informados', async () => {
    const inCalls: unknown[][] = [];
    const client = {
      from: () => ({
        select: () => ({
          in: (...args: unknown[]) => {
            inCalls.push(args);
            return {
              order: () => ({
                in: (...args2: unknown[]) => {
                  inCalls.push(args2);
                  return Promise.resolve({ data: [], error: null });
                },
                then: (resolve: (value: { data: unknown[]; error: null }) => void) =>
                  resolve({ data: [], error: null }),
              }),
            };
          },
        }),
      }),
    } as unknown as Parameters<typeof listActiveAtendimentos>[0];

    await listActiveAtendimentos(client, ['5564988885274', '556488885274']);

    expect(inCalls).toContainEqual(['cliente.whatsapp', ['5564988885274', '556488885274']]);
  });

  it('não filtra por whatsapp quando candidatos não são informados (compatibilidade)', async () => {
    const inCalls: unknown[][] = [];
    const client = {
      from: () => ({
        select: () => ({
          in: (...args: unknown[]) => {
            inCalls.push(args);
            return {
              order: () => ({
                in: (...args2: unknown[]) => {
                  inCalls.push(args2);
                  return Promise.resolve({ data: [], error: null });
                },
                then: (resolve: (value: { data: unknown[]; error: null }) => void) =>
                  resolve({ data: [], error: null }),
              }),
            };
          },
        }),
      }),
    } as unknown as Parameters<typeof listActiveAtendimentos>[0];

    await listActiveAtendimentos(client);

    expect(inCalls.some((call) => call[0] === 'cliente.whatsapp')).toBe(false);
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

describe('registerRespostaEAvancar (item N.5.6 — decisão + insert atômicos sob lock do atendimento)', () => {
  it('retorna inserted=true e a contagem devolvida pela RPC', async () => {
    const client = rpcClient([{ inserted: true, answered_count: 3 }], null);
    await expect(registerRespostaEAvancar(client, 1, ['p1', 'p2', 'p3'], 'resposta')).resolves.toEqual({
      inserted: true,
      answeredCount: 3,
    });
  });

  it('retorna inserted=false quando a RPC indica que o questionário já estava completo', async () => {
    const client = rpcClient([{ inserted: false, answered_count: 3 }], null);
    await expect(registerRespostaEAvancar(client, 1, ['p1', 'p2', 'p3'], 'resposta')).resolves.toEqual({
      inserted: false,
      answeredCount: 3,
    });
  });

  it('propaga erro da RPC', async () => {
    const client = rpcClient(null, { message: 'connection lost' });
    await expect(registerRespostaEAvancar(client, 1, ['p1'], 'resposta')).rejects.toThrow(
      'Falha ao registrar resposta do atendimento',
    );
  });
});

describe('registerWebhookEventOnce (auditoria — duas fases: reserva antes, conclusão só após sucesso)', () => {
  it('retorna true quando a RPC reserva o evento (novo ou reserva travada expirada)', async () => {
    const client = rpcClient(true, null);
    await expect(registerWebhookEventOnce(client, 'wamid.1')).resolves.toBe(true);
  });

  it('retorna false quando já concluído ou sendo processado por outra requisição', async () => {
    const client = rpcClient(false, null);
    await expect(registerWebhookEventOnce(client, 'wamid.1')).resolves.toBe(false);
  });

  it('propaga erro inesperado da RPC', async () => {
    const client = rpcClient(null, { message: 'erro de conexão' });
    await expect(registerWebhookEventOnce(client, 'wamid.1')).rejects.toThrow('Falha ao reservar evento');
  });
});

describe('markWebhookEventoConcluido (auditoria)', () => {
  it('resolve sem erro quando a RPC confirma', async () => {
    const client = rpcClient(null, null);
    await expect(markWebhookEventoConcluido(client, 'wamid.1')).resolves.toBeUndefined();
  });

  it('propaga erro quando a RPC falha', async () => {
    const client = rpcClient(null, { message: 'erro de conexão' });
    await expect(markWebhookEventoConcluido(client, 'wamid.1')).rejects.toThrow('Falha ao concluir evento');
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
