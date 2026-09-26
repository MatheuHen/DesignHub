import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConflictError, ExpiredLinkError, NotFoundError, ValidationError } from '../lib/errors.js';

const {
  getSupabaseAdminClientMock,
  sendTextMessageMock,
  findClienteByIdMock,
  getSolicitacaoDetailRepoMock,
  generateAvaliacaoLinkTokenMock,
  getAvaliacaoLinkStateMock,
  getVersaoArtePreviewMock,
  submitAvaliacaoMock,
  uploadArquivoToStorageMock,
  removeArquivoFromStorageBestEffortMock,
  createVersaoArteDownloadUrlMock,
  getTrackingSolicitacaoByVersaoMock,
  listTrackingVersoesMock,
  listTrackingHistoricoMock,
  getTrackingAgendamentoMock,
  listVersoesArteMock,
  cancelAgendamentoClienteMock,
  sendAlertaDesignerTemplateMessageMock,
  getDesignerByIdMock,
  whatsappConfigStatusMock,
  createAgendamentoClienteMock,
  getStatusConexaoMock,
  marcarLinkAvaliacaoNotificadoMock,
  getLinkAvaliacaoAtualMock,
  sendWebPushNotificationMock,
  listPushSubscriptionsByDesignerMock,
  deletePushSubscriptionByEndpointMock,
} = vi.hoisted(() => ({
  getSupabaseAdminClientMock: vi.fn(() => ({ __kind: 'admin-client' })),
  sendTextMessageMock: vi.fn(),
  findClienteByIdMock: vi.fn(),
  getSolicitacaoDetailRepoMock: vi.fn(),
  generateAvaliacaoLinkTokenMock: vi.fn(),
  getAvaliacaoLinkStateMock: vi.fn(),
  getVersaoArtePreviewMock: vi.fn(),
  submitAvaliacaoMock: vi.fn(),
  uploadArquivoToStorageMock: vi.fn(),
  removeArquivoFromStorageBestEffortMock: vi.fn(),
  createVersaoArteDownloadUrlMock: vi.fn(),
  getTrackingSolicitacaoByVersaoMock: vi.fn(),
  listTrackingVersoesMock: vi.fn(),
  listTrackingHistoricoMock: vi.fn(),
  getTrackingAgendamentoMock: vi.fn(),
  listVersoesArteMock: vi.fn(),
  cancelAgendamentoClienteMock: vi.fn(),
  sendAlertaDesignerTemplateMessageMock: vi.fn(),
  getDesignerByIdMock: vi.fn(),
  whatsappConfigStatusMock: { hasAlertaDesignerTemplateConfigured: true },
  createAgendamentoClienteMock: vi.fn(),
  getStatusConexaoMock: vi.fn(),
  marcarLinkAvaliacaoNotificadoMock: vi.fn(),
  getLinkAvaliacaoAtualMock: vi.fn(),
  sendWebPushNotificationMock: vi.fn(),
  listPushSubscriptionsByDesignerMock: vi.fn(),
  deletePushSubscriptionByEndpointMock: vi.fn(),
}));

vi.mock('../config/supabase.js', () => ({ getSupabaseAdminClient: getSupabaseAdminClientMock }));
vi.mock('../config/env.js', () => ({
  env: { FRONTEND_URL: 'https://app.exemplo.com' },
  whatsappConfigStatus: whatsappConfigStatusMock,
}));
vi.mock('../integrations/whatsapp/whatsappClient.js', () => {
  class WhatsAppReengagementRequiredError extends Error {}
  return {
    sendTextMessage: sendTextMessageMock,
    sendAlertaDesignerTemplateMessage: sendAlertaDesignerTemplateMessageMock,
    WhatsAppReengagementRequiredError,
  };
});
vi.mock('../repositories/atendimento.repository.js', () => ({ findClienteById: findClienteByIdMock }));
vi.mock('../repositories/designer.repository.js', () => ({ getDesignerById: getDesignerByIdMock }));
vi.mock('../repositories/solicitacao.repository.js', () => ({
  getSolicitacaoDetail: getSolicitacaoDetailRepoMock,
  listVersoesArte: listVersoesArteMock,
}));
vi.mock('../repositories/avaliacao.repository.js', () => ({
  generateAvaliacaoLinkToken: generateAvaliacaoLinkTokenMock,
  getAvaliacaoLinkState: getAvaliacaoLinkStateMock,
  getVersaoArtePreview: getVersaoArtePreviewMock,
  submitAvaliacao: submitAvaliacaoMock,
  getTrackingSolicitacaoByVersao: getTrackingSolicitacaoByVersaoMock,
  listTrackingVersoes: listTrackingVersoesMock,
  listTrackingHistorico: listTrackingHistoricoMock,
  getTrackingAgendamento: getTrackingAgendamentoMock,
  cancelAgendamentoCliente: cancelAgendamentoClienteMock,
  createAgendamentoCliente: createAgendamentoClienteMock,
  marcarLinkAvaliacaoNotificado: marcarLinkAvaliacaoNotificadoMock,
  getLinkAvaliacaoAtual: getLinkAvaliacaoAtualMock,
}));
vi.mock('../repositories/clienteInstagram.repository.js', () => ({ getStatusConexao: getStatusConexaoMock }));
vi.mock('../integrations/webpush/webPushClient.js', () => {
  class WebPushSubscriptionGoneError extends Error {}
  return { sendWebPushNotification: sendWebPushNotificationMock, WebPushSubscriptionGoneError };
});
vi.mock('../repositories/pushSubscription.repository.js', () => ({
  listPushSubscriptionsByDesigner: listPushSubscriptionsByDesignerMock,
  deletePushSubscriptionByEndpoint: deletePushSubscriptionByEndpointMock,
}));
vi.mock('../repositories/versaoArte.repository.js', () => ({
  uploadArquivoToStorage: uploadArquivoToStorageMock,
  removeArquivoFromStorageBestEffort: removeArquivoFromStorageBestEffortMock,
  createVersaoArteDownloadUrl: createVersaoArteDownloadUrlMock,
}));

