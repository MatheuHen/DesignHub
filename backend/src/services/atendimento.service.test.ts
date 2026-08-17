import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConflictError, NotFoundError } from '../lib/errors.js';

const {
  sendTextMessageMock,
  getSupabaseAdminClientMock,
  findClienteByIdMock,
  findActiveAtendimentoByClienteIdMock,
  createAtendimentoMock,
  deleteAtendimentoMock,
  registerWebhookEventOnceMock,
  listActiveAtendimentosMock,
  markAtendimentoExpiredMock,
  countRespostasMock,
  insertRespostaMock,
  listRespostasOrdenadasMock,
  completeAtendimentoAndCreateSolicitacaoMock,
  syncDesignerBloqueioMock,
} = vi.hoisted(() => ({
  sendTextMessageMock: vi.fn(),
  getSupabaseAdminClientMock: vi.fn(() => ({ __kind: 'admin-client' })),
  findClienteByIdMock: vi.fn(),
  findActiveAtendimentoByClienteIdMock: vi.fn(),
  createAtendimentoMock: vi.fn(),
  deleteAtendimentoMock: vi.fn(),
  registerWebhookEventOnceMock: vi.fn(),
  listActiveAtendimentosMock: vi.fn(),
  markAtendimentoExpiredMock: vi.fn(),
  countRespostasMock: vi.fn(),
  insertRespostaMock: vi.fn(),
  listRespostasOrdenadasMock: vi.fn(),
  completeAtendimentoAndCreateSolicitacaoMock: vi.fn(),
  syncDesignerBloqueioMock: vi.fn(),
}));

vi.mock('../config/supabase.js', () => ({
  getSupabaseAdminClient: getSupabaseAdminClientMock,
}));

vi.mock('../integrations/whatsapp/whatsappClient.js', () => ({
  sendTextMessage: sendTextMessageMock,
}));

vi.mock('../repositories/atendimento.repository.js', () => ({
  findClienteById: findClienteByIdMock,
  findActiveAtendimentoByClienteId: findActiveAtendimentoByClienteIdMock,
  createAtendimento: createAtendimentoMock,
  deleteAtendimento: deleteAtendimentoMock,
  registerWebhookEventOnce: registerWebhookEventOnceMock,
  listActiveAtendimentos: listActiveAtendimentosMock,
  markAtendimentoExpired: markAtendimentoExpiredMock,
  countRespostas: countRespostasMock,
  insertResposta: insertRespostaMock,
  listRespostasOrdenadas: listRespostasOrdenadasMock,
  completeAtendimentoAndCreateSolicitacao: completeAtendimentoAndCreateSolicitacaoMock,
  normalizePhone: (value: string) => value.replace(/\D/g, ''),
}));

vi.mock('../repositories/solicitacao.repository.js', () => ({
  syncDesignerBloqueio: syncDesignerBloqueioMock,
}));

const { iniciarAtendimento, processInboundWebhook } = await import('./atendimento.service.js');

function inboundMessage(overrides: Partial<{ from: string; id: string; type: string; text: { body: string } }> = {}) {
  return {
    from: '5511999999999',
    id: 'wamid.1',
    type: 'text',
    text: { body: 'resposta do cliente' },
    ...overrides,
  };
}

function webhookPayload(message: ReturnType<typeof inboundMessage>) {
  return {
    object: 'whatsapp_business_account',
    entry: [{ changes: [{ field: 'messages', value: { messages: [message] } }] }],
  };
}

