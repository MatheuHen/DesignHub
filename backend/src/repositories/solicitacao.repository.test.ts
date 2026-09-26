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

/**
 * Item 6/6.1/6.2 (rodada final): mock multi-tabela — `listSolicitacoes` só
 * consulta `avaliacao_link_token`/`agendamento_publicacao` em lote quando
 * existem linhas 'Enviado para avaliação'/'Agendado' na página atual (nunca
 * uma consulta por linha).
 */
function multiTableClient(config: {
  solicitacaoRows: unknown[];
  avaliacaoLinkRows?: unknown[];
  agendamentoRows?: unknown[];
}) {
  const chamadasPorTabela: Record<string, number> = {};

  return {
    chamadasPorTabela,
    client: {
      from: (table: string) => {
        chamadasPorTabela[table] = (chamadasPorTabela[table] ?? 0) + 1;

        if (table === 'solicitacao') {
          const builder: Record<string, (...args: unknown[]) => unknown> = {};
          builder.select = () => builder;
          builder.order = () => builder;
          builder.eq = () => builder;
          builder.ilike = () => builder;
          builder.gte = () => builder;
          builder.lt = () => builder;
          builder.range = () =>
            Promise.resolve({ data: config.solicitacaoRows, error: null, count: config.solicitacaoRows.length });
          return builder;
        }
        if (table === 'avaliacao_link_token') {
          const builder: Record<string, (...args: unknown[]) => unknown> = {};
          builder.select = () => builder;
          builder.in = () => builder;
          builder.order = () => Promise.resolve({ data: config.avaliacaoLinkRows ?? [], error: null });
          return builder;
        }
        if (table === 'agendamento_publicacao') {
          const builder: Record<string, (...args: unknown[]) => unknown> = {};
          builder.select = () => builder;
          builder.in = () => builder;
          builder.eq = () => Promise.resolve({ data: config.agendamentoRows ?? [], error: null });
          return builder;
        }
        throw new Error(`tabela inesperada no teste: ${table}`);
      },
    } as unknown as Parameters<typeof listSolicitacoes>[0],
  };
}

function solicitacaoRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id_solicitacao: 1,
    id_cliente: 1,
    id_designer: 'designer-1',
    tema: 'Post de aniversário',
    status: 'Em produção',
    data_criacao: '2026-09-01T00:00:00Z',
    prazo_primeira_versao: '2026-09-06T00:00:00Z',
    cliente: { nome: 'Waynne' },
    ...overrides,
  };
}

describe('listSolicitacoes — prazoAtual dinâmico (item 6/6.1/6.2, rodada final)', () => {
  it('"Em produção": prazoAtual usa prazo_primeira_versao, responsável designer (RF006/RN11)', async () => {
    const { client } = multiTableClient({ solicitacaoRows: [solicitacaoRow({ status: 'Em produção' })] });

    const result = await listSolicitacoes(client, { page: 1, pageSize: 20 });

    expect(result.items[0]!.prazoAtual).toEqual({
      tipo: 'primeira_versao',
      dataHora: '2026-09-06T00:00:00Z',
      responsavel: 'designer',
    });
  });

  it('"Ajustes"/"Aprovado": sem SLA documentado — nunca inventa prazo (item 6.2)', async () => {
    const { client } = multiTableClient({
      solicitacaoRows: [
        solicitacaoRow({ id_solicitacao: 1, status: 'Ajustes' }),
        solicitacaoRow({ id_solicitacao: 2, status: 'Aprovado' }),
      ],
    });

    const result = await listSolicitacoes(client, { page: 1, pageSize: 20 });

    expect(result.items[0]!.prazoAtual).toEqual({ tipo: 'sem_prazo_definido', dataHora: null, responsavel: 'designer' });
    expect(result.items[1]!.prazoAtual).toEqual({ tipo: 'sem_prazo_definido', dataHora: null, responsavel: null });
  });

  it('"Cancelado"/"Publicado": terminal — nenhum prazo relevante', async () => {
    const { client } = multiTableClient({
      solicitacaoRows: [
        solicitacaoRow({ id_solicitacao: 1, status: 'Cancelado' }),
        solicitacaoRow({ id_solicitacao: 2, status: 'Publicado' }),
      ],
    });

    const result = await listSolicitacoes(client, { page: 1, pageSize: 20 });

    expect(result.items[0]!.prazoAtual).toEqual({ tipo: 'terminal', dataHora: null, responsavel: null });
    expect(result.items[1]!.prazoAtual).toEqual({ tipo: 'terminal', dataHora: null, responsavel: null });
  });

  it('"Enviado para avaliação": prazoAtual é a validade técnica do link mais recente, responsável cliente (RF009)', async () => {
    const { client, chamadasPorTabela } = multiTableClient({
      solicitacaoRows: [solicitacaoRow({ id_solicitacao: 1, status: 'Enviado para avaliação' })],
      avaliacaoLinkRows: [
        { expires_at: '2026-09-10T00:00:00Z', created_at: '2026-09-08T00:00:00Z', versao_arte: { id_solicitacao: 1 } },
      ],
    });

    const result = await listSolicitacoes(client, { page: 1, pageSize: 20 });

    expect(result.items[0]!.prazoAtual).toEqual({
      tipo: 'validade_link_avaliacao',
      dataHora: '2026-09-10T00:00:00Z',
      responsavel: 'cliente',
    });
    // Uma única consulta em lote para todas as solicitações "Enviado para avaliação" da página.
    expect(chamadasPorTabela['avaliacao_link_token']).toBe(1);
  });

  it('"Enviado para avaliação" sem nenhum link encontrado (caso de borda): sem_prazo_definido, nunca quebra', async () => {
    const { client } = multiTableClient({
      solicitacaoRows: [solicitacaoRow({ id_solicitacao: 1, status: 'Enviado para avaliação' })],
      avaliacaoLinkRows: [],
    });

    const result = await listSolicitacoes(client, { page: 1, pageSize: 20 });

    expect(result.items[0]!.prazoAtual).toEqual({ tipo: 'sem_prazo_definido', dataHora: null, responsavel: null });
  });

  it('"Agendado": prazoAtual é a data/horário programados, responsável sistema (RF012)', async () => {
    const { client, chamadasPorTabela } = multiTableClient({
      solicitacaoRows: [solicitacaoRow({ id_solicitacao: 1, status: 'Agendado' })],
      agendamentoRows: [{ id_solicitacao: 1, data_publicacao: '2026-10-01', horario: '18:00:00' }],
    });

    const result = await listSolicitacoes(client, { page: 1, pageSize: 20 });

    expect(result.items[0]!.prazoAtual).toEqual({
      tipo: 'agendamento',
      dataHora: '2026-10-01T18:00:00',
      responsavel: 'sistema',
    });
    expect(chamadasPorTabela['agendamento_publicacao']).toBe(1);
  });

  it('não consulta avaliacao_link_token/agendamento_publicacao quando não há linhas desses status na página', async () => {
    const { client, chamadasPorTabela } = multiTableClient({
      solicitacaoRows: [solicitacaoRow({ id_solicitacao: 1, status: 'Em produção' })],
    });

    await listSolicitacoes(client, { page: 1, pageSize: 20 });

    expect(chamadasPorTabela['avaliacao_link_token']).toBeUndefined();
    expect(chamadasPorTabela['agendamento_publicacao']).toBeUndefined();
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
