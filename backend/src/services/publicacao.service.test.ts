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
  findClienteByIdMock,
  sendTextMessageMock,
  getPublicacaoBySolicitacaoMock,
  setPublicacaoComprovanteMock,
  uploadArquivoToStorageMock,
  removeArquivoFromStorageBestEffortMock,
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
  findClienteByIdMock: vi.fn(),
  sendTextMessageMock: vi.fn(),
  getPublicacaoBySolicitacaoMock: vi.fn(),
  setPublicacaoComprovanteMock: vi.fn(),
  uploadArquivoToStorageMock: vi.fn(),
  removeArquivoFromStorageBestEffortMock: vi.fn(),
}));

vi.mock('../config/supabase.js', () => ({ getSupabaseAdminClient: getSupabaseAdminClientMock }));
vi.mock('../integrations/instagram/instagramClient.js', () => ({ publishImage: publishImageMock }));
vi.mock('../integrations/whatsapp/whatsappClient.js', () => ({ sendTextMessage: sendTextMessageMock }));
vi.mock('../repositories/agendamento.repository.js', () => ({
  getActiveAgendamentoBySolicitacao: getActiveAgendamentoBySolicitacaoMock,
}));
vi.mock('../repositories/atendimento.repository.js', () => ({
  findClienteById: findClienteByIdMock,
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
  getPublicacaoBySolicitacao: getPublicacaoBySolicitacaoMock,
  setPublicacaoComprovante: setPublicacaoComprovanteMock,
}));
vi.mock('../repositories/solicitacao.repository.js', () => ({
  getSolicitacaoDetail: getSolicitacaoDetailRepoMock,
}));
vi.mock('../repositories/versaoArte.repository.js', () => ({
  createVersaoArteDownloadUrl: createVersaoArteDownloadUrlMock,
  uploadArquivoToStorage: uploadArquivoToStorageMock,
  removeArquivoFromStorageBestEffort: removeArquivoFromStorageBestEffortMock,
}));