const {
  gerarLinkAvaliacao,
  getAvaliacaoPreview,
  submitAvaliacaoDecisao,
  cancelarAgendamentoCliente,
  getLinkAvaliacaoHistorico,
} = await import('./avaliacao.service.js');
const { WhatsAppReengagementRequiredError } = await import('../integrations/whatsapp/whatsappClient.js');

const PDF_BYTES = Buffer.from('%PDF-1.4 conteúdo de teste');

describe('gerarLinkAvaliacao (RF009/RN19)', () => {
  beforeEach(() => {
    getSolicitacaoDetailRepoMock.mockReset();
    findClienteByIdMock.mockReset();
    generateAvaliacaoLinkTokenMock.mockReset().mockResolvedValue({ idVersao: 1, numeroVersao: 1 });
    sendTextMessageMock.mockReset();
    listVersoesArteMock.mockReset().mockResolvedValue([{ numero_versao: 2 }]);
    marcarLinkAvaliacaoNotificadoMock.mockReset().mockResolvedValue(undefined);
  });

  it('rejeita quando o callerId não é o dono da solicitação', async () => {
    getSolicitacaoDetailRepoMock.mockResolvedValue({
      idDesigner: 'outro-designer',
      status: 'Enviado para avaliação',
      idCliente: 1,
    });

    await expect(gerarLinkAvaliacao({} as never, 10, 'designer-1')).rejects.toBeInstanceOf(NotFoundError);
    expect(generateAvaliacaoLinkTokenMock).not.toHaveBeenCalled();
  });

  it('rejeita quando o status não é "Enviado para avaliação"', async () => {
    getSolicitacaoDetailRepoMock.mockResolvedValue({
      idDesigner: 'designer-1',
      status: 'Em produção',
      idCliente: 1,
    });

    await expect(gerarLinkAvaliacao({} as never, 10, 'designer-1')).rejects.toBeInstanceOf(ConflictError);
  });

  it('gera o link e reporta sucesso do WhatsApp sem mascarar falha', async () => {
    getSolicitacaoDetailRepoMock.mockResolvedValue({
      idDesigner: 'designer-1',
      status: 'Enviado para avaliação',
      idCliente: 1,
    });
    findClienteByIdMock.mockResolvedValue({ id: 1, whatsapp: '5511999999999' });
    sendTextMessageMock.mockResolvedValue({ wamid: 'abc' });

    const result = await gerarLinkAvaliacao({} as never, 10, 'designer-1');

    expect(result.whatsappNotified).toBe(true);
    expect(result.whatsappError).toBeUndefined();
    expect(result.url).toMatch(/^https:\/\/app\.exemplo\.com\/avaliacao\/[0-9a-f]{64}$/);
  });

  it('item 7/7.1 (rodada final): persiste a confirmação de envio (whatsapp_notificado_em) só depois do WhatsApp aceitar', async () => {
    getSolicitacaoDetailRepoMock.mockResolvedValue({
      idDesigner: 'designer-1',
      status: 'Enviado para avaliação',
      idCliente: 1,
    });
    findClienteByIdMock.mockResolvedValue({ id: 1, whatsapp: '5511999999999' });
    sendTextMessageMock.mockResolvedValue({ wamid: 'abc' });

    await gerarLinkAvaliacao({} as never, 10, 'designer-1');

    expect(marcarLinkAvaliacaoNotificadoMock).toHaveBeenCalledOnce();
  });

  it('item 7/7.1 (rodada final): falha no WhatsApp nunca persiste "notificado" (nunca um falso "enviado")', async () => {
    getSolicitacaoDetailRepoMock.mockResolvedValue({
      idDesigner: 'designer-1',
      status: 'Enviado para avaliação',
      idCliente: 1,
    });
    findClienteByIdMock.mockResolvedValue({ id: 1, whatsapp: '5511999999999' });
    sendTextMessageMock.mockRejectedValue(new Error('WhatsApp indisponível'));

    const result = await gerarLinkAvaliacao({} as never, 10, 'designer-1');

    expect(result.whatsappNotified).toBe(false);
    expect(marcarLinkAvaliacaoNotificadoMock).not.toHaveBeenCalled();
  });

  it('item 7/7.1 (rodada final): falha ao PERSISTIR a confirmação (melhor esforço) nunca desfaz o envio já confirmado', async () => {
    getSolicitacaoDetailRepoMock.mockResolvedValue({
      idDesigner: 'designer-1',
      status: 'Enviado para avaliação',
      idCliente: 1,
    });
    findClienteByIdMock.mockResolvedValue({ id: 1, whatsapp: '5511999999999' });
    sendTextMessageMock.mockResolvedValue({ wamid: 'abc' });
    marcarLinkAvaliacaoNotificadoMock.mockRejectedValue(new Error('falha transitória de banco'));

    const result = await gerarLinkAvaliacao({} as never, 10, 'designer-1');

    expect(result.whatsappNotified).toBe(true);
  });

  it('item 3.4: identifica a arte por tema/versão na mensagem, sem expor o id interno da solicitação', async () => {
    getSolicitacaoDetailRepoMock.mockResolvedValue({
      idDesigner: 'designer-1',
      status: 'Enviado para avaliação',
      idCliente: 1,
      tema: 'Post de aniversário',
    });
    findClienteByIdMock.mockResolvedValue({ id: 1, whatsapp: '5511999999999' });
    sendTextMessageMock.mockResolvedValue({ wamid: 'abc' });
    listVersoesArteMock.mockResolvedValue([{ numero_versao: 1 }, { numero_versao: 2 }]);

    await gerarLinkAvaliacao({} as never, 10, 'designer-1');

    const [, sentMessage] = sendTextMessageMock.mock.calls[0] as [string, string];
    const textoAntesDoLink = sentMessage.split('http')[0] ?? '';
    expect(sentMessage).toContain('Post de aniversário');
    expect(sentMessage).toContain('versão 2');
    expect(textoAntesDoLink).not.toContain('10'); // id_solicitacao=10 não pode aparecer fora da URL/token
  });

  it('item 3.4: usa texto genérico quando a solicitação não tem tema registrado', async () => {
    getSolicitacaoDetailRepoMock.mockResolvedValue({
      idDesigner: 'designer-1',
      status: 'Enviado para avaliação',
      idCliente: 1,
      tema: null,
    });
    findClienteByIdMock.mockResolvedValue({ id: 1, whatsapp: '5511999999999' });
    sendTextMessageMock.mockResolvedValue({ wamid: 'abc' });
    listVersoesArteMock.mockResolvedValue([]);

    await gerarLinkAvaliacao({} as never, 10, 'designer-1');

    const [, sentMessage] = sendTextMessageMock.mock.calls[0] as [string, string];
    expect(sentMessage).toContain('Sua arte está pronta para avaliação');
  });

  it('reporta explicitamente quando o envio via WhatsApp falha (não mascara erro)', async () => {
    getSolicitacaoDetailRepoMock.mockResolvedValue({
      idDesigner: 'designer-1',
      status: 'Enviado para avaliação',
      idCliente: 1,
    });
    findClienteByIdMock.mockResolvedValue({ id: 1, whatsapp: '5511999999999' });
    sendTextMessageMock.mockRejectedValue(new Error('WhatsApp indisponível'));

    const result = await gerarLinkAvaliacao({} as never, 10, 'designer-1');

    expect(result.whatsappNotified).toBe(false);
    expect(result.whatsappError).toBe('WhatsApp indisponível');
    expect(result.url).toContain('/avaliacao/');
  });
});

