import { describe, expect, it } from 'vitest';
import { insertResposta, registerWebhookEventOnce } from './atendimento.repository.js';

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