const {
  processarAgendamentosVencidos,
  registrarPublicacaoManual,
  uploadComprovantePublicacao,
  getPublicacaoDetalhe,
  getComprovanteDownloadUrl,
} = await import('./publicacao.service.js');

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
    getSolicitacaoDetailRepoMock.mockReset();
    findClienteByIdMock.mockReset();
    sendTextMessageMock.mockReset();
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

  it('item 9.1 (correções 13/09/2026): propaga o permalink retornado pela Meta ao registrar a publicação', async () => {
    listAgendamentosVencidosMock.mockResolvedValue([AGENDAMENTO_VENCIDO]);
    getVersaoArteAtualDaSolicitacaoMock.mockResolvedValue({
      idVersao: 1,
      numeroVersao: 3,
      formato: 'PNG',
      arquivoUrl: 'solicitacoes/10/versoes/x.png',
    });
    publishImageMock.mockResolvedValue({ mediaId: 'ig-1', permalink: 'https://www.instagram.com/p/abc123/' });

    await processarAgendamentosVencidos();

    expect(registerPublicacaoSucessoMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ permalink: 'https://www.instagram.com/p/abc123/' }),
    );
  });

  it('item 9.2/9.4: notifica o cliente via WhatsApp identificando tema/versão, sem ID técnico, após publicar', async () => {
    listAgendamentosVencidosMock.mockResolvedValue([AGENDAMENTO_VENCIDO]);
    getVersaoArteAtualDaSolicitacaoMock.mockResolvedValue({
      idVersao: 1,
      numeroVersao: 3,
      formato: 'PNG',
      arquivoUrl: 'solicitacoes/10/versoes/x.png',
    });
    publishImageMock.mockResolvedValue({ mediaId: 'ig-1', permalink: null });
    getSolicitacaoDetailRepoMock.mockResolvedValue({ idCliente: 5, tema: 'Post promocional' });
    findClienteByIdMock.mockResolvedValue({ id: 5, whatsapp: '5511999999999' });
    sendTextMessageMock.mockResolvedValue({ wamid: 'wamid.1' });

    await processarAgendamentosVencidos();

    expect(sendTextMessageMock).toHaveBeenCalledOnce();
    const [toNumber, message] = sendTextMessageMock.mock.calls[0] as [string, string];
    expect(toNumber).toBe('5511999999999');
    expect(message).toContain('ARTE PUBLICADA');
    expect(message).toContain('Post promocional');
    expect(message).toContain('versão 3');
    expect(message).not.toContain('10'); // id_solicitacao/id_agendamento nunca aparecem no texto
  });

  it('item 9.2: falha ao notificar via WhatsApp não desfaz a publicação já registrada (melhor esforço)', async () => {
    listAgendamentosVencidosMock.mockResolvedValue([AGENDAMENTO_VENCIDO]);
    getVersaoArteAtualDaSolicitacaoMock.mockResolvedValue({
      idVersao: 1,
      numeroVersao: 3,
      formato: 'PNG',
      arquivoUrl: 'solicitacoes/10/versoes/x.png',
    });
    publishImageMock.mockResolvedValue({ mediaId: 'ig-1', permalink: null });
    getSolicitacaoDetailRepoMock.mockResolvedValue({ idCliente: 5, tema: 'Post promocional' });
    findClienteByIdMock.mockResolvedValue({ id: 5, whatsapp: '5511999999999' });
    sendTextMessageMock.mockRejectedValue(new Error('WhatsApp indisponível'));

    const result = await processarAgendamentosVencidos();

    expect(result.publicadosAutomaticamente).toBe(1);
    expect(registerPublicacaoSucessoMock).toHaveBeenCalledOnce();
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
    getVersaoArteAtualDaSolicitacaoMock.mockReset();
    findClienteByIdMock.mockReset();
    sendTextMessageMock.mockReset();
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

  it('item 9.2/9.4 (correções 13/09/2026): notifica o cliente via WhatsApp também na publicação manual', async () => {
    getSolicitacaoDetailRepoMock.mockResolvedValue({
      idDesigner: 'designer-1',
      status: 'Agendado',
      idCliente: 5,
      tema: 'Post promocional',
    });
    getActiveAgendamentoBySolicitacaoMock.mockResolvedValue({
      idAgendamento: 7,
      idSolicitacao: 10,
      idDesigner: 'designer-1',
      status: 'Agendado',
    });
    getVersaoArteAtualDaSolicitacaoMock.mockResolvedValue({
      idVersao: 1,
      numeroVersao: 2,
      formato: 'PDF',
      arquivoUrl: 'solicitacoes/10/versoes/x.pdf',
    });
    findClienteByIdMock.mockResolvedValue({ id: 5, whatsapp: '5511999999999' });
    sendTextMessageMock.mockResolvedValue({ wamid: 'wamid.1' });

    await registrarPublicacaoManual({} as never, 10, 'designer-1');

    expect(sendTextMessageMock).toHaveBeenCalledOnce();
    const [, message] = sendTextMessageMock.mock.calls[0] as [string, string];
    expect(message).toContain('Post promocional');
    expect(message).toContain('versão 2');
  });
});

const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0xff]);
const EXE_BYTES = Buffer.from('MZ conteúdo executável disfarçado');