describe('getLinkAvaliacaoHistorico (item 7 — rodada final)', () => {
  beforeEach(() => {
    getSolicitacaoDetailRepoMock.mockReset();
    getLinkAvaliacaoAtualMock.mockReset();
  });

  it('rejeita quando o callerId não é o dono da solicitação (ownership)', async () => {
    getSolicitacaoDetailRepoMock.mockResolvedValue({ idDesigner: 'outro-designer' });

    await expect(getLinkAvaliacaoHistorico({} as never, 10, 'designer-1')).rejects.toBeInstanceOf(NotFoundError);
    expect(getLinkAvaliacaoAtualMock).not.toHaveBeenCalled();
  });

  it('devolve null quando a solicitação ainda não tem nenhuma versão enviada', async () => {
    getSolicitacaoDetailRepoMock.mockResolvedValue({ idDesigner: 'designer-1' });
    getLinkAvaliacaoAtualMock.mockResolvedValue(null);

    await expect(getLinkAvaliacaoHistorico({} as never, 10, 'designer-1')).resolves.toBeNull();
  });

  it('devolve o histórico persistido (último envio, situação, validade, quantidade)', async () => {
    getSolicitacaoDetailRepoMock.mockResolvedValue({ idDesigner: 'designer-1' });
    getLinkAvaliacaoAtualMock.mockResolvedValue({
      ultimoEnvioEm: '2026-09-20T10:00:00Z',
      whatsappNotificadoEm: '2026-09-20T10:00:01Z',
      situacao: 'aguardando_resposta',
      validoAte: '2026-09-27T10:00:00Z',
      quantidadeEnvios: 2,
    });

    await expect(getLinkAvaliacaoHistorico({} as never, 10, 'designer-1')).resolves.toEqual({
      ultimoEnvioEm: '2026-09-20T10:00:00Z',
      whatsappNotificadoEm: '2026-09-20T10:00:01Z',
      situacao: 'aguardando_resposta',
      validoAte: '2026-09-27T10:00:00Z',
      quantidadeEnvios: 2,
    });
  });
});

describe('getAvaliacaoPreview (RF009 — leitura pública)', () => {
  beforeEach(() => {
    getAvaliacaoLinkStateMock.mockReset();
    getVersaoArtePreviewMock.mockReset();
    createVersaoArteDownloadUrlMock.mockReset();
    getTrackingSolicitacaoByVersaoMock.mockReset();
    listTrackingVersoesMock.mockReset();
    listTrackingHistoricoMock.mockReset();
    getTrackingAgendamentoMock.mockReset();
    getStatusConexaoMock.mockReset();
  });

  it('retorna apenas o estado quando o link não é válido', async () => {
    getAvaliacaoLinkStateMock.mockResolvedValue({ state: 'expired', idVersao: null });

    await expect(getAvaliacaoPreview('a'.repeat(64))).resolves.toEqual({ state: 'expired' });
    expect(getVersaoArtePreviewMock).not.toHaveBeenCalled();
  });

  it('retorna o acompanhamento somente-leitura quando o link já foi usado (RN13/RN14/RN18)', async () => {
    getAvaliacaoLinkStateMock.mockResolvedValue({ state: 'used', idVersao: 5 });
    getTrackingSolicitacaoByVersaoMock.mockResolvedValue({
      idSolicitacao: 10,
      status: 'Agendado',
      tema: 'Post promocional',
    });
    listTrackingVersoesMock.mockResolvedValue([
      { idVersao: 5, numeroVersao: 1, formato: 'PDF', dataEnvio: '2026-01-01T00:00:00Z', arquivoUrl: 'x/v1.pdf' },
    ]);
    listTrackingHistoricoMock.mockResolvedValue([
      { acao: 'Solicitação criada a partir do atendimento pelo WhatsApp', statusNovo: 'Em produção', dataHora: '2026-01-01T00:00:00Z' },
    ]);
    getTrackingAgendamentoMock.mockResolvedValue({ dataPublicacao: '2026-09-01', horario: '14:00:00', status: 'Agendado' });
    createVersaoArteDownloadUrlMock.mockResolvedValue('https://exemplo.supabase.co/signed-v1');

    const result = await getAvaliacaoPreview('a'.repeat(64));

    expect(result).toEqual({
      state: 'used',
      tracking: {
        status: 'Agendado',
        tema: 'Post promocional',
        versoes: [
          { numeroVersao: 1, formato: 'PDF', dataEnvio: '2026-01-01T00:00:00Z', downloadUrl: 'https://exemplo.supabase.co/signed-v1' },
        ],
        historico: [
          { acao: 'Solicitação criada a partir do atendimento pelo WhatsApp', statusNovo: 'Em produção', dataHora: '2026-01-01T00:00:00Z' },
        ],
        agendamento: { dataPublicacao: '2026-09-01', horario: '14:00:00', status: 'Agendado' },
      },
    });
  });

  it('não vaza tracking quando o link usado não resolve mais a uma solicitação real', async () => {
    getAvaliacaoLinkStateMock.mockResolvedValue({ state: 'used', idVersao: 5 });
    getTrackingSolicitacaoByVersaoMock.mockResolvedValue(null);

    await expect(getAvaliacaoPreview('a'.repeat(64))).resolves.toEqual({ state: 'used' });
    expect(listTrackingVersoesMock).not.toHaveBeenCalled();
  });

  it('retorna a prévia completa com URL assinada quando o link é válido', async () => {
    getAvaliacaoLinkStateMock.mockResolvedValue({ state: 'valid', idVersao: 5 });
    getVersaoArtePreviewMock.mockResolvedValue({
      idSolicitacao: 10,
      numeroVersao: 2,
      formato: 'PDF',
      observacoes: null,
      arquivoUrl: 'solicitacoes/10/versoes/x.pdf',
      tema: 'Post promocional',
      idCliente: 3,
    });
    createVersaoArteDownloadUrlMock.mockResolvedValue('https://exemplo.supabase.co/signed');
    getStatusConexaoMock.mockResolvedValue({ conectado: true, conectadoEm: '2026-01-01T00:00:00Z', expiraEm: '2026-03-01T00:00:00Z' });

    const result = await getAvaliacaoPreview('a'.repeat(64));

    expect(result).toEqual({
      state: 'valid',
      tema: 'Post promocional',
      numeroVersao: 2,
      formato: 'PDF',
      observacoes: null,
      downloadUrl: 'https://exemplo.supabase.co/signed',
      expiresInSeconds: 300,
      clienteInstagramConectado: true,
    });
    expect(createVersaoArteDownloadUrlMock).toHaveBeenCalledWith(
      expect.anything(),
      'solicitacoes/10/versoes/x.pdf',
      300,
      false,
    );
  });
});