describe('iniciarAtendimento (RF004/RN02/RN03, RF006)', () => {
  beforeEach(() => {
    findClienteByIdMock.mockReset();
    findActiveAtendimentoByClienteIdMock.mockReset();
    createAtendimentoMock.mockReset();
    deleteAtendimentoMock.mockReset();
    sendTextMessageMock.mockReset();
    syncDesignerBloqueioMock.mockReset().mockResolvedValue(false);
  });

  it('lança NotFoundError quando o cliente não pertence ao designer (ownership via RLS)', async () => {
    findClienteByIdMock.mockResolvedValue(null);

    await expect(iniciarAtendimento({} as never, 'designer-1', 1)).rejects.toBeInstanceOf(NotFoundError);
    expect(createAtendimentoMock).not.toHaveBeenCalled();
  });

  it('lança ConflictError quando o designer está bloqueado por solicitação vencida (RF006)', async () => {
    findClienteByIdMock.mockResolvedValue({ id: 1, whatsapp: '5511999999999' });
    syncDesignerBloqueioMock.mockResolvedValue(true);

    await expect(iniciarAtendimento({} as never, 'designer-1', 1)).rejects.toBeInstanceOf(ConflictError);
    expect(findActiveAtendimentoByClienteIdMock).not.toHaveBeenCalled();
    expect(createAtendimentoMock).not.toHaveBeenCalled();
  });

  it('lança ConflictError quando já existe atendimento em andamento (RN04/RN05)', async () => {
    findClienteByIdMock.mockResolvedValue({ id: 1, whatsapp: '5511999999999' });
    findActiveAtendimentoByClienteIdMock.mockResolvedValue({ id: 10 });

    await expect(iniciarAtendimento({} as never, 'designer-1', 1)).rejects.toBeInstanceOf(ConflictError);
    expect(createAtendimentoMock).not.toHaveBeenCalled();
  });

  it('cria o atendimento e envia a primeira pergunta', async () => {
    findClienteByIdMock.mockResolvedValue({ id: 1, whatsapp: '5511999999999' });
    findActiveAtendimentoByClienteIdMock.mockResolvedValue(null);
    createAtendimentoMock.mockResolvedValue({ id: 42 });
    sendTextMessageMock.mockResolvedValue({ wamid: 'wamid.out.1' });

    const result = await iniciarAtendimento({} as never, 'designer-1', 1);

    expect(result).toEqual({ idAtendimento: 42 });
    expect(sendTextMessageMock).toHaveBeenCalledWith('5511999999999', expect.any(String));
    expect(deleteAtendimentoMock).not.toHaveBeenCalled();
  });

  it('compensa (remove o atendimento) quando o envio da primeira pergunta falha', async () => {
    findClienteByIdMock.mockResolvedValue({ id: 1, whatsapp: '5511999999999' });
    findActiveAtendimentoByClienteIdMock.mockResolvedValue(null);
    createAtendimentoMock.mockResolvedValue({ id: 42 });
    sendTextMessageMock.mockRejectedValue(new Error('WhatsApp indisponível'));

    await expect(iniciarAtendimento({} as never, 'designer-1', 1)).rejects.toThrow('WhatsApp indisponível');
    expect(deleteAtendimentoMock).toHaveBeenCalledWith(expect.anything(), 42);
  });
});

