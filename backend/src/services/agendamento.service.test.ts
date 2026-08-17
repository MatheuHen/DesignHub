import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConflictError, NotFoundError } from '../lib/errors.js';

const {
  getSupabaseAdminClientMock,
  getSolicitacaoDetailRepoMock,
  getActiveAgendamentoBySolicitacaoMock,
  createAgendamentoRpcMock,
  updateAgendamentoRpcMock,
  cancelAgendamentoRpcMock,
  listAgendamentosRepoMock,
} = vi.hoisted(() => ({
  getSupabaseAdminClientMock: vi.fn(() => ({ __kind: 'admin-client' })),
  getSolicitacaoDetailRepoMock: vi.fn(),
  getActiveAgendamentoBySolicitacaoMock: vi.fn(),
  createAgendamentoRpcMock: vi.fn(),
  updateAgendamentoRpcMock: vi.fn(),
  cancelAgendamentoRpcMock: vi.fn(),
  listAgendamentosRepoMock: vi.fn(),
}));

vi.mock('../config/supabase.js', () => ({ getSupabaseAdminClient: getSupabaseAdminClientMock }));
vi.mock('../repositories/solicitacao.repository.js', () => ({
  getSolicitacaoDetail: getSolicitacaoDetailRepoMock,
}));
vi.mock('../repositories/agendamento.repository.js', () => ({
  getActiveAgendamentoBySolicitacao: getActiveAgendamentoBySolicitacaoMock,
  createAgendamentoRpc: createAgendamentoRpcMock,
  updateAgendamentoRpc: updateAgendamentoRpcMock,
  cancelAgendamentoRpc: cancelAgendamentoRpcMock,
  listAgendamentos: listAgendamentosRepoMock,
}));

const { createAgendamento, updateAgendamento, cancelAgendamento, listAgendamentos } = await import(
  './agendamento.service.js'
);

const sampleBody = { dataPublicacao: '2026-09-01', horario: '10:00', legenda: 'Legenda' };

describe('createAgendamento (RF012/RN27/RN30)', () => {
  beforeEach(() => {
    getSolicitacaoDetailRepoMock.mockReset();
    createAgendamentoRpcMock.mockReset().mockResolvedValue({ idAgendamento: 1 });
  });

  it('rejeita quando o callerId não é o dono da solicitação', async () => {
    getSolicitacaoDetailRepoMock.mockResolvedValue({ idDesigner: 'outro-designer', status: 'Aprovado' });

    await expect(
      createAgendamento({} as never, 10, 'designer-1', sampleBody),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(createAgendamentoRpcMock).not.toHaveBeenCalled();
  });

  it('rejeita quando o status não é "Aprovado" (RN30)', async () => {
    getSolicitacaoDetailRepoMock.mockResolvedValue({ idDesigner: 'designer-1', status: 'Em produção' });

    await expect(
      createAgendamento({} as never, 10, 'designer-1', sampleBody),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(createAgendamentoRpcMock).not.toHaveBeenCalled();
  });

  it('cria o agendamento quando status é "Aprovado" e o callerId é o dono', async () => {
    getSolicitacaoDetailRepoMock.mockResolvedValue({ idDesigner: 'designer-1', status: 'Aprovado' });

    await expect(createAgendamento({} as never, 10, 'designer-1', sampleBody)).resolves.toEqual({
      idAgendamento: 1,
    });
    expect(createAgendamentoRpcMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ idSolicitacao: 10, idDesigner: 'designer-1', body: sampleBody }),
    );
  });
});

describe('updateAgendamento / cancelAgendamento (RF012/RF013)', () => {
  beforeEach(() => {
    getActiveAgendamentoBySolicitacaoMock.mockReset();
    updateAgendamentoRpcMock.mockReset().mockResolvedValue(undefined);
    cancelAgendamentoRpcMock.mockReset().mockResolvedValue(undefined);
  });

  it('updateAgendamento rejeita quando não há agendamento ativo para o callerId', async () => {
    getActiveAgendamentoBySolicitacaoMock.mockResolvedValue(null);

    await expect(
      updateAgendamento({} as never, 10, 'designer-1', sampleBody),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(updateAgendamentoRpcMock).not.toHaveBeenCalled();
  });

  it('updateAgendamento rejeita quando o agendamento ativo pertence a outro designer', async () => {
    getActiveAgendamentoBySolicitacaoMock.mockResolvedValue({
      idAgendamento: 7,
      idSolicitacao: 10,
      idDesigner: 'outro-designer',
      status: 'Agendado',
    });

    await expect(
      updateAgendamento({} as never, 10, 'designer-1', sampleBody),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('updateAgendamento delega ao RPC com o id do agendamento ativo resolvido', async () => {
    getActiveAgendamentoBySolicitacaoMock.mockResolvedValue({
      idAgendamento: 7,
      idSolicitacao: 10,
      idDesigner: 'designer-1',
      status: 'Agendado',
    });

    await updateAgendamento({} as never, 10, 'designer-1', sampleBody);

    expect(updateAgendamentoRpcMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ idAgendamento: 7, idDesigner: 'designer-1', body: sampleBody }),
    );
  });

  it('cancelAgendamento rejeita quando não há agendamento ativo', async () => {
    getActiveAgendamentoBySolicitacaoMock.mockResolvedValue(null);

    await expect(cancelAgendamento({} as never, 10, 'designer-1')).rejects.toBeInstanceOf(NotFoundError);
    expect(cancelAgendamentoRpcMock).not.toHaveBeenCalled();
  });

  it('cancelAgendamento delega ao RPC com o id do agendamento ativo resolvido', async () => {
    getActiveAgendamentoBySolicitacaoMock.mockResolvedValue({
      idAgendamento: 7,
      idSolicitacao: 10,
      idDesigner: 'designer-1',
      status: 'Agendado',
    });

    await cancelAgendamento({} as never, 10, 'designer-1');

    expect(cancelAgendamentoRpcMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ idAgendamento: 7, idDesigner: 'designer-1' }),
    );
  });
});

describe('listAgendamentos (RF012)', () => {
  it('repassa paginação e delega ao repositório', async () => {
    listAgendamentosRepoMock.mockResolvedValue({ items: [], total: 0 });

    const result = await listAgendamentos({} as never, { page: 2, pageSize: 10 });

    expect(result).toEqual({ items: [], total: 0, page: 2, pageSize: 10 });
  });
});
