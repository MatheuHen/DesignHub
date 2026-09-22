import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConflictError, NotFoundError } from '../lib/errors.js';

const {
  getSupabaseAdminClientMock,
  getSolicitacaoDetailMock,
  listHistoricoSolicitacaoMock,
  listRespostasBySolicitacaoMock,
  listVersoesArteMock,
  listAjustesBySolicitacaoMock,
  getAjusteReferenciaPathMock,
  getReferenciaPathBySolicitacaoMock,
  getAgendamentoPreferenciaMock,
  updateSolicitacaoFieldsMock,
  cancelSolicitacaoDesignerRpcMock,
  getActiveAgendamentoSummaryMock,
  createVersaoArteDownloadUrlMock,
  findClienteByIdMock,
  sendTextMessageMock,
} = vi.hoisted(() => ({
  getSupabaseAdminClientMock: vi.fn(() => ({ __kind: 'admin-client' })),
  getSolicitacaoDetailMock: vi.fn(),
  listHistoricoSolicitacaoMock: vi.fn(),
  listRespostasBySolicitacaoMock: vi.fn(),
  listVersoesArteMock: vi.fn(),
  listAjustesBySolicitacaoMock: vi.fn(),
  getAjusteReferenciaPathMock: vi.fn(),
  getReferenciaPathBySolicitacaoMock: vi.fn(),
  getAgendamentoPreferenciaMock: vi.fn(),
  updateSolicitacaoFieldsMock: vi.fn(),
  cancelSolicitacaoDesignerRpcMock: vi.fn(),
  getActiveAgendamentoSummaryMock: vi.fn(),
  createVersaoArteDownloadUrlMock: vi.fn(),
  findClienteByIdMock: vi.fn(),
  sendTextMessageMock: vi.fn(),
}));

vi.mock('../config/supabase.js', () => ({
  getSupabaseAdminClient: getSupabaseAdminClientMock,
}));

vi.mock('../repositories/solicitacao.repository.js', () => ({
  getSolicitacaoDetail: getSolicitacaoDetailMock,
  listHistoricoSolicitacao: listHistoricoSolicitacaoMock,
  listRespostasBySolicitacao: listRespostasBySolicitacaoMock,
  listVersoesArte: listVersoesArteMock,
  listAjustesBySolicitacao: listAjustesBySolicitacaoMock,
  getAjusteReferenciaPath: getAjusteReferenciaPathMock,
  getReferenciaPathBySolicitacao: getReferenciaPathBySolicitacaoMock,
  getAgendamentoPreferencia: getAgendamentoPreferenciaMock,
  listSolicitacoes: vi.fn(),
  updateSolicitacaoFields: updateSolicitacaoFieldsMock,
  cancelSolicitacaoDesignerRpc: cancelSolicitacaoDesignerRpcMock,
}));

vi.mock('../repositories/agendamento.repository.js', () => ({
  getActiveAgendamentoSummary: getActiveAgendamentoSummaryMock,
}));

vi.mock('../repositories/versaoArte.repository.js', () => ({
  createVersaoArteDownloadUrl: createVersaoArteDownloadUrlMock,
}));

vi.mock('../repositories/atendimento.repository.js', () => ({
  findClienteById: findClienteByIdMock,
}));

vi.mock('../integrations/whatsapp/whatsappClient.js', () => {
  class WhatsAppReengagementRequiredError extends Error {}
  return {
    sendTextMessage: sendTextMessageMock,
    WhatsAppReengagementRequiredError,
  };
});