describe('processInboundWebhook (RF004/RN08, idempotência)', () => {
  beforeEach(() => {
    registerWebhookEventOnceMock.mockReset().mockResolvedValue(true);
    listActiveAtendimentosMock.mockReset().mockResolvedValue([]);
    markAtendimentoExpiredMock.mockReset();
    countRespostasMock.mockReset();
    insertRespostaMock.mockReset().mockResolvedValue(true);
    listRespostasOrdenadasMock.mockReset();
    completeAtendimentoAndCreateSolicitacaoMock.mockReset();
    sendTextMessageMock.mockReset().mockResolvedValue({ wamid: 'wamid.out' });
  });

  it('ignora reentrega do mesmo evento (idempotência)', async () => {
    registerWebhookEventOnceMock.mockResolvedValue(false);

    await processInboundWebhook(webhookPayload(inboundMessage()));

    expect(listActiveAtendimentosMock).not.toHaveBeenCalled();
  });

  it('ignora mensagem sem atendimento ativo correspondente ao número (RN04)', async () => {
    listActiveAtendimentosMock.mockResolvedValue([
      { id: 1, idCliente: 1, dataInicio: new Date().toISOString(), clienteWhatsapp: '5511000000000' },
    ]);

    await processInboundWebhook(webhookPayload(inboundMessage({ from: '5511999999999' })));

    expect(insertRespostaMock).not.toHaveBeenCalled();
  });

  it('expira o atendimento quando passou de 2 dias sem concluir (RN05)', async () => {
    const dataInicio = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    listActiveAtendimentosMock.mockResolvedValue([
      { id: 1, idCliente: 1, dataInicio, clienteWhatsapp: '5511999999999' },
    ]);

    await processInboundWebhook(webhookPayload(inboundMessage({ from: '5511999999999' })));

    expect(markAtendimentoExpiredMock).toHaveBeenCalledWith(expect.anything(), 1);
    expect(insertRespostaMock).not.toHaveBeenCalled();
  });

  it('registra a resposta e envia a próxima pergunta quando o questionário não terminou', async () => {
    listActiveAtendimentosMock.mockResolvedValue([
      {
        id: 1,
        idCliente: 1,
        dataInicio: new Date().toISOString(),
        clienteWhatsapp: '5511999999999',
      },
    ]);
    countRespostasMock.mockResolvedValue(1); // já respondeu a 1ª (confirmação); esta é a 2ª (tema)

    await processInboundWebhook(webhookPayload(inboundMessage({ from: '5511999999999' })));

    expect(insertRespostaMock).toHaveBeenCalledOnce();
    expect(sendTextMessageMock).toHaveBeenCalledOnce();
    expect(completeAtendimentoAndCreateSolicitacaoMock).not.toHaveBeenCalled();
  });

  it('conclui o atendimento e cria a solicitação após a última pergunta (RN03)', async () => {
    listActiveAtendimentosMock.mockResolvedValue([
      {
        id: 1,
        idCliente: 1,
        dataInicio: new Date().toISOString(),
        clienteWhatsapp: '5511999999999',
      },
    ]);
    countRespostasMock.mockResolvedValue(4); // faltava só a última (referência)
    listRespostasOrdenadasMock.mockResolvedValue(['sim', 'Tema X', 'Azul', 'Sem observações', 'não tenho']);
    completeAtendimentoAndCreateSolicitacaoMock.mockResolvedValue(999);

    await processInboundWebhook(webhookPayload(inboundMessage({ from: '5511999999999' })));

    expect(completeAtendimentoAndCreateSolicitacaoMock).toHaveBeenCalledWith(expect.anything(), {
      idAtendimento: 1,
      tema: 'Tema X',
      cores: 'Azul',
      observacoes: 'Sem observações',
    });
    expect(sendTextMessageMock).toHaveBeenCalledOnce();
  });

  it('não avança o fluxo quando outra requisição concorrente já respondeu a mesma pergunta (seção 12.4)', async () => {
    listActiveAtendimentosMock.mockResolvedValue([
      { id: 1, idCliente: 1, dataInicio: new Date().toISOString(), clienteWhatsapp: '5511999999999' },
    ]);
    countRespostasMock.mockResolvedValue(1);
    insertRespostaMock.mockResolvedValue(false); // perdeu a corrida (unique violation)

    await processInboundWebhook(webhookPayload(inboundMessage({ from: '5511999999999' })));

    expect(sendTextMessageMock).not.toHaveBeenCalled();
    expect(completeAtendimentoAndCreateSolicitacaoMock).not.toHaveBeenCalled();
  });

  it('não propaga erro quando o envio da próxima pergunta falha (Gate G — resposta já foi persistida)', async () => {
    listActiveAtendimentosMock.mockResolvedValue([
      { id: 1, idCliente: 1, dataInicio: new Date().toISOString(), clienteWhatsapp: '5511999999999' },
    ]);
    countRespostasMock.mockResolvedValue(1);
    sendTextMessageMock.mockRejectedValue(new Error('WhatsApp indisponível'));

    await expect(
      processInboundWebhook(webhookPayload(inboundMessage({ from: '5511999999999' }))),
    ).resolves.toBeUndefined();
    expect(insertRespostaMock).toHaveBeenCalledOnce();
  });
});