describe('uploadComprovantePublicacao (item 9.3 — correções 13/09/2026)', () => {
  beforeEach(() => {
    getSolicitacaoDetailRepoMock.mockReset();
    getPublicacaoBySolicitacaoMock.mockReset();
    uploadArquivoToStorageMock.mockReset().mockResolvedValue(undefined);
    setPublicacaoComprovanteMock.mockReset().mockResolvedValue(undefined);
    removeArquivoFromStorageBestEffortMock.mockReset().mockResolvedValue(undefined);
  });

  it('rejeita quando o callerId não é o dono da solicitação', async () => {
    getSolicitacaoDetailRepoMock.mockResolvedValue({ idDesigner: 'outro-designer', status: 'Publicado' });

    await expect(
      uploadComprovantePublicacao({} as never, 10, 'designer-1', PNG_BYTES),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(uploadArquivoToStorageMock).not.toHaveBeenCalled();
  });

  it('rejeita quando o status não é "Publicado"', async () => {
    getSolicitacaoDetailRepoMock.mockResolvedValue({ idDesigner: 'designer-1', status: 'Agendado' });

    await expect(
      uploadComprovantePublicacao({} as never, 10, 'designer-1', PNG_BYTES),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('rejeita formato não suportado (seção 12.2 — assinatura real dos bytes)', async () => {
    getSolicitacaoDetailRepoMock.mockResolvedValue({ idDesigner: 'designer-1', status: 'Publicado' });

    await expect(
      uploadComprovantePublicacao({} as never, 10, 'designer-1', EXE_BYTES),
    ).rejects.toThrow('Formato não suportado');
    expect(uploadArquivoToStorageMock).not.toHaveBeenCalled();
  });

  it('rejeita quando não há publicação registrada para a solicitação', async () => {
    getSolicitacaoDetailRepoMock.mockResolvedValue({ idDesigner: 'designer-1', status: 'Publicado' });
    getPublicacaoBySolicitacaoMock.mockResolvedValue(null);

    await expect(
      uploadComprovantePublicacao({} as never, 10, 'designer-1', PNG_BYTES),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('envia ao Storage e vincula o comprovante quando tudo é válido', async () => {
    getSolicitacaoDetailRepoMock.mockResolvedValue({ idDesigner: 'designer-1', status: 'Publicado' });
    getPublicacaoBySolicitacaoMock.mockResolvedValue({ idPublicacao: 1 });

    await uploadComprovantePublicacao({} as never, 10, 'designer-1', PNG_BYTES);

    expect(uploadArquivoToStorageMock).toHaveBeenCalledOnce();
    expect(setPublicacaoComprovanteMock).toHaveBeenCalledWith(
      expect.anything(),
      1,
      expect.stringMatching(/^solicitacoes\/10\/publicacao\/.+\.png$/),
    );
  });

  it('remove o objeto do Storage (compensação) quando vincular o comprovante falha', async () => {
    getSolicitacaoDetailRepoMock.mockResolvedValue({ idDesigner: 'designer-1', status: 'Publicado' });
    getPublicacaoBySolicitacaoMock.mockResolvedValue({ idPublicacao: 1 });
    setPublicacaoComprovanteMock.mockRejectedValue(new Error('falha ao atualizar'));

    await expect(uploadComprovantePublicacao({} as never, 10, 'designer-1', PNG_BYTES)).rejects.toThrow(
      'falha ao atualizar',
    );
    expect(removeArquivoFromStorageBestEffortMock).toHaveBeenCalledOnce();
  });
});

describe('getPublicacaoDetalhe (item 9.1 — badge de publicação)', () => {
  it('retorna null quando não há publicação', async () => {
    getPublicacaoBySolicitacaoMock.mockReset().mockResolvedValue(null);
    await expect(getPublicacaoDetalhe({} as never, 10)).resolves.toBeNull();
  });

  it('mapeia temComprovante a partir da presença de comprovanteUrl', async () => {
    getPublicacaoBySolicitacaoMock.mockReset().mockResolvedValue({
      idPublicacao: 1,
      dataPublicada: '2026-09-01T12:00:00Z',
      tipo: 'manual',
      permalink: null,
      comprovanteUrl: 'solicitacoes/10/publicacao/x.png',
      numeroVersao: 2,
    });

    await expect(getPublicacaoDetalhe({} as never, 10)).resolves.toEqual({
      dataPublicada: '2026-09-01T12:00:00Z',
      tipo: 'manual',
      permalink: null,
      numeroVersao: 2,
      temComprovante: true,
    });
  });
});

describe('getComprovanteDownloadUrl (item 9.3)', () => {
  beforeEach(() => {
    getSolicitacaoDetailRepoMock.mockReset();
    getPublicacaoBySolicitacaoMock.mockReset();
    createVersaoArteDownloadUrlMock.mockReset();
  });

  it('rejeita designer que não é o dono, sem allowAnyDesigner (IDOR)', async () => {
    getSolicitacaoDetailRepoMock.mockResolvedValue({ idDesigner: 'outro-designer', status: 'Publicado' });

    await expect(
      getComprovanteDownloadUrl({} as never, 10, 'designer-1'),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('permite administrador com allowAnyDesigner mesmo não sendo o designer dono', async () => {
    getSolicitacaoDetailRepoMock.mockResolvedValue({ idDesigner: 'designer-2', status: 'Publicado' });
    getPublicacaoBySolicitacaoMock.mockResolvedValue({ comprovanteUrl: 'solicitacoes/10/publicacao/x.png' });
    createVersaoArteDownloadUrlMock.mockResolvedValue('https://exemplo.supabase.co/signed-comprovante');

    const result = await getComprovanteDownloadUrl({} as never, 10, 'admin-1', { allowAnyDesigner: true });

    expect(result).toEqual({ url: 'https://exemplo.supabase.co/signed-comprovante', expiresInSeconds: 600 });
  });

  it('rejeita quando a publicação não tem comprovante anexado', async () => {
    getSolicitacaoDetailRepoMock.mockResolvedValue({ idDesigner: 'designer-1', status: 'Publicado' });
    getPublicacaoBySolicitacaoMock.mockResolvedValue({ comprovanteUrl: null });

    await expect(
      getComprovanteDownloadUrl({} as never, 10, 'designer-1'),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
