import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConflictError, NotFoundError } from '../lib/errors.js';

const {
  getSupabaseAdminClientMock,
  publishImageMock,
  getActiveAgendamentoBySolicitacaoMock,
  getVersaoArteAtualDaSolicitacaoMock,
  listAgendamentosVencidosMock,
  claimAgendamentoParaPublicacaoMock,
  registerPublicacaoSucessoMock,
  registerPublicacaoFalhaMock,
  getClienteIdDaSolicitacaoMock,
  getSolicitacaoDetailRepoMock,
  createVersaoArteDownloadUrlMock,
  getConexaoAtivaMock,
} = vi.hoisted(() => ({
  getSupabaseAdminClientMock: vi.fn(() => ({ __kind: 'admin-client' })),
  publishImageMock: vi.fn(),
  getActiveAgendamentoBySolicitacaoMock: vi.fn(),
  getVersaoArteAtualDaSolicitacaoMock: vi.fn(),
  listAgendamentosVencidosMock: vi.fn(),
  claimAgendamentoParaPublicacaoMock: vi.fn(),
  registerPublicacaoSucessoMock: vi.fn(),
  registerPublicacaoFalhaMock: vi.fn(),
  getClienteIdDaSolicitacaoMock: vi.fn(),
  getSolicitacaoDetailRepoMock: vi.fn(),
  createVersaoArteDownloadUrlMock: vi.fn(),
  getConexaoAtivaMock: vi.fn(),
}));

vi.mock('../config/supabase.js', () => ({ getSupabaseAdminClient: getSupabaseAdminClientMock }));
vi.mock('../integrations/instagram/instagramClient.js', () => ({ publishImage: publishImageMock }));
vi.mock('../repositories/agendamento.repository.js', () => ({
  getActiveAgendamentoBySolicitacao: getActiveAgendamentoBySolicitacaoMock,
}));
vi.mock('../repositories/clienteInstagram.repository.js', () => ({
  getConexaoAtiva: getConexaoAtivaMock,
}));
vi.mock('../repositories/publicacao.repository.js', () => ({
  getVersaoArteAtualDaSolicitacao: getVersaoArteAtualDaSolicitacaoMock,
  listAgendamentosVencidos: listAgendamentosVencidosMock,
  claimAgendamentoParaPublicacao: claimAgendamentoParaPublicacaoMock,
  registerPublicacaoSucesso: registerPublicacaoSucessoMock,
  registerPublicacaoFalha: registerPublicacaoFalhaMock,
  getClienteIdDaSolicitacao: getClienteIdDaSolicitacaoMock,
}));
vi.mock('../repositories/solicitacao.repository.js', () => ({
  getSolicitacaoDetail: getSolicitacaoDetailRepoMock,
}));
vi.mock('../repositories/versaoArte.repository.js', () => ({
  createVersaoArteDownloadUrl: createVersaoArteDownloadUrlMock,
}));

const { processarAgendamentosVencidos, registrarPublicacaoManual } = await import('./publicacao.service.js');

const AGENDAMENTO_VENCIDO = { idAgendamento: 1, idSolicitacao: 10, legenda: 'Legenda' };

const CONEXAO_ATIVA = {
  instagramUserId: 'conta-cliente-10',
  accessToken: 'token-cliente-10',
  tokenExpiraEm: '2027-01-01T00:00:00Z',
};