const { cancelSolicitacao, getSolicitacaoDetail, updateSolicitacao } = await import('./solicitacao.service.js');

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
    listAjustesBySolicitacaoMock.mockReset().mockResolvedValue([]);
    getAjusteReferenciaPathMock.mockReset();
    getReferenciaPathBySolicitacaoMock.mockReset();
    getAgendamentoPreferenciaMock.mockReset().mockResolvedValue(null);
    updateSolicitacaoFieldsMock.mockReset();
    getActiveAgendamentoSummaryMock.mockReset();
    createVersaoArteDownloadUrlMock.mockReset();
    cancelSolicitacaoDesignerRpcMock.mockReset();
    findClienteByIdMock.mockReset();
    sendTextMessageMock.mockReset();
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

  it('getSolicitacaoDetail permite Administrador consultar solicitação de qualquer designer (RF016/QUADRO 61)', async () => {
    getSolicitacaoDetailMock.mockResolvedValue(sampleSolicitacao);
    listHistoricoSolicitacaoMock.mockResolvedValue([]);

    const result = await getSolicitacaoDetail({} as never, 10, 'admin-1', { allowAnyDesigner: true });

    expect(result.solicitacao).toEqual(sampleSolicitacao);
    expect(listHistoricoSolicitacaoMock).toHaveBeenCalled();
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

  describe('cancelSolicitacao (item 12/30 — rodada correções)', () => {
    it.each(['Em produção', 'Enviado para avaliação', 'Ajustes', 'Aprovado', 'Agendado'] as const)(
      'cancela quando o status é "%s" (estado ativo) e avisa o cliente',
      async (status) => {
        getSolicitacaoDetailMock.mockResolvedValue({ ...sampleSolicitacao, status });
        cancelSolicitacaoDesignerRpcMock.mockResolvedValue(undefined);
        findClienteByIdMock.mockResolvedValue({ id: 1, whatsapp: '5511999999999' });
        sendTextMessageMock.mockResolvedValue({ wamid: 'wamid.out' });

        await cancelSolicitacao({} as never, 10, 'designer-1');

        expect(cancelSolicitacaoDesignerRpcMock).toHaveBeenCalledWith(expect.anything(), {
          idSolicitacao: 10,
          idDesigner: 'designer-1',
        });
        expect(sendTextMessageMock).toHaveBeenCalledWith(
          '5511999999999',
          expect.stringContaining('cancelada pelo designer'),
        );
      },
    );

    it.each(['Cancelado', 'Publicado'] as const)(
      'rejeita com ConflictError quando o status já é terminal ("%s") — nunca chama a RPC',
      async (status) => {
        getSolicitacaoDetailMock.mockResolvedValue({ ...sampleSolicitacao, status });

        await expect(cancelSolicitacao({} as never, 10, 'designer-1')).rejects.toBeInstanceOf(ConflictError);
        expect(cancelSolicitacaoDesignerRpcMock).not.toHaveBeenCalled();
      },
    );

    it('lança NotFoundError quando não é o dono (defesa em profundidade)', async () => {
      getSolicitacaoDetailMock.mockResolvedValue(sampleSolicitacao);

      await expect(cancelSolicitacao({} as never, 10, 'outro-designer')).rejects.toBeInstanceOf(NotFoundError);
      expect(cancelSolicitacaoDesignerRpcMock).not.toHaveBeenCalled();
    });

    it('a solicitação já cancelada com sucesso não é desfeita se o aviso ao cliente falhar (melhor-esforço)', async () => {
      getSolicitacaoDetailMock.mockResolvedValue(sampleSolicitacao);
      cancelSolicitacaoDesignerRpcMock.mockResolvedValue(undefined);
      findClienteByIdMock.mockRejectedValue(new Error('erro inesperado'));

      await expect(cancelSolicitacao({} as never, 10, 'designer-1')).resolves.toBeUndefined();
    });

    it('não tenta avisar quando o cliente não tem WhatsApp cadastrado', async () => {
      getSolicitacaoDetailMock.mockResolvedValue(sampleSolicitacao);
      cancelSolicitacaoDesignerRpcMock.mockResolvedValue(undefined);
      findClienteByIdMock.mockResolvedValue({ id: 1, whatsapp: null });

      await cancelSolicitacao({} as never, 10, 'designer-1');

      expect(sendTextMessageMock).not.toHaveBeenCalled();
    });
  });
});
