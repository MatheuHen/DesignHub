import { describe, expect, it } from 'vitest';
import { ConflictError, NotFoundError } from '../lib/errors.js';
import {
  claimAgendamentoParaPublicacao,
  getVersaoArteAtualDaSolicitacao,
  listAgendamentosVencidos,
  registerPublicacaoFalha,
  registerPublicacaoSucesso,
} from './publicacao.repository.js';

function rpcClient(response: { data: unknown; error: { message: string; code?: string } | null }) {
  return { rpc: () => Promise.resolve(response) } as unknown as Parameters<typeof registerPublicacaoSucesso>[0];
}

describe('claimAgendamentoParaPublicacao (RF014/RN29 — idempotência do job)', () => {
  it('retorna true quando a RPC reserva o agendamento', async () => {
    const client = rpcClient({ data: true, error: null });
    await expect(claimAgendamentoParaPublicacao(client, 1)).resolves.toBe(true);
  });

  it('retorna false quando outra execução já reservou (sem lançar erro)', async () => {
    const client = rpcClient({ data: false, error: null });
    await expect(claimAgendamentoParaPublicacao(client, 1)).resolves.toBe(false);
  });

  it('propaga erro inesperado da RPC', async () => {
    const client = rpcClient({ data: null, error: { message: 'falha de conexão' } });
    await expect(claimAgendamentoParaPublicacao(client, 1)).rejects.toThrow('falha de conexão');
  });
});

describe('registerPublicacaoSucesso (RF014)', () => {
  it('mapeia P0002 (agendamento não encontrado) para NotFoundError', async () => {
    const client = rpcClient({ data: null, error: { message: 'não encontrado', code: 'P0002' } });
    await expect(
      registerPublicacaoSucesso(client, { idAgendamento: 1, tipo: 'automatica', atorId: null }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('mapeia P0001 (agendamento não ativo) para ConflictError', async () => {
    const client = rpcClient({ data: null, error: { message: 'não ativo', code: 'P0001' } });
    await expect(
      registerPublicacaoSucesso(client, { idAgendamento: 1, tipo: 'manual', atorId: 'designer-1' }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('resolve sem erro quando a RPC tem sucesso', async () => {
    const client = rpcClient({ data: null, error: null });
    await expect(
      registerPublicacaoSucesso(client, { idAgendamento: 1, tipo: 'automatica', atorId: null }),
    ).resolves.toBeUndefined();
  });
});

describe('registerPublicacaoFalha (RF014 — nunca marca como publicado)', () => {
  it('mapeia P0001 (agendamento não ativo) para ConflictError', async () => {
    const client = rpcClient({ data: null, error: { message: 'não ativo', code: 'P0001' } });
    await expect(registerPublicacaoFalha(client, { idAgendamento: 1 })).rejects.toBeInstanceOf(
      ConflictError,
    );
  });

  it('resolve sem erro quando a RPC tem sucesso', async () => {
    const client = rpcClient({ data: null, error: null });
    await expect(registerPublicacaoFalha(client, { idAgendamento: 1 })).resolves.toBeUndefined();
  });
});

describe('listAgendamentosVencidos (RF014/RN32)', () => {
  it('retorna os agendamentos vencidos mapeados', async () => {
    const client = {
      from: () => ({
        select: () => ({
          eq: () => ({
            lte: () =>
              Promise.resolve({
                data: [{ id_agendamento: 1, id_solicitacao: 10, legenda: 'Legenda' }],
                error: null,
              }),
          }),
        }),
      }),
    } as unknown as Parameters<typeof listAgendamentosVencidos>[0];

    await expect(listAgendamentosVencidos(client)).resolves.toEqual([
      { idAgendamento: 1, idSolicitacao: 10, legenda: 'Legenda' },
    ]);
  });
});

describe('getVersaoArteAtualDaSolicitacao (RF014)', () => {
  it('retorna null quando não há versão', async () => {
    const client = {
      from: () => ({
        select: () => ({
          eq: () => ({
            order: () => ({
              limit: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }),
            }),
          }),
        }),
      }),
    } as unknown as Parameters<typeof getVersaoArteAtualDaSolicitacao>[0];

    await expect(getVersaoArteAtualDaSolicitacao(client, 10)).resolves.toBeNull();
  });

  it('retorna a versão mais recente quando existe', async () => {
    const client = {
      from: () => ({
        select: () => ({
          eq: () => ({
            order: () => ({
              limit: () => ({
                maybeSingle: () =>
                  Promise.resolve({
                    data: { id_versao: 2, formato: 'PNG', arquivo_url: 'solicitacoes/10/versoes/x.png' },
                    error: null,
                  }),
              }),
            }),
          }),
        }),
      }),
    } as unknown as Parameters<typeof getVersaoArteAtualDaSolicitacao>[0];

    await expect(getVersaoArteAtualDaSolicitacao(client, 10)).resolves.toEqual({
      idVersao: 2,
      formato: 'PNG',
      arquivoUrl: 'solicitacoes/10/versoes/x.png',
    });
  });
});