describe('submitAvaliacaoDecisao (RF009/RF010)', () => {
  beforeEach(() => {
    getAvaliacaoLinkStateMock.mockReset();
    getVersaoArtePreviewMock.mockReset();
    submitAvaliacaoMock.mockReset();
    uploadArquivoToStorageMock.mockReset().mockResolvedValue(undefined);
    removeArquivoFromStorageBestEffortMock.mockReset().mockResolvedValue(undefined);
    createAgendamentoClienteMock.mockReset();
    getStatusConexaoMock.mockReset();
    getSolicitacaoDetailRepoMock.mockReset().mockResolvedValue({
      idDesigner: 'designer-1',
      clienteNome: 'Cliente Teste',
      tema: 'Tema X',
    });
    getDesignerByIdMock.mockReset().mockResolvedValue({ id: 'designer-1', whatsapp: '5511999999999' });
    sendTextMessageMock.mockReset().mockResolvedValue({ wamid: 'abc' });
    listPushSubscriptionsByDesignerMock.mockReset().mockResolvedValue([]);
    sendWebPushNotificationMock.mockReset();
    deletePushSubscriptionByEndpointMock.mockReset().mockResolvedValue(undefined);
  });

  it('rejeita quando o link já foi utilizado', async () => {
    getAvaliacaoLinkStateMock.mockResolvedValue({ state: 'used', idVersao: null });

    await expect(
      submitAvaliacaoDecisao('a'.repeat(64), {
        decisao: 'Aprovado',
        descricao: undefined,
        observacoes: undefined,
        referenciaBuffer: undefined,
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('rejeita quando o link está expirado', async () => {
    getAvaliacaoLinkStateMock.mockResolvedValue({ state: 'expired', idVersao: null });

    await expect(
      submitAvaliacaoDecisao('a'.repeat(64), {
        decisao: 'Aprovado',
        descricao: undefined,
        observacoes: undefined,
        referenciaBuffer: undefined,
      }),
    ).rejects.toBeInstanceOf(ExpiredLinkError);
  });

  it('rejeita quando o link é inválido', async () => {
    getAvaliacaoLinkStateMock.mockResolvedValue({ state: 'invalid', idVersao: null });

    await expect(
      submitAvaliacaoDecisao('a'.repeat(64), {
        decisao: 'Aprovado',
        descricao: undefined,
        observacoes: undefined,
        referenciaBuffer: undefined,
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('rejeita referência com conteúdo que não é PDF/JPG/PNG real (MIME real)', async () => {
    getAvaliacaoLinkStateMock.mockResolvedValue({ state: 'valid', idVersao: 5 });
    getVersaoArtePreviewMock.mockResolvedValue({
      idSolicitacao: 10,
      numeroVersao: 2,
      formato: 'PDF',
      observacoes: null,
      arquivoUrl: 'x',
      tema: null,
    });

    await expect(
      submitAvaliacaoDecisao('a'.repeat(64), {
        decisao: 'Ajustes',
        descricao: 'Mudar a cor de fundo',
        observacoes: undefined,
        referenciaBuffer: Buffer.from('MZ executável disfarçado'),
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(uploadArquivoToStorageMock).not.toHaveBeenCalled();
  });

  it('envia a referência ao Storage e submete a decisão de Ajustes', async () => {
    getAvaliacaoLinkStateMock.mockResolvedValue({ state: 'valid', idVersao: 5 });
    getVersaoArtePreviewMock.mockResolvedValue({
      idSolicitacao: 10,
      numeroVersao: 2,
      formato: 'PDF',
      observacoes: null,
      arquivoUrl: 'x',
      tema: null,
    });
    submitAvaliacaoMock.mockResolvedValue({ idSolicitacao: 10, statusNovo: 'Ajustes', numeroVersao: 2 });

    const result = await submitAvaliacaoDecisao('a'.repeat(64), {
      decisao: 'Ajustes',
      descricao: 'Mudar a cor de fundo',
      observacoes: undefined,
      referenciaBuffer: PDF_BYTES,
    });

    expect(result).toEqual({ idSolicitacao: 10, statusNovo: 'Ajustes' });
    expect(uploadArquivoToStorageMock).toHaveBeenCalledOnce();
    expect(submitAvaliacaoMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ decisao: 'Ajustes', descricaoAjuste: 'Mudar a cor de fundo' }),
    );
  });

  it('item 8 (rodada final): "Ajustes" notifica o designer por push e WhatsApp', async () => {
    getAvaliacaoLinkStateMock.mockResolvedValue({ state: 'valid', idVersao: 5 });
    submitAvaliacaoMock.mockResolvedValue({ idSolicitacao: 10, statusNovo: 'Ajustes', numeroVersao: 2 });
    listPushSubscriptionsByDesignerMock.mockResolvedValue([
      { endpoint: 'https://push.exemplo/1', p256dh: 'p', authKey: 'a' },
    ]);

    await submitAvaliacaoDecisao('a'.repeat(64), {
      decisao: 'Ajustes',
      descricao: 'Mudar a cor de fundo',
      observacoes: undefined,
      referenciaBuffer: undefined,
    });

    expect(sendWebPushNotificationMock).toHaveBeenCalledWith(
      { endpoint: 'https://push.exemplo/1', p256dh: 'p', authKey: 'a' },
      expect.objectContaining({ title: 'Cliente solicitou ajustes' }),
    );
    expect(sendTextMessageMock).toHaveBeenCalledWith(
      '5511999999999',
      expect.stringContaining('ajustes'),
    );
  });

  it('item 8 (rodada final): "Cancelado" (via avaliação) notifica o designer por push e WhatsApp', async () => {
    getAvaliacaoLinkStateMock.mockResolvedValue({ state: 'valid', idVersao: 5 });
    submitAvaliacaoMock.mockResolvedValue({ idSolicitacao: 10, statusNovo: 'Cancelado', numeroVersao: 2 });

    await submitAvaliacaoDecisao('a'.repeat(64), {
      decisao: 'Cancelado',
      descricao: undefined,
      observacoes: undefined,
      referenciaBuffer: undefined,
    });

    expect(sendTextMessageMock).toHaveBeenCalledWith(
      '5511999999999',
      expect.stringContaining('cancelou'),
    );
  });

  it('item 8/8.2 (rodada final): assinatura de push expirada (410/404) é removida automaticamente', async () => {
    getAvaliacaoLinkStateMock.mockResolvedValue({ state: 'valid', idVersao: 5 });
    submitAvaliacaoMock.mockResolvedValue({ idSolicitacao: 10, statusNovo: 'Ajustes', numeroVersao: 2 });
    const { WebPushSubscriptionGoneError } = await import('../integrations/webpush/webPushClient.js');
    listPushSubscriptionsByDesignerMock.mockResolvedValue([
      { endpoint: 'https://push.exemplo/expirada', p256dh: 'p', authKey: 'a' },
    ]);
    sendWebPushNotificationMock.mockRejectedValue(new WebPushSubscriptionGoneError('expirada'));

    await submitAvaliacaoDecisao('a'.repeat(64), {
      decisao: 'Ajustes',
      descricao: 'Mudar a cor de fundo',
      observacoes: undefined,
      referenciaBuffer: undefined,
    });

    expect(deletePushSubscriptionByEndpointMock).toHaveBeenCalledWith(
      expect.anything(),
      'https://push.exemplo/expirada',
    );
  });

  it('submete Aprovado sem referência (não toca o Storage)', async () => {
    getAvaliacaoLinkStateMock.mockResolvedValue({ state: 'valid', idVersao: 5 });
    submitAvaliacaoMock.mockResolvedValue({ idSolicitacao: 10, statusNovo: 'Aprovado', numeroVersao: 2 });

    const result = await submitAvaliacaoDecisao('a'.repeat(64), {
      decisao: 'Aprovado',
      descricao: undefined,
      observacoes: undefined,
      referenciaBuffer: undefined,
    });

    expect(result).toEqual({ idSolicitacao: 10, statusNovo: 'Aprovado' });
    expect(getVersaoArtePreviewMock).not.toHaveBeenCalled();
    expect(uploadArquivoToStorageMock).not.toHaveBeenCalled();
  });

  describe('rodada correções (itens 7/8/19): opção de publicação ao aprovar', () => {
    it('opção "automatico": cria o agendamento real na hora e reporta status Agendado quando o Instagram está conectado', async () => {
      getAvaliacaoLinkStateMock.mockResolvedValue({ state: 'valid', idVersao: 5 });
      submitAvaliacaoMock.mockResolvedValue({ idSolicitacao: 10, statusNovo: 'Aprovado', numeroVersao: 2 });
      getVersaoArtePreviewMock.mockResolvedValue({
        idSolicitacao: 10,
        numeroVersao: 2,
        formato: 'PDF',
        observacoes: null,
        arquivoUrl: 'x',
        tema: 'Post promocional',
        idCliente: 3,
      });
      getStatusConexaoMock.mockResolvedValue({ conectado: true, conectadoEm: '2026-01-01T00:00:00Z', expiraEm: '2026-03-01T00:00:00Z' });
      createAgendamentoClienteMock.mockResolvedValue({ idAgendamento: 99 });

      const result = await submitAvaliacaoDecisao('a'.repeat(64), {
        decisao: 'Aprovado',
        descricao: undefined,
        observacoes: undefined,
        referenciaBuffer: undefined,
        opcaoPublicacao: 'automatico',
        dataDesejada: '2026-09-26',
        horarioDesejado: '12:00',
        legendaDesejada: 'Confira!',
      });

      expect(result).toEqual({ idSolicitacao: 10, statusNovo: 'Agendado', agendamentoAutomaticoCriado: true });
      expect(createAgendamentoClienteMock).toHaveBeenCalledWith(expect.anything(), {
        idSolicitacao: 10,
        dataPublicacao: '2026-09-26',
        horario: '12:00',
        legenda: 'Confira!',
      });
      // Item 8 (rodada final): avisa o designer com o resultado REAL — nunca finge que agendou se não agendou.
      expect(sendTextMessageMock).toHaveBeenCalledWith(
        '5511999999999',
        expect.stringContaining('agendada automaticamente'),
      );
    });

    it('opção "automatico": não cria agendamento e mantém Aprovado quando o Instagram não está mais conectado (defesa em profundidade)', async () => {
      getAvaliacaoLinkStateMock.mockResolvedValue({ state: 'valid', idVersao: 5 });
      submitAvaliacaoMock.mockResolvedValue({ idSolicitacao: 10, statusNovo: 'Aprovado', numeroVersao: 2 });
      getVersaoArtePreviewMock.mockResolvedValue({
        idSolicitacao: 10,
        numeroVersao: 2,
        formato: 'PDF',
        observacoes: null,
        arquivoUrl: 'x',
        tema: 'Post promocional',
        idCliente: 3,
      });
      getStatusConexaoMock.mockResolvedValue({ conectado: false, conectadoEm: null, expiraEm: null });

      const result = await submitAvaliacaoDecisao('a'.repeat(64), {
        decisao: 'Aprovado',
        descricao: undefined,
        observacoes: undefined,
        referenciaBuffer: undefined,
        opcaoPublicacao: 'automatico',
        dataDesejada: '2026-09-26',
        horarioDesejado: '12:00',
      });

      expect(result).toEqual({ idSolicitacao: 10, statusNovo: 'Aprovado', agendamentoAutomaticoCriado: false });
      expect(createAgendamentoClienteMock).not.toHaveBeenCalled();
      // Item 8 (rodada final): nunca finge que o agendamento automático foi criado quando não foi.
      expect(sendTextMessageMock).toHaveBeenCalledWith(
        '5511999999999',
        expect.stringContaining('não pôde ser criado'),
      );
    });

    it('opção "automatico": aprovação permanece válida mesmo se a criação do agendamento falhar por erro inesperado', async () => {
      getAvaliacaoLinkStateMock.mockResolvedValue({ state: 'valid', idVersao: 5 });
      submitAvaliacaoMock.mockResolvedValue({ idSolicitacao: 10, statusNovo: 'Aprovado', numeroVersao: 2 });
      getVersaoArtePreviewMock.mockResolvedValue({
        idSolicitacao: 10,
        numeroVersao: 2,
        formato: 'PDF',
        observacoes: null,
        arquivoUrl: 'x',
        tema: 'Post promocional',
        idCliente: 3,
      });
      getStatusConexaoMock.mockResolvedValue({ conectado: true, conectadoEm: null, expiraEm: null });
      createAgendamentoClienteMock.mockRejectedValue(new Error('erro inesperado de banco'));

      const result = await submitAvaliacaoDecisao('a'.repeat(64), {
        decisao: 'Aprovado',
        descricao: undefined,
        observacoes: undefined,
        referenciaBuffer: undefined,
        opcaoPublicacao: 'automatico',
        dataDesejada: '2026-09-26',
        horarioDesejado: '12:00',
      });

      expect(result).toEqual({ idSolicitacao: 10, statusNovo: 'Aprovado', agendamentoAutomaticoCriado: false });
    });

    it('opção "designer_manual": avisa o designer por WhatsApp sem criar agendamento nenhum', async () => {
      getAvaliacaoLinkStateMock.mockResolvedValue({ state: 'valid', idVersao: 5 });
      submitAvaliacaoMock.mockResolvedValue({ idSolicitacao: 10, statusNovo: 'Aprovado', numeroVersao: 2 });
      getSolicitacaoDetailRepoMock.mockResolvedValue({
        idDesigner: 'designer-1',
        clienteNome: 'Cliente Teste',
        tema: 'Post promocional',
      });
      getDesignerByIdMock.mockResolvedValue({ whatsapp: '5511999999999' });
      sendTextMessageMock.mockResolvedValue(undefined);

      const result = await submitAvaliacaoDecisao('a'.repeat(64), {
        decisao: 'Aprovado',
        descricao: undefined,
        observacoes: undefined,
        referenciaBuffer: undefined,
        opcaoPublicacao: 'designer_manual',
        dataDesejada: '2026-09-26',
        horarioDesejado: '12:00',
      });

      expect(result).toEqual({ idSolicitacao: 10, statusNovo: 'Aprovado' });
      expect(createAgendamentoClienteMock).not.toHaveBeenCalled();
      expect(sendTextMessageMock).toHaveBeenCalledWith('5511999999999', expect.stringContaining('agende a publicação'));
    });

    /**
     * Item 8.3/16 (regra final): "eu mesmo vou publicar" encerra a solicitação
     * como `Publicado` dentro da própria RPC — não há PENDÊNCIA a registrar
     * depois (a mensagem antiga pedindo "registre a publicação manualmente"
     * não é mais enviada). Item 8 (rodada final de correções): o designer
     * ainda é avisado, só como INFORMAÇÃO — mensagem distinta, que não pede
     * nenhuma ação.
     */
    it('opção "proprio_cliente": encerra como Publicado e avisa o designer só como informação (sem pendência)', async () => {
      getAvaliacaoLinkStateMock.mockResolvedValue({ state: 'valid', idVersao: 5 });
      submitAvaliacaoMock.mockResolvedValue({ idSolicitacao: 10, statusNovo: 'Publicado', numeroVersao: 2 });
      getSolicitacaoDetailRepoMock.mockResolvedValue({
        idDesigner: 'designer-1',
        clienteNome: 'Cliente Teste',
        tema: 'Post promocional',
      });
      getDesignerByIdMock.mockResolvedValue({ whatsapp: '5511999999999' });
      sendTextMessageMock.mockResolvedValue(undefined);

      const result = await submitAvaliacaoDecisao('a'.repeat(64), {
        decisao: 'Aprovado',
        descricao: undefined,
        observacoes: undefined,
        referenciaBuffer: undefined,
        opcaoPublicacao: 'proprio_cliente',
      });

      expect(result).toEqual({ idSolicitacao: 10, statusNovo: 'Publicado' });
      expect(createAgendamentoClienteMock).not.toHaveBeenCalled();
      // Item 8 (rodada final): avisa como informação — nunca a mensagem antiga que pedia registrar a publicação.
      expect(sendTextMessageMock).toHaveBeenCalledWith(
        '5511999999999',
        expect.stringContaining('vai publicar por conta própria'),
      );
      expect(sendTextMessageMock).not.toHaveBeenCalledWith(
        expect.anything(),
        expect.stringContaining('registre'),
      );
    });

    it('opção "designer_manual": falha ao notificar o designer nunca desfaz a aprovação já confirmada', async () => {
      getAvaliacaoLinkStateMock.mockResolvedValue({ state: 'valid', idVersao: 5 });
      submitAvaliacaoMock.mockResolvedValue({ idSolicitacao: 10, statusNovo: 'Aprovado', numeroVersao: 2 });
      getSolicitacaoDetailRepoMock.mockRejectedValue(new Error('erro inesperado'));

      const result = await submitAvaliacaoDecisao('a'.repeat(64), {
        decisao: 'Aprovado',
        descricao: undefined,
        observacoes: undefined,
        referenciaBuffer: undefined,
        opcaoPublicacao: 'designer_manual',
        dataDesejada: '2026-09-26',
        horarioDesejado: '12:00',
      });

      expect(result).toEqual({ idSolicitacao: 10, statusNovo: 'Aprovado' });
    });
  });

  it('remove o objeto do Storage (compensação) quando a RPC falha após enviar a referência', async () => {
    getAvaliacaoLinkStateMock.mockResolvedValue({ state: 'valid', idVersao: 5 });
    getVersaoArtePreviewMock.mockResolvedValue({
      idSolicitacao: 10,
      numeroVersao: 2,
      formato: 'PDF',
      observacoes: null,
      arquivoUrl: 'x',
      tema: null,
    });
    submitAvaliacaoMock.mockRejectedValue(new ConflictError('token já utilizado por outra requisição'));

    await expect(
      submitAvaliacaoDecisao('a'.repeat(64), {
        decisao: 'Ajustes',
        descricao: 'Mudar a cor de fundo',
        observacoes: undefined,
        referenciaBuffer: PDF_BYTES,
      }),
    ).rejects.toBeInstanceOf(ConflictError);

    expect(removeArquivoFromStorageBestEffortMock).toHaveBeenCalledOnce();
  });
});

describe('cancelarAgendamentoCliente (RF012/RF013/item 8.4/8.6 — correções 13/09/2026)', () => {
  beforeEach(() => {
    getAvaliacaoLinkStateMock.mockReset();
    getTrackingSolicitacaoByVersaoMock.mockReset();
    cancelAgendamentoClienteMock.mockReset();
    getSolicitacaoDetailRepoMock.mockReset().mockResolvedValue(null);
    getDesignerByIdMock.mockReset();
    sendTextMessageMock.mockReset();
    sendAlertaDesignerTemplateMessageMock.mockReset();
    whatsappConfigStatusMock.hasAlertaDesignerTemplateConfigured = true;
    listPushSubscriptionsByDesignerMock.mockReset().mockResolvedValue([]);
    sendWebPushNotificationMock.mockReset();
    deletePushSubscriptionByEndpointMock.mockReset().mockResolvedValue(undefined);
  });

  it('rejeita quando o link está expirado', async () => {
    getAvaliacaoLinkStateMock.mockResolvedValue({ state: 'expired', idVersao: null });

    await expect(cancelarAgendamentoCliente('a'.repeat(64))).rejects.toBeInstanceOf(ExpiredLinkError);
    expect(cancelAgendamentoClienteMock).not.toHaveBeenCalled();
  });

  it('rejeita quando o link é inválido', async () => {
    getAvaliacaoLinkStateMock.mockResolvedValue({ state: 'invalid', idVersao: null });

    await expect(cancelarAgendamentoCliente('a'.repeat(64))).rejects.toBeInstanceOf(NotFoundError);
  });

  it('aceita um token já usado (a avaliação foi decidida antes de existir agendamento)', async () => {
    getAvaliacaoLinkStateMock.mockResolvedValue({ state: 'used', idVersao: 5 });
    getTrackingSolicitacaoByVersaoMock.mockResolvedValue({ idSolicitacao: 10, status: 'Agendado', tema: null });
    cancelAgendamentoClienteMock.mockResolvedValue(undefined);

    const result = await cancelarAgendamentoCliente('a'.repeat(64));

    expect(result).toEqual({ idSolicitacao: 10 });
    expect(cancelAgendamentoClienteMock).toHaveBeenCalledWith(expect.anything(), 10);
  });

  it('rejeita quando a solicitação não está mais Agendada (ex.: já publicada ou cancelada por outra via)', async () => {
    getAvaliacaoLinkStateMock.mockResolvedValue({ state: 'used', idVersao: 5 });
    getTrackingSolicitacaoByVersaoMock.mockResolvedValue({ idSolicitacao: 10, status: 'Aprovado', tema: null });

    await expect(cancelarAgendamentoCliente('a'.repeat(64))).rejects.toBeInstanceOf(ConflictError);
    expect(cancelAgendamentoClienteMock).not.toHaveBeenCalled();
  });

  it('propaga ConflictError do repository quando faltam menos de 3h (RN31)', async () => {
    getAvaliacaoLinkStateMock.mockResolvedValue({ state: 'used', idVersao: 5 });
    getTrackingSolicitacaoByVersaoMock.mockResolvedValue({ idSolicitacao: 10, status: 'Agendado', tema: null });
    cancelAgendamentoClienteMock.mockRejectedValue(
      new ConflictError('Cancelamento não permitido: faltam menos de 3 horas para a publicação.'),
    );

    await expect(cancelarAgendamentoCliente('a'.repeat(64))).rejects.toBeInstanceOf(ConflictError);
  });

  it('item 8.6: alerta o designer via WhatsApp (texto de sessão) depois do cancelamento confirmado', async () => {
    getAvaliacaoLinkStateMock.mockResolvedValue({ state: 'used', idVersao: 5 });
    getTrackingSolicitacaoByVersaoMock.mockResolvedValue({ idSolicitacao: 10, status: 'Agendado', tema: null });
    cancelAgendamentoClienteMock.mockResolvedValue(undefined);
    getSolicitacaoDetailRepoMock.mockResolvedValue({
      idDesigner: 'designer-1',
      clienteNome: 'Maria Oliveira',
      tema: 'Promoção de Verão',
    });
    getDesignerByIdMock.mockResolvedValue({ id: 'designer-1', whatsapp: '5511988887777' });
    sendTextMessageMock.mockResolvedValue({ wamid: 'wamid.1' });

    const result = await cancelarAgendamentoCliente('a'.repeat(64));

    expect(result).toEqual({ idSolicitacao: 10 });
    expect(sendTextMessageMock).toHaveBeenCalledOnce();
    const [toNumber, message] = sendTextMessageMock.mock.calls[0] as [string, string];
    expect(toNumber).toBe('5511988887777');
    expect(message).toContain('Maria Oliveira');
    expect(message).toContain('Promoção de Verão');
  });

  it('item 8/8.1 (rodada final): também envia push ao designer, independente do WhatsApp', async () => {
    getAvaliacaoLinkStateMock.mockResolvedValue({ state: 'used', idVersao: 5 });
    getTrackingSolicitacaoByVersaoMock.mockResolvedValue({ idSolicitacao: 10, status: 'Agendado', tema: null });
    cancelAgendamentoClienteMock.mockResolvedValue(undefined);
    getSolicitacaoDetailRepoMock.mockResolvedValue({
      idDesigner: 'designer-1',
      clienteNome: 'Maria Oliveira',
      tema: 'Promoção de Verão',
    });
    getDesignerByIdMock.mockResolvedValue({ id: 'designer-1', whatsapp: '5511988887777' });
    sendTextMessageMock.mockResolvedValue({ wamid: 'wamid.1' });
    listPushSubscriptionsByDesignerMock.mockResolvedValue([
      { endpoint: 'https://push.exemplo/1', p256dh: 'p', authKey: 'a' },
    ]);

    await cancelarAgendamentoCliente('a'.repeat(64));

    expect(sendWebPushNotificationMock).toHaveBeenCalledWith(
      { endpoint: 'https://push.exemplo/1', p256dh: 'p', authKey: 'a' },
      expect.objectContaining({ title: 'Cliente cancelou o agendamento' }),
    );
  });

  it('item 8.6: cai para o template dedicado quando a Meta rejeita por janela de 24h fechada', async () => {
    getAvaliacaoLinkStateMock.mockResolvedValue({ state: 'used', idVersao: 5 });
    getTrackingSolicitacaoByVersaoMock.mockResolvedValue({ idSolicitacao: 10, status: 'Agendado', tema: null });
    cancelAgendamentoClienteMock.mockResolvedValue(undefined);
    getSolicitacaoDetailRepoMock.mockResolvedValue({
      idDesigner: 'designer-1',
      clienteNome: 'Maria Oliveira',
      tema: 'Promoção de Verão',
    });
    getDesignerByIdMock.mockResolvedValue({ id: 'designer-1', whatsapp: '5511988887777' });
    sendTextMessageMock.mockRejectedValue(new WhatsAppReengagementRequiredError('fora da janela'));
    sendAlertaDesignerTemplateMessageMock.mockResolvedValue({ wamid: 'wamid.template.1' });

    const result = await cancelarAgendamentoCliente('a'.repeat(64));

    expect(result).toEqual({ idSolicitacao: 10 });
    expect(sendAlertaDesignerTemplateMessageMock).toHaveBeenCalledWith('5511988887777', [
      'Maria Oliveira',
      'Promoção de Verão',
    ]);
  });

  it('item 8.6: marca BLOCKED_EXTERNAL sem template configurado — cancelamento permanece confirmado', async () => {
    getAvaliacaoLinkStateMock.mockResolvedValue({ state: 'used', idVersao: 5 });
    getTrackingSolicitacaoByVersaoMock.mockResolvedValue({ idSolicitacao: 10, status: 'Agendado', tema: null });
    cancelAgendamentoClienteMock.mockResolvedValue(undefined);
    getSolicitacaoDetailRepoMock.mockResolvedValue({
      idDesigner: 'designer-1',
      clienteNome: 'Maria Oliveira',
      tema: 'Promoção de Verão',
    });
    getDesignerByIdMock.mockResolvedValue({ id: 'designer-1', whatsapp: '5511988887777' });
    sendTextMessageMock.mockRejectedValue(new WhatsAppReengagementRequiredError('fora da janela'));
    whatsappConfigStatusMock.hasAlertaDesignerTemplateConfigured = false;

    const result = await cancelarAgendamentoCliente('a'.repeat(64));

    expect(result).toEqual({ idSolicitacao: 10 });
    expect(sendAlertaDesignerTemplateMessageMock).not.toHaveBeenCalled();
  });

  it('item 8.6: designer sem WhatsApp cadastrado — não tenta enviar nem quebra o cancelamento', async () => {
    getAvaliacaoLinkStateMock.mockResolvedValue({ state: 'used', idVersao: 5 });
    getTrackingSolicitacaoByVersaoMock.mockResolvedValue({ idSolicitacao: 10, status: 'Agendado', tema: null });
    cancelAgendamentoClienteMock.mockResolvedValue(undefined);
    getSolicitacaoDetailRepoMock.mockResolvedValue({
      idDesigner: 'designer-1',
      clienteNome: 'Maria Oliveira',
      tema: 'Promoção de Verão',
    });
    getDesignerByIdMock.mockResolvedValue({ id: 'designer-1', whatsapp: null });

    const result = await cancelarAgendamentoCliente('a'.repeat(64));

    expect(result).toEqual({ idSolicitacao: 10 });
    expect(sendTextMessageMock).not.toHaveBeenCalled();
  });

  it('item 8.6: falha inesperada ao alertar o designer não desfaz o cancelamento já confirmado', async () => {
    getAvaliacaoLinkStateMock.mockResolvedValue({ state: 'used', idVersao: 5 });
    getTrackingSolicitacaoByVersaoMock.mockResolvedValue({ idSolicitacao: 10, status: 'Agendado', tema: null });
    cancelAgendamentoClienteMock.mockResolvedValue(undefined);
    getSolicitacaoDetailRepoMock.mockRejectedValue(new Error('erro inesperado de banco'));

    const result = await cancelarAgendamentoCliente('a'.repeat(64));

    expect(result).toEqual({ idSolicitacao: 10 });
    expect(cancelAgendamentoClienteMock).toHaveBeenCalledOnce();
  });
});
