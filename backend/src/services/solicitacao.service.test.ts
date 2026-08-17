import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NotFoundError } from '../lib/errors.js';

const {
  getSupabaseAdminClientMock,
  getSolicitacaoDetailMock,
  listHistoricoSolicitacaoMock,
  listRespostasBySolicitacaoMock,
  listVersoesArteMock,
  updateSolicitacaoFieldsMock,
  getActiveAgendamentoSummaryMock,
} = vi.hoisted(() => ({
  getSupabaseAdminClientMock: vi.fn(() => ({ __kind: 'admin-client' })),
  getSolicitacaoDetailMock: vi.fn(),
  listHistoricoSolicitacaoMock: vi.fn(),
  listRespostasBySolicitacaoMock: vi.fn(),
  listVersoesArteMock: vi.fn(),
  updateSolicitacaoFieldsMock: vi.fn(),
  getActiveAgendamentoSummaryMock: vi.fn(),
}));

vi.mock('../config/supabase.js', () => ({
  getSupabaseAdminClient: getSupabaseAdminClientMock,
}));

vi.mock('../repositories/solicitacao.repository.js', () => ({
  getSolicitacaoDetail: getSolicitacaoDetailMock,
  listHistoricoSolicitacao: listHistoricoSolicitacaoMock,
  listRespostasBySolicitacao: listRespostasBySolicitacaoMock,
  listVersoesArte: listVersoesArteMock,
  listSolicitacoes: vi.fn(),
  updateSolicitacaoFields: updateSolicitacaoFieldsMock,
}));

vi.mock('../repositories/agendamento.repository.js', () => ({
  getActiveAgendamentoSummary: getActiveAgendamentoSummaryMock,
}));

const { getSolicitacaoDetail, updateSolicitacao } = await import('./solicitacao.service.js');

const sampleSolicitacao = {
  id: 10,
  idCliente: 1,
  clienteNome: 'Cliente Teste',
  idDesigner: 'designer-1',
  tema: 'Tema X',
  status: 'Em produção' as const,
  dataCriacao: '2026-01-01T00:00:00Z',
  prazoPrimeiraVersao: '2026-01-06T00:00:00Z',
  descricao: null,
  cores: 'Azul',
  observacoes: null,
};

describe('solicitacao.service (RF005)', () => {
  beforeEach(() => {
    getSolicitacaoDetailMock.mockReset();
    listHistoricoSolicitacaoMock.mockReset().mockResolvedValue([]);
    listRespostasBySolicitacaoMock.mockReset().mockResolvedValue([]);
    listVersoesArteMock.mockReset().mockResolvedValue([]);
    updateSolicitacaoFieldsMock.mockReset();
    getActiveAgendamentoSummaryMock.mockReset();
  });

  it('getSolicitacaoDetail lança NotFoundError quando não pertence ao designer (ownership via RLS)', async () => {
    getSolicitacaoDetailMock.mockResolvedValue(null);

    await expect(getSolicitacaoDetail({} as never, 999, 'designer-1')).rejects.toBeInstanceOf(
      NotFoundError,
    );
    expect(listHistoricoSolicitacaoMock).not.toHaveBeenCalled();
  });

  it('getSolicitacaoDetail lança NotFoundError quando o callerId não é o dono real (defesa em profundidade além do RLS)', async () => {
    getSolicitacaoDetailMock.mockResolvedValue(sampleSolicitacao);

    await expect(getSolicitacaoDetail({} as never, 10, 'outro-designer')).rejects.toBeInstanceOf(
      NotFoundError,
    );
    expect(listHistoricoSolicitacaoMock).not.toHaveBeenCalled();
  });

  it('getSolicitacaoDetail retorna solicitação + histórico + atendimento + versões', async () => {
    getSolicitacaoDetailMock.mockResolvedValue(sampleSolicitacao);
    listHistoricoSolicitacaoMock.mockResolvedValue([
      {
        id_historico: 1,
        acao: 'criada',
        status_anterior: null,
        status_novo: 'Em produção',
        data_hora: '2026-01-01T00:00:00Z',
      },
    ]);
    listRespostasBySolicitacaoMock.mockResolvedValue([
      { pergunta: 'Qual o tema?', resposta: 'Tema X', data_hora: '2026-01-01T00:00:00Z' },
    ]);

    const result = await getSolicitacaoDetail({} as never, 10, 'designer-1');

    expect(result.solicitacao).toEqual(sampleSolicitacao);
    expect(result.historico).toHaveLength(1);
    expect(result.respostasAtendimento).toHaveLength(1);
    expect(result.versoes).toEqual([]);
    expect(result.agendamento).toBeNull();
    expect(getActiveAgendamentoSummaryMock).not.toHaveBeenCalled();
  });

  it('getSolicitacaoDetail busca o agendamento ativo somente quando status = "Agendado" (RF012)', async () => {
    getSolicitacaoDetailMock.mockResolvedValue({ ...sampleSolicitacao, status: 'Agendado' as const });
    getActiveAgendamentoSummaryMock.mockResolvedValue({
      idAgendamento: 7,
      dataPublicacao: '2026-09-01',
      horario: '10:00:00',
      legenda: 'Legenda',
    });

    const result = await getSolicitacaoDetail({} as never, 10, 'designer-1');

    expect(result.agendamento).toEqual({
      idAgendamento: 7,
      dataPublicacao: '2026-09-01',
      horario: '10:00:00',
      legenda: 'Legenda',
    });
    expect(getActiveAgendamentoSummaryMock).toHaveBeenCalledWith(expect.anything(), 10);
  });

  it('updateSolicitacao só escreve depois de confirmar ownership', async () => {
    getSolicitacaoDetailMock.mockResolvedValue(sampleSolicitacao);
    updateSolicitacaoFieldsMock.mockResolvedValue(undefined);

    await updateSolicitacao({} as never, 10, 'designer-1', { tema: 'Novo tema' });

    expect(updateSolicitacaoFieldsMock).toHaveBeenCalledWith(expect.anything(), 10, 'designer-1', {
      tema: 'Novo tema',
    });
  });

  it('updateSolicitacao rejeita sem escrever quando não é dono', async () => {
    getSolicitacaoDetailMock.mockResolvedValue(null);

    await expect(
      updateSolicitacao({} as never, 10, 'designer-1', { tema: 'Novo tema' }),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(updateSolicitacaoFieldsMock).not.toHaveBeenCalled();
  });

  it('updateSolicitacao rejeita sem escrever quando o callerId não é o dono real', async () => {
    getSolicitacaoDetailMock.mockResolvedValue(sampleSolicitacao);

    await expect(
      updateSolicitacao({} as never, 10, 'outro-designer', { tema: 'Novo tema' }),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(updateSolicitacaoFieldsMock).not.toHaveBeenCalled();
  });
});
