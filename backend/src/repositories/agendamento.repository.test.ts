import { describe, expect, it } from 'vitest';
import { ConflictError, NotFoundError, ValidationError } from '../lib/errors.js';
import {
  cancelAgendamentoRpc,
  createAgendamentoRpc,
  getActiveAgendamentoBySolicitacao,
  updateAgendamentoRpc,
} from './agendamento.repository.js';

const sampleBody = { dataPublicacao: '2026-09-01', horario: '10:00', legenda: 'Legenda' };

function rpcClient(response: { data: unknown; error: { message: string; code?: string } | null }) {
  return { rpc: () => Promise.resolve(response) } as unknown as Parameters<typeof createAgendamentoRpc>[0];
}

describe('createAgendamentoRpc (RF012/RN27/RN30)', () => {
  it('mapeia P0002 (solicitação não encontrada/não pertence ao designer) para NotFoundError', async () => {
    const client = rpcClient({ data: null, error: { message: 'não encontrada', code: 'P0002' } });
    await expect(
      createAgendamentoRpc(client, { idSolicitacao: 1, idDesigner: 'designer-1', body: sampleBody }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('mapeia P0001 (status não é Aprovado) para ConflictError', async () => {
    const client = rpcClient({ data: null, error: { message: 'não aprovada', code: 'P0001' } });
    await expect(
      createAgendamentoRpc(client, { idSolicitacao: 1, idDesigner: 'designer-1', body: sampleBody }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('mapeia P0004 (data no passado) para ValidationError', async () => {
    const client = rpcClient({ data: null, error: { message: 'no passado', code: 'P0004' } });
    await expect(
      createAgendamentoRpc(client, { idSolicitacao: 1, idDesigner: 'designer-1', body: sampleBody }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('retorna o id do agendamento quando a RPC resolve com sucesso', async () => {
    const client = rpcClient({ data: [{ id_agendamento: 7 }], error: null });
    await expect(
      createAgendamentoRpc(client, { idSolicitacao: 1, idDesigner: 'designer-1', body: sampleBody }),
    ).resolves.toEqual({ idAgendamento: 7 });
  });
});

describe('updateAgendamentoRpc (RF012)', () => {
  it('mapeia P0001 (agendamento não ativo) para ConflictError', async () => {
    const client = rpcClient({ data: null, error: { message: 'não ativo', code: 'P0001' } });
    await expect(
      updateAgendamentoRpc(client, { idAgendamento: 1, idDesigner: 'designer-1', body: sampleBody }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('resolve sem erro quando a RPC tem sucesso', async () => {
    const client = rpcClient({ data: null, error: null });
    await expect(
      updateAgendamentoRpc(client, { idAgendamento: 1, idDesigner: 'designer-1', body: sampleBody }),
    ).resolves.toBeUndefined();
  });
});

describe('cancelAgendamentoRpc (RF013/RN31)', () => {
  it('mapeia P0005 (janela de 3h) para ConflictError com mensagem específica de RN31', async () => {
    const client = rpcClient({ data: null, error: { message: 'janela', code: 'P0005' } });
    await expect(
      cancelAgendamentoRpc(client, { idAgendamento: 1, idDesigner: 'designer-1' }),
    ).rejects.toThrow(/3 horas/);
  });

  it('resolve sem erro quando a RPC tem sucesso', async () => {
    const client = rpcClient({ data: null, error: null });
    await expect(
      cancelAgendamentoRpc(client, { idAgendamento: 1, idDesigner: 'designer-1' }),
    ).resolves.toBeUndefined();
  });
});

describe('getActiveAgendamentoBySolicitacao (RF012/RF013 — resolução do agendamento ativo)', () => {
  it('retorna null quando não há agendamento ativo', async () => {
    const client = {
      from: () => ({
        select: () => ({
          eq: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }),
        }),
      }),
    } as unknown as Parameters<typeof getActiveAgendamentoBySolicitacao>[0];

    await expect(getActiveAgendamentoBySolicitacao(client, 1)).resolves.toBeNull();
  });

  it('retorna os dados do agendamento ativo quando existe', async () => {
    const client = {
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: () =>
                Promise.resolve({
                  data: {
                    id_agendamento: 7,
                    id_solicitacao: 1,
                    status: 'Agendado',
                    solicitacao: { id_designer: 'designer-1' },
                  },
                  error: null,
                }),
            }),
          }),
        }),
      }),
    } as unknown as Parameters<typeof getActiveAgendamentoBySolicitacao>[0];

    await expect(getActiveAgendamentoBySolicitacao(client, 1)).resolves.toEqual({
      idAgendamento: 7,
      idSolicitacao: 1,
      idDesigner: 'designer-1',
      status: 'Agendado',
    });
  });
});