describe('processarAgendamentosVencidos (RF014/RN32-RN35/ADR 0005)', () => {
  beforeEach(() => {
    listAgendamentosVencidosMock.mockReset();
    getVersaoArteAtualDaSolicitacaoMock.mockReset();
    getClienteIdDaSolicitacaoMock.mockReset().mockResolvedValue(10);
    getConexaoAtivaMock.mockReset().mockResolvedValue(CONEXAO_ATIVA);
    createVersaoArteDownloadUrlMock.mockReset().mockResolvedValue('https://exemplo.supabase.co/signed');
    publishImageMock.mockReset();
    claimAgendamentoParaPublicacaoMock.mockReset().mockResolvedValue(true);
    registerPublicacaoSucessoMock.mockReset().mockResolvedValue(undefined);
    registerPublicacaoFalhaMock.mockReset().mockResolvedValue(undefined);
  });

  it('publica automaticamente quando o CLIENTE tem conexão Instagram válida e o formato é elegível (JPG/PNG)', async () => {
    listAgendamentosVencidosMock.mockResolvedValue([AGENDAMENTO_VENCIDO]);
    getVersaoArteAtualDaSolicitacaoMock.mockResolvedValue({
      idVersao: 1,
      formato: 'PNG',
      arquivoUrl: 'solicitacoes/10/versoes/x.png',
    });
    publishImageMock.mockResolvedValue({ mediaId: 'ig-1' });

    const result = await processarAgendamentosVencidos();

    expect(result).toEqual({
      processados: 1,
      publicadosAutomaticamente: 1,
      falhas: 0,
      pendentesParaManual: 0,
    });
    expect(publishImageMock).toHaveBeenCalledWith(
      { accessToken: 'token-cliente-10', accountId: 'conta-cliente-10' },
      expect.anything(),
      expect.anything(),
    );
    expect(registerPublicacaoSucessoMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ idAgendamento: 1, tipo: 'automatica', atorId: null }),
    );
  });

  it('deixa pendente para publicação manual quando o CLIENTE não tem conexão Instagram (nunca tenta outra conta)', async () => {
    getConexaoAtivaMock.mockResolvedValue(null);
    listAgendamentosVencidosMock.mockResolvedValue([AGENDAMENTO_VENCIDO]);
    getVersaoArteAtualDaSolicitacaoMock.mockResolvedValue({
      idVersao: 1,
      formato: 'PNG',
      arquivoUrl: 'solicitacoes/10/versoes/x.png',
    });

    const result = await processarAgendamentosVencidos();

    expect(result).toEqual({ processados: 1, publicadosAutomaticamente: 0, falhas: 0, pendentesParaManual: 1 });
    expect(publishImageMock).not.toHaveBeenCalled();
    expect(claimAgendamentoParaPublicacaoMock).not.toHaveBeenCalled();
  });

  it('deixa pendente para publicação manual quando o formato não é publicável (PDF)', async () => {
    listAgendamentosVencidosMock.mockResolvedValue([AGENDAMENTO_VENCIDO]);
    getVersaoArteAtualDaSolicitacaoMock.mockResolvedValue({
      idVersao: 1,
      formato: 'PDF',
      arquivoUrl: 'solicitacoes/10/versoes/x.pdf',
    });

    const result = await processarAgendamentosVencidos();

    expect(result.pendentesParaManual).toBe(1);
    expect(publishImageMock).not.toHaveBeenCalled();
  });

  it('registra falha (sem marcar como publicado) quando a chamada à Instagram API rejeita', async () => {
    listAgendamentosVencidosMock.mockResolvedValue([AGENDAMENTO_VENCIDO]);
    getVersaoArteAtualDaSolicitacaoMock.mockResolvedValue({
      idVersao: 1,
      formato: 'JPG',
      arquivoUrl: 'solicitacoes/10/versoes/x.jpg',
    });
    publishImageMock.mockRejectedValue(new Error('Instagram API indisponível'));

    const result = await processarAgendamentosVencidos();

    expect(result).toEqual({ processados: 1, publicadosAutomaticamente: 0, falhas: 1, pendentesParaManual: 1 });
    expect(registerPublicacaoFalhaMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ idAgendamento: 1 }),
    );
    expect(registerPublicacaoSucessoMock).not.toHaveBeenCalled();
  });

  it('não processa nada quando não há agendamentos vencidos', async () => {
    listAgendamentosVencidosMock.mockResolvedValue([]);

    await expect(processarAgendamentosVencidos()).resolves.toEqual({
      processados: 0,
      publicadosAutomaticamente: 0,
      falhas: 0,
      pendentesParaManual: 0,
    });
  });

  it('não chama a Instagram API quando outra execução do job já reservou o agendamento (RN29 — idempotência)', async () => {
    listAgendamentosVencidosMock.mockResolvedValue([AGENDAMENTO_VENCIDO]);
    getVersaoArteAtualDaSolicitacaoMock.mockResolvedValue({
      idVersao: 1,
      formato: 'PNG',
      arquivoUrl: 'solicitacoes/10/versoes/x.png',
    });
    claimAgendamentoParaPublicacaoMock.mockResolvedValue(false);

    const result = await processarAgendamentosVencidos();

    expect(result).toEqual({ processados: 1, publicadosAutomaticamente: 0, falhas: 0, pendentesParaManual: 1 });
    expect(publishImageMock).not.toHaveBeenCalled();
    expect(registerPublicacaoSucessoMock).not.toHaveBeenCalled();
  });

  it('isola erro inesperado de um agendamento sem interromper o processamento dos demais (Gate G)', async () => {
    const outroAgendamento = { idAgendamento: 2, idSolicitacao: 11, legenda: null };
    listAgendamentosVencidosMock.mockResolvedValue([AGENDAMENTO_VENCIDO, outroAgendamento]);
    getVersaoArteAtualDaSolicitacaoMock.mockImplementation((_client: unknown, idSolicitacao: number) =>
      idSolicitacao === 10
        ? Promise.reject(new Error('erro inesperado de banco'))
        : Promise.resolve({ idVersao: 2, formato: 'PNG', arquivoUrl: 'solicitacoes/11/versoes/y.png' }),
    );
    publishImageMock.mockResolvedValue({ mediaId: 'ig-2' });

    const result = await processarAgendamentosVencidos();

    expect(result).toEqual({ processados: 2, publicadosAutomaticamente: 1, falhas: 1, pendentesParaManual: 1 });
    expect(registerPublicacaoSucessoMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ idAgendamento: 2 }),
    );
  });
});

describe('registrarPublicacaoManual (RF014 — fallback manual)', () => {
  beforeEach(() => {
    getSolicitacaoDetailRepoMock.mockReset();
    getActiveAgendamentoBySolicitacaoMock.mockReset();
    registerPublicacaoSucessoMock.mockReset().mockResolvedValue(undefined);
  });

  it('rejeita quando o callerId não é o dono da solicitação', async () => {
    getSolicitacaoDetailRepoMock.mockResolvedValue({ idDesigner: 'outro-designer', status: 'Agendado' });

    await expect(
      registrarPublicacaoManual({} as never, 10, 'designer-1'),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(registerPublicacaoSucessoMock).not.toHaveBeenCalled();
  });

  it('rejeita quando o status não é "Agendado"', async () => {
    getSolicitacaoDetailRepoMock.mockResolvedValue({ idDesigner: 'designer-1', status: 'Aprovado' });

    await expect(
      registrarPublicacaoManual({} as never, 10, 'designer-1'),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('registra a publicação manual quando ownership e status são válidos', async () => {
    getSolicitacaoDetailRepoMock.mockResolvedValue({ idDesigner: 'designer-1', status: 'Agendado' });
    getActiveAgendamentoBySolicitacaoMock.mockResolvedValue({
      idAgendamento: 7,
      idSolicitacao: 10,
      idDesigner: 'designer-1',
      status: 'Agendado',
    });

    await registrarPublicacaoManual({} as never, 10, 'designer-1');

    expect(registerPublicacaoSucessoMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ idAgendamento: 7, tipo: 'manual', atorId: 'designer-1' }),
    );
  });
});
