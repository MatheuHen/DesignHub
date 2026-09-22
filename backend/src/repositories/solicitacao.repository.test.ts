import { describe, expect, it, vi } from 'vitest';
import { ConflictError, NotFoundError } from '../lib/errors.js';
import {
  cancelSolicitacaoDesignerRpc,
  listRespostasBySolicitacao,
  listSolicitacoes,
  updateSolicitacaoFields,
} from './solicitacao.repository.js';

function rpcClient(response: { error: { message: string; code?: string } | null }) {
  return { rpc: () => Promise.resolve(response) } as unknown as Parameters<typeof cancelSolicitacaoDesignerRpc>[0];
}

describe('cancelSolicitacaoDesignerRpc (item 12/30 — rodada correções)', () => {
  it('resolve sem erro quando a RPC tem sucesso', async () => {
    const client = rpcClient({ error: null });
    await expect(
      cancelSolicitacaoDesignerRpc(client, { idSolicitacao: 1, idDesigner: 'designer-1' }),
    ).resolves.toBeUndefined();
  });

  it('mapeia P0002 (solicitação não encontrada/não pertence ao designer) para NotFoundError', async () => {
    const client = rpcClient({ error: { message: 'não encontrada', code: 'P0002' } });
    await expect(
      cancelSolicitacaoDesignerRpc(client, { idSolicitacao: 1, idDesigner: 'designer-1' }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('mapeia P0001 (status já terminal) para ConflictError', async () => {
    const client = rpcClient({ error: { message: 'já cancelada', code: 'P0001' } });
    await expect(
      cancelSolicitacaoDesignerRpc(client, { idSolicitacao: 1, idDesigner: 'designer-1' }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('propaga erro inesperado da RPC', async () => {
    const client = rpcClient({ error: { message: 'falha de conexão' } });
    await expect(
      cancelSolicitacaoDesignerRpc(client, { idSolicitacao: 1, idDesigner: 'designer-1' }),
    ).rejects.toThrow('falha de conexão');
  });
});

function updateClient(returnedRows: unknown[]) {
  return {
    from: () => ({
      update: () => ({
        eq: () => ({
          eq: () => ({
            select: () => Promise.resolve({ data: returnedRows, error: null }),
          }),
        }),
      }),
    }),
  } as unknown as Parameters<typeof updateSolicitacaoFields>[0];
}

describe('updateSolicitacaoFields (RF005 — defesa em profundidade de ownership)', () => {
  it('lança NotFoundError quando nenhuma linha corresponde a id + id_designer', async () => {
    const client = updateClient([]);
    await expect(
      updateSolicitacaoFields(client, 1, 'designer-x', { tema: 'Novo' }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('resolve quando exatamente uma linha é atualizada', async () => {
    const client = updateClient([{ id_solicitacao: 1 }]);
    await expect(
      updateSolicitacaoFields(client, 1, 'designer-x', { tema: 'Novo' }),
    ).resolves.toBeUndefined();
  });
});

describe('listSolicitacoes — filtro de data (item 10, correções 13/09/2026)', () => {
  function queryClient() {
    const gte = vi.fn();
    const lt = vi.fn();
    const builder: Record<string, (...args: unknown[]) => unknown> = {};
    builder.select = () => builder;
    builder.order = () => builder;
    builder.eq = () => builder;
    builder.ilike = () => builder;
    builder.gte = (...args: unknown[]) => {
      gte(...args);
      return builder;
    };
    builder.lt = (...args: unknown[]) => {
      lt(...args);
      return builder;
    };
    builder.range = () => Promise.resolve({ data: [], error: null, count: 0 });

    const client = { from: () => builder } as unknown as Parameters<typeof listSolicitacoes>[0];
    return { client, gte, lt };
  }

  it('converte dataInicio/dataFim para instantes em America/Sao_Paulo (-03:00), não UTC puro', async () => {
    const { client, gte, lt } = queryClient();

    await listSolicitacoes(client, {
      dataInicio: '2026-09-09',
      dataFim: '2026-09-10',
      page: 1,
      pageSize: 20,
    });

    expect(gte).toHaveBeenCalledWith('data_criacao', '2026-09-09T00:00:00-03:00');
    expect(lt).toHaveBeenCalledWith('data_criacao', '2026-09-11T00:00:00-03:00');
  });
});

describe('listRespostasBySolicitacao (RF005 — detalhes de atendimento)', () => {
  it('retorna array vazio quando a solicitação não tem atendimento vinculado', async () => {
    const client = {
      from: () => ({
        select: () => ({
          eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }),
        }),
      }),
    } as unknown as Parameters<typeof listRespostasBySolicitacao>[0];

    await expect(listRespostasBySolicitacao(client, 1)).resolves.toEqual([]);
  });
});
