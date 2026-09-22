import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BlockedExternalCredentialError, ConflictError, NotFoundError } from '../lib/errors.js';

const {
  sendTextMessageMock,
  sendTemplateMessageMock,
  downloadMediaFromWhatsAppMock,
  uploadArquivoToStorageMock,
  getSupabaseAdminClientMock,
  findClienteByIdMock,
  findActiveAtendimentoByClienteIdMock,
  findSolicitacaoEmAndamentoByClienteIdMock,
  createAtendimentoMock,
  deleteAtendimentoMock,
  registerWebhookEventOnceMock,
  markWebhookEventoConcluidoMock,
  listActiveAtendimentosMock,
  markAtendimentoExpiredMock,
  markAtendimentoRecusadoMock,
  markAtendimentoAguardandoCancelamentoMock,
  markAtendimentoCanceladoMock,
  revertAtendimentoParaAndamentoMock,
  countRespostasMock,
  insertRespostaMock,
  registerRespostaEAvancarMock,
  listRespostasOrdenadasMock,
  completeAtendimentoAndCreateSolicitacaoMock,
  syncDesignerBloqueioMock,
  getDesignerByIdMock,
  classificarConfirmacaoComGeminiMock,
} = vi.hoisted(() => ({
  sendTextMessageMock: vi.fn(),
  sendTemplateMessageMock: vi.fn(),
  downloadMediaFromWhatsAppMock: vi.fn(),
  uploadArquivoToStorageMock: vi.fn(),
  getSupabaseAdminClientMock: vi.fn(() => ({ __kind: 'admin-client' })),
  findClienteByIdMock: vi.fn(),
  findActiveAtendimentoByClienteIdMock: vi.fn(),
  findSolicitacaoEmAndamentoByClienteIdMock: vi.fn(),
  createAtendimentoMock: vi.fn(),
  deleteAtendimentoMock: vi.fn(),
  registerWebhookEventOnceMock: vi.fn(),
  markWebhookEventoConcluidoMock: vi.fn(),
  listActiveAtendimentosMock: vi.fn(),
  markAtendimentoExpiredMock: vi.fn(),
  markAtendimentoRecusadoMock: vi.fn(),
  markAtendimentoAguardandoCancelamentoMock: vi.fn(),
  markAtendimentoCanceladoMock: vi.fn(),
  revertAtendimentoParaAndamentoMock: vi.fn(),
  countRespostasMock: vi.fn(),
  insertRespostaMock: vi.fn(),
  registerRespostaEAvancarMock: vi.fn(),
  listRespostasOrdenadasMock: vi.fn(),
  completeAtendimentoAndCreateSolicitacaoMock: vi.fn(),
  syncDesignerBloqueioMock: vi.fn(),
  getDesignerByIdMock: vi.fn(),
  classificarConfirmacaoComGeminiMock: vi.fn(),
}));

vi.mock('../config/supabase.js', () => ({
  getSupabaseAdminClient: getSupabaseAdminClientMock,
}));

vi.mock('../integrations/whatsapp/whatsappClient.js', () => ({
  sendTextMessage: sendTextMessageMock,
  sendTemplateMessage: sendTemplateMessageMock,
  downloadMediaFromWhatsApp: downloadMediaFromWhatsAppMock,
}));

vi.mock('../repositories/versaoArte.repository.js', () => ({
  uploadArquivoToStorage: uploadArquivoToStorageMock,
}));

vi.mock('../repositories/atendimento.repository.js', () => ({
  findClienteById: findClienteByIdMock,
  findActiveAtendimentoByClienteId: findActiveAtendimentoByClienteIdMock,
  findSolicitacaoEmAndamentoByClienteId: findSolicitacaoEmAndamentoByClienteIdMock,
  createAtendimento: createAtendimentoMock,
  deleteAtendimento: deleteAtendimentoMock,
  registerWebhookEventOnce: registerWebhookEventOnceMock,
  markWebhookEventoConcluido: markWebhookEventoConcluidoMock,
  listActiveAtendimentos: listActiveAtendimentosMock,
  markAtendimentoExpired: markAtendimentoExpiredMock,
  markAtendimentoRecusado: markAtendimentoRecusadoMock,
  markAtendimentoAguardandoCancelamento: markAtendimentoAguardandoCancelamentoMock,
  markAtendimentoCancelado: markAtendimentoCanceladoMock,
  revertAtendimentoParaAndamento: revertAtendimentoParaAndamentoMock,
  countRespostas: countRespostasMock,
  insertResposta: insertRespostaMock,
  registerRespostaEAvancar: registerRespostaEAvancarMock,
  listRespostasOrdenadas: listRespostasOrdenadasMock,
  completeAtendimentoAndCreateSolicitacao: completeAtendimentoAndCreateSolicitacaoMock,
  normalizePhone: (value: string) => value.replace(/\D/g, ''),
  phoneStorageCandidates: (value: string) => [value.replace(/\D/g, '')],
}));

vi.mock('../repositories/solicitacao.repository.js', () => ({
  syncDesignerBloqueio: syncDesignerBloqueioMock,
}));

vi.mock('../repositories/designer.repository.js', () => ({
  getDesignerById: getDesignerByIdMock,
}));

vi.mock('../integrations/ai/geminiClient.js', () => ({
  classificarConfirmacaoComGemini: classificarConfirmacaoComGeminiMock,
}));

const { iniciarAtendimento, processInboundWebhook } = await import('./atendimento.service.js');

function inboundMessage(
  overrides: Partial<{
    from: string;
    id: string;
    type: string;
    text: { body: string } | undefined;
    image: { id: string; mime_type?: string };
    document: { id: string; mime_type?: string };
  }> = {},
) {
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
    findSolicitacaoEmAndamentoByClienteIdMock.mockReset().mockResolvedValue(null);
    createAtendimentoMock.mockReset();
    deleteAtendimentoMock.mockReset();
    sendTextMessageMock.mockReset();
    sendTemplateMessageMock.mockReset();
    syncDesignerBloqueioMock.mockReset().mockResolvedValue(false);
    getDesignerByIdMock.mockReset().mockResolvedValue({ id: 'designer-1', nomeCompleto: 'Dora Designer' });
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

  it('lança ConflictError quando o cliente já tem solicitação em andamento (RF004)', async () => {
    findClienteByIdMock.mockResolvedValue({ id: 1, whatsapp: '5511999999999' });
    findActiveAtendimentoByClienteIdMock.mockResolvedValue(null);
    findSolicitacaoEmAndamentoByClienteIdMock.mockResolvedValue({ id: 99, status: 'Ajustes' });

    await expect(iniciarAtendimento({} as never, 'designer-1', 1)).rejects.toBeInstanceOf(ConflictError);
    expect(createAtendimentoMock).not.toHaveBeenCalled();
    expect(sendTextMessageMock).not.toHaveBeenCalled();
  });

  it('cria o atendimento, abre a conversa com o template e envia a primeira pergunta como texto', async () => {
    findClienteByIdMock.mockResolvedValue({ id: 1, whatsapp: '5511999999999' });
    findActiveAtendimentoByClienteIdMock.mockResolvedValue(null);
    createAtendimentoMock.mockResolvedValue({ id: 42 });
    sendTemplateMessageMock.mockResolvedValue({ wamid: 'wamid.out.1' });
    sendTextMessageMock.mockResolvedValue({ wamid: 'wamid.out.2' });

    const result = await iniciarAtendimento({} as never, 'designer-1', 1);

    expect(result).toEqual({ idAtendimento: 42 });
    // item 20: mensagem que abre a conversa (business-initiated) usa template
    // sem parâmetro (corpo aprovado sem variável); a pergunta de confirmação
    // (RN08) segue como texto livre, já dentro da janela de 24h aberta.
    expect(sendTemplateMessageMock).toHaveBeenCalledWith('5511999999999');
    expect(sendTextMessageMock).toHaveBeenCalledWith('5511999999999', expect.any(String));
    expect(deleteAtendimentoMock).not.toHaveBeenCalled();
  });

  it('rodada correções (item 27): a pergunta de confirmação identifica o designer responsável pelo nome', async () => {
    findClienteByIdMock.mockResolvedValue({ id: 1, whatsapp: '5511999999999' });
    findActiveAtendimentoByClienteIdMock.mockResolvedValue(null);
    createAtendimentoMock.mockResolvedValue({ id: 42 });
    sendTemplateMessageMock.mockResolvedValue({ wamid: 'wamid.out.1' });
    sendTextMessageMock.mockResolvedValue({ wamid: 'wamid.out.2' });
    getDesignerByIdMock.mockResolvedValue({ id: 'designer-1', nomeCompleto: 'Dora Designer' });

    await iniciarAtendimento({} as never, 'designer-1', 1);

    expect(sendTextMessageMock).toHaveBeenCalledWith('5511999999999', expect.stringContaining('Dora Designer'));
    expect(sendTextMessageMock).not.toHaveBeenCalledWith('5511999999999', expect.stringContaining('@'));
  });

  it('rodada correções (item 27): cai para o texto genérico se o nome do designer não puder ser resolvido', async () => {
    findClienteByIdMock.mockResolvedValue({ id: 1, whatsapp: '5511999999999' });
    findActiveAtendimentoByClienteIdMock.mockResolvedValue(null);
    createAtendimentoMock.mockResolvedValue({ id: 42 });
    sendTemplateMessageMock.mockResolvedValue({ wamid: 'wamid.out.1' });
    sendTextMessageMock.mockResolvedValue({ wamid: 'wamid.out.2' });
    getDesignerByIdMock.mockResolvedValue(null);

    const result = await iniciarAtendimento({} as never, 'designer-1', 1);

    expect(result).toEqual({ idAtendimento: 42 });
    expect(sendTextMessageMock).toHaveBeenCalledWith('5511999999999', expect.stringContaining('Vamos iniciar o atendimento'));
  });

  it('compensa (remove o atendimento) quando o envio do template de abertura falha', async () => {
    findClienteByIdMock.mockResolvedValue({ id: 1, whatsapp: '5511999999999' });
    findActiveAtendimentoByClienteIdMock.mockResolvedValue(null);
    createAtendimentoMock.mockResolvedValue({ id: 42 });
    sendTemplateMessageMock.mockRejectedValue(new Error('WhatsApp indisponível'));

    await expect(iniciarAtendimento({} as never, 'designer-1', 1)).rejects.toThrow('WhatsApp indisponível');
    expect(sendTextMessageMock).not.toHaveBeenCalled();
    expect(deleteAtendimentoMock).toHaveBeenCalledWith(expect.anything(), 42);
  });

  it('compensa (remove o atendimento) quando o template abre a conversa mas o envio da primeira pergunta falha', async () => {
    findClienteByIdMock.mockResolvedValue({ id: 1, whatsapp: '5511999999999' });
    findActiveAtendimentoByClienteIdMock.mockResolvedValue(null);
    createAtendimentoMock.mockResolvedValue({ id: 42 });
    sendTemplateMessageMock.mockResolvedValue({ wamid: 'wamid.out.1' });
    sendTextMessageMock.mockRejectedValue(new Error('WhatsApp indisponível'));

    await expect(iniciarAtendimento({} as never, 'designer-1', 1)).rejects.toThrow('WhatsApp indisponível');
    expect(deleteAtendimentoMock).toHaveBeenCalledWith(expect.anything(), 42);
  });

  it('propaga BlockedExternalCredentialError quando nenhum template Meta está configurado (item 20)', async () => {
    findClienteByIdMock.mockResolvedValue({ id: 1, whatsapp: '5511999999999' });
    findActiveAtendimentoByClienteIdMock.mockResolvedValue(null);
    createAtendimentoMock.mockResolvedValue({ id: 42 });
    sendTemplateMessageMock.mockRejectedValue(new BlockedExternalCredentialError('WHATSAPP_TEMPLATE_NAME ausente'));

    await expect(iniciarAtendimento({} as never, 'designer-1', 1)).rejects.toBeInstanceOf(
      BlockedExternalCredentialError,
    );
    expect(deleteAtendimentoMock).toHaveBeenCalledWith(expect.anything(), 42);
  });
});

describe('processInboundWebhook (RF004/RN08, idempotência)', () => {
  beforeEach(() => {
    registerWebhookEventOnceMock.mockReset().mockResolvedValue(true);
    markWebhookEventoConcluidoMock.mockReset().mockResolvedValue(undefined);
    listActiveAtendimentosMock.mockReset().mockResolvedValue([]);
    markAtendimentoExpiredMock.mockReset();
    markAtendimentoRecusadoMock.mockReset();
    markAtendimentoAguardandoCancelamentoMock.mockReset();
    markAtendimentoCanceladoMock.mockReset();
    revertAtendimentoParaAndamentoMock.mockReset();
    countRespostasMock.mockReset();
    insertRespostaMock.mockReset().mockResolvedValue(true);
    registerRespostaEAvancarMock.mockReset();
    listRespostasOrdenadasMock.mockReset();
    completeAtendimentoAndCreateSolicitacaoMock.mockReset();
    sendTextMessageMock.mockReset().mockResolvedValue({ wamid: 'wamid.out' });
    downloadMediaFromWhatsAppMock.mockReset();
    uploadArquivoToStorageMock.mockReset().mockResolvedValue(undefined);
    classificarConfirmacaoComGeminiMock.mockReset().mockResolvedValue(null);
  });

  it('ignora reentrega do mesmo evento (idempotência)', async () => {
    registerWebhookEventOnceMock.mockResolvedValue(false);

    await processInboundWebhook(webhookPayload(inboundMessage()));

    expect(listActiveAtendimentosMock).not.toHaveBeenCalled();
  });

  it('auditoria (achado HIGH): marca o evento como concluído somente depois do processamento terminar com sucesso', async () => {
    listActiveAtendimentosMock.mockResolvedValue([
      { id: 1, idCliente: 1, dataInicio: new Date().toISOString(), clienteWhatsapp: '5511999999999' },
    ]);
    countRespostasMock.mockResolvedValue(0);
    registerRespostaEAvancarMock.mockResolvedValue({ inserted: true, answeredCount: 1 });

    await processInboundWebhook(webhookPayload(inboundMessage({ from: '5511999999999' })));

    expect(markWebhookEventoConcluidoMock).toHaveBeenCalledOnce();
  });

  it('auditoria (achado HIGH): NÃO marca como concluído e propaga o erro quando o processamento falha (permite reentrega real da Meta reprocessar)', async () => {
    listActiveAtendimentosMock.mockRejectedValue(new Error('falha transitória do Supabase'));

    await expect(
      processInboundWebhook(webhookPayload(inboundMessage({ from: '5511999999999' }))),
    ).rejects.toThrow('falha transitória do Supabase');
    expect(markWebhookEventoConcluidoMock).not.toHaveBeenCalled();
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
    registerRespostaEAvancarMock.mockResolvedValue({ inserted: true, answeredCount: 2 });

    await processInboundWebhook(webhookPayload(inboundMessage({ from: '5511999999999' })));

    expect(registerRespostaEAvancarMock).toHaveBeenCalledOnce();
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
    registerRespostaEAvancarMock.mockResolvedValue({ inserted: true, answeredCount: 5 });
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

  it('mensagem espontânea após o questionário concluído não altera dados nem cria nova solicitação (item 11)', async () => {
    // RN08/item 20: `complete_atendimento_and_create_solicitacao` marca o
    // atendimento como 'concluido' na mesma transação que cria a
    // solicitação — o filtro `status = 'em_andamento'` de
    // `listActiveAtendimentos` (repositório real) já exclui esse
    // atendimento das próximas mensagens do mesmo número, então nenhum
    // `match` é encontrado.
    listActiveAtendimentosMock.mockResolvedValue([]);

    await processInboundWebhook(webhookPayload(inboundMessage({ from: '5511999999999', text: { body: 'oi' } })));

    expect(insertRespostaMock).not.toHaveBeenCalled();
    expect(completeAtendimentoAndCreateSolicitacaoMock).not.toHaveBeenCalled();
    expect(sendTextMessageMock).not.toHaveBeenCalled();
  });

  it('não avança o fluxo quando a RPC atômica indica questionário já concluído (item N.5.6)', async () => {
    listActiveAtendimentosMock.mockResolvedValue([
      { id: 1, idCliente: 1, dataInicio: new Date().toISOString(), clienteWhatsapp: '5511999999999' },
    ]);
    countRespostasMock.mockResolvedValue(1);
    registerRespostaEAvancarMock.mockResolvedValue({ inserted: false, answeredCount: 5 });

    await processInboundWebhook(webhookPayload(inboundMessage({ from: '5511999999999' })));

    expect(sendTextMessageMock).not.toHaveBeenCalled();
    expect(completeAtendimentoAndCreateSolicitacaoMock).not.toHaveBeenCalled();
  });

  it('item N.5.6: usa a contagem retornada pela RPC (não a leitura prévia, potencialmente desatualizada por uma corrida) para decidir a próxima pergunta', async () => {
    listActiveAtendimentosMock.mockResolvedValue([
      { id: 1, idCliente: 1, dataInicio: new Date().toISOString(), clienteWhatsapp: '5511999999999' },
    ]);
    // Leitura prévia (fora do lock) sugere que só a 2ª pergunta (tema) foi
    // respondida — mas sob o lock, outra mensagem concorrente já avançou o
    // atendimento até a 4ª (observações). A RPC atômica é a fonte da
    // verdade: a próxima pergunta enviada deve refletir `answeredCount`
    // devolvido por ela, nunca o valor desatualizado de `countRespostasMock`.
    countRespostasMock.mockResolvedValue(1);
    registerRespostaEAvancarMock.mockResolvedValue({ inserted: true, answeredCount: 4 });

    await processInboundWebhook(webhookPayload(inboundMessage({ from: '5511999999999' })));

    expect(sendTextMessageMock).toHaveBeenCalledWith('5511999999999', expect.stringContaining('referência'));
  });

  it('não propaga erro quando o envio da próxima pergunta falha (Gate G — resposta já foi persistida)', async () => {
    listActiveAtendimentosMock.mockResolvedValue([
      { id: 1, idCliente: 1, dataInicio: new Date().toISOString(), clienteWhatsapp: '5511999999999' },
    ]);
    countRespostasMock.mockResolvedValue(1);
    registerRespostaEAvancarMock.mockResolvedValue({ inserted: true, answeredCount: 2 });
    sendTextMessageMock.mockRejectedValue(new Error('WhatsApp indisponível'));

    await expect(
      processInboundWebhook(webhookPayload(inboundMessage({ from: '5511999999999' }))),
    ).resolves.toBeUndefined();
    expect(registerRespostaEAvancarMock).toHaveBeenCalledOnce();
  });

  it('rodada correções (item 28): figurinha (sticker) não é aceita como resposta a uma pergunta livre — não avança nem insere', async () => {
    listActiveAtendimentosMock.mockResolvedValue([
      { id: 1, idCliente: 1, dataInicio: new Date().toISOString(), clienteWhatsapp: '5511999999999' },
    ]);
    countRespostasMock.mockResolvedValue(1); // pergunta "tema"

    await processInboundWebhook(
      webhookPayload(inboundMessage({ type: 'sticker', text: undefined })),
    );

    expect(registerRespostaEAvancarMock).not.toHaveBeenCalled();
    expect(insertRespostaMock).not.toHaveBeenCalled();
    expect(sendTextMessageMock).toHaveBeenCalledWith(
      '5511999999999',
      expect.stringContaining('Não consegui entender esse conteúdo'),
    );
  });

  it('rodada correções (item 28): reação (reaction) não é aceita como resposta a uma pergunta livre', async () => {
    listActiveAtendimentosMock.mockResolvedValue([
      { id: 1, idCliente: 1, dataInicio: new Date().toISOString(), clienteWhatsapp: '5511999999999' },
    ]);
    countRespostasMock.mockResolvedValue(1);

    await processInboundWebhook(
      webhookPayload(inboundMessage({ type: 'reaction', text: undefined })),
    );

    expect(registerRespostaEAvancarMock).not.toHaveBeenCalled();
    expect(sendTextMessageMock).toHaveBeenCalledWith(
      '5511999999999',
      expect.stringContaining('Não consegui entender esse conteúdo'),
    );
  });

  it('rodada correções (item 28): áudio não é aceito como resposta a uma pergunta livre', async () => {
    listActiveAtendimentosMock.mockResolvedValue([
      { id: 1, idCliente: 1, dataInicio: new Date().toISOString(), clienteWhatsapp: '5511999999999' },
    ]);
    countRespostasMock.mockResolvedValue(1);

    await processInboundWebhook(webhookPayload(inboundMessage({ type: 'audio', text: undefined })));

    expect(registerRespostaEAvancarMock).not.toHaveBeenCalled();
  });

  it('rodada correções (item 28): emoji isolado (sem letra/número) não satisfaz automaticamente uma pergunta estruturada', async () => {
    listActiveAtendimentosMock.mockResolvedValue([
      { id: 1, idCliente: 1, dataInicio: new Date().toISOString(), clienteWhatsapp: '5511999999999' },
    ]);
    countRespostasMock.mockResolvedValue(1);

    await processInboundWebhook(webhookPayload(inboundMessage({ text: { body: '👍👍👍' } })));

    expect(registerRespostaEAvancarMock).not.toHaveBeenCalled();
    expect(sendTextMessageMock).toHaveBeenCalledWith(
      '5511999999999',
      expect.stringContaining('Não consegui entender esse conteúdo'),
    );
  });

  it('rodada correções (item 28): texto normal contendo emoji continua sendo aceito normalmente', async () => {
    listActiveAtendimentosMock.mockResolvedValue([
      { id: 1, idCliente: 1, dataInicio: new Date().toISOString(), clienteWhatsapp: '5511999999999' },
    ]);
    countRespostasMock.mockResolvedValue(1);
    registerRespostaEAvancarMock.mockResolvedValue({ inserted: true, answeredCount: 2 });

    await processInboundWebhook(webhookPayload(inboundMessage({ text: { body: 'Rosa e dourado 🎨' } })));

    expect(registerRespostaEAvancarMock).toHaveBeenCalledWith(
      expect.anything(),
      1,
      expect.any(Array),
      'Rosa e dourado 🎨',
    );
  });

  it('rodada correções (item 28): figurinha na pergunta de referência recebe orientação específica (aceita imagem/PDF ou texto)', async () => {
    listActiveAtendimentosMock.mockResolvedValue([
      { id: 1, idCliente: 1, dataInicio: new Date().toISOString(), clienteWhatsapp: '5511999999999' },
    ]);
    countRespostasMock.mockResolvedValue(4); // pergunta "referência"

    await processInboundWebhook(webhookPayload(inboundMessage({ type: 'sticker', text: undefined })));

    expect(registerRespostaEAvancarMock).not.toHaveBeenCalled();
    expect(sendTextMessageMock).toHaveBeenCalledWith(
      '5511999999999',
      expect.stringContaining('Envie uma imagem/PDF'),
    );
  });

  it('rodada correções (item 28): figurinha na pergunta de confirmação não conta como "sim" (comportamento já correto, regressão)', async () => {
    listActiveAtendimentosMock.mockResolvedValue([
      { id: 1, idCliente: 1, dataInicio: new Date().toISOString(), clienteWhatsapp: '5511999999999' },
    ]);
    countRespostasMock.mockResolvedValue(0); // pergunta "confirmação"

    await processInboundWebhook(webhookPayload(inboundMessage({ type: 'sticker', text: undefined })));

    expect(registerRespostaEAvancarMock).not.toHaveBeenCalled();
    expect(sendTextMessageMock).toHaveBeenCalledWith('5511999999999', expect.stringContaining('Não entendi sua resposta'));
  });

  it('baixa e armazena a imagem de referência via Media API quando a pergunta atual é a última (item 14)', async () => {
    listActiveAtendimentosMock.mockResolvedValue([
      { id: 1, idCliente: 1, dataInicio: new Date().toISOString(), clienteWhatsapp: '5511999999999' },
    ]);
    countRespostasMock.mockResolvedValue(4); // última pergunta (referência)
    registerRespostaEAvancarMock.mockResolvedValue({ inserted: true, answeredCount: 5 });
    const pngBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0xff]);
    downloadMediaFromWhatsAppMock.mockResolvedValue(pngBuffer);
    listRespostasOrdenadasMock.mockResolvedValue(['sim', 'Tema X', 'Azul', 'Sem observações', 'atendimentos/1/referencias/x.png']);
    completeAtendimentoAndCreateSolicitacaoMock.mockResolvedValue(999);

    await processInboundWebhook(
      webhookPayload(inboundMessage({ type: 'image', image: { id: 'media-1' }, text: undefined })),
    );

    expect(downloadMediaFromWhatsAppMock).toHaveBeenCalledWith('media-1');
    expect(uploadArquivoToStorageMock).toHaveBeenCalledOnce();
    expect(registerRespostaEAvancarMock).toHaveBeenCalledWith(
      expect.anything(),
      1,
      expect.any(Array),
      expect.stringMatching(/^atendimentos\/1\/referencias\/.+\.png$/),
    );
  });

  it('registra texto de falha sem travar o atendimento quando o download da mídia falha (Gate G)', async () => {
    listActiveAtendimentosMock.mockResolvedValue([
      { id: 1, idCliente: 1, dataInicio: new Date().toISOString(), clienteWhatsapp: '5511999999999' },
    ]);
    countRespostasMock.mockResolvedValue(4);
    registerRespostaEAvancarMock.mockResolvedValue({ inserted: true, answeredCount: 5 });
    downloadMediaFromWhatsAppMock.mockRejectedValue(new Error('timeout'));
    listRespostasOrdenadasMock.mockResolvedValue(['sim', 'Tema X', 'Azul', 'Sem observações', 'falhou']);
    completeAtendimentoAndCreateSolicitacaoMock.mockResolvedValue(999);

    await expect(
      processInboundWebhook(
        webhookPayload(inboundMessage({ type: 'image', image: { id: 'media-1' }, text: undefined })),
      ),
    ).resolves.toBeUndefined();

    expect(uploadArquivoToStorageMock).not.toHaveBeenCalled();
    expect(registerRespostaEAvancarMock).toHaveBeenCalledWith(
      expect.anything(),
      1,
      expect.any(Array),
      '[referência enviada, mas não foi possível processar o arquivo]',
    );
    expect(completeAtendimentoAndCreateSolicitacaoMock).toHaveBeenCalledOnce();
  });

  it('item 3.1: resposta "Não" à confirmação encerra sem perguntar tema nem criar solicitação', async () => {
    listActiveAtendimentosMock.mockResolvedValue([
      { id: 1, idCliente: 1, dataInicio: new Date().toISOString(), clienteWhatsapp: '5511999999999', status: 'em_andamento' },
    ]);
    countRespostasMock.mockResolvedValue(0); // pergunta de confirmação

    await processInboundWebhook(webhookPayload(inboundMessage({ text: { body: 'Não' } })));

    expect(insertRespostaMock).toHaveBeenCalledOnce();
    expect(markAtendimentoRecusadoMock).toHaveBeenCalledWith(expect.anything(), 1);
    expect(sendTextMessageMock).toHaveBeenCalledWith('5511999999999', expect.stringContaining('não vamos continuar'));
    expect(completeAtendimentoAndCreateSolicitacaoMock).not.toHaveBeenCalled();
  });

  it('item 3.1: aceita variações seguras de "sim" e avança normalmente para a próxima pergunta', async () => {
    listActiveAtendimentosMock.mockResolvedValue([
      { id: 1, idCliente: 1, dataInicio: new Date().toISOString(), clienteWhatsapp: '5511999999999', status: 'em_andamento' },
    ]);
    countRespostasMock.mockResolvedValue(0);
    registerRespostaEAvancarMock.mockResolvedValue({ inserted: true, answeredCount: 1 });

    await processInboundWebhook(webhookPayload(inboundMessage({ text: { body: 'Sim, pode continuar' } })));

    expect(registerRespostaEAvancarMock).toHaveBeenCalledOnce();
    expect(markAtendimentoRecusadoMock).not.toHaveBeenCalled();
    expect(sendTextMessageMock).toHaveBeenCalledOnce();
  });

  it('item 3.2: resposta ambígua à confirmação não avança nem inventa dado — orienta e repete a pergunta', async () => {
    listActiveAtendimentosMock.mockResolvedValue([
      { id: 1, idCliente: 1, dataInicio: new Date().toISOString(), clienteWhatsapp: '5511999999999', status: 'em_andamento' },
    ]);
    countRespostasMock.mockResolvedValue(0);

    await processInboundWebhook(webhookPayload(inboundMessage({ text: { body: 'talvez' } })));

    expect(classificarConfirmacaoComGeminiMock).toHaveBeenCalledWith('talvez');
    expect(insertRespostaMock).not.toHaveBeenCalled();
    expect(markAtendimentoRecusadoMock).not.toHaveBeenCalled();
    expect(sendTextMessageMock).toHaveBeenCalledWith('5511999999999', expect.stringContaining('Não entendi'));
  });

  it('item 16: regra determinística inequívoca ("Sim, pode continuar") nunca consulta a IA', async () => {
    listActiveAtendimentosMock.mockResolvedValue([
      { id: 1, idCliente: 1, dataInicio: new Date().toISOString(), clienteWhatsapp: '5511999999999', status: 'em_andamento' },
    ]);
    countRespostasMock.mockResolvedValue(0);
    registerRespostaEAvancarMock.mockResolvedValue({ inserted: true, answeredCount: 1 });

    await processInboundWebhook(webhookPayload(inboundMessage({ text: { body: 'Sim, pode continuar' } })));

    expect(classificarConfirmacaoComGeminiMock).not.toHaveBeenCalled();
    expect(registerRespostaEAvancarMock).toHaveBeenCalledOnce();
  });

  it('item 16: quando a regra determinística fica indefinida, usa a classificação da IA para avançar ("sim")', async () => {
    listActiveAtendimentosMock.mockResolvedValue([
      { id: 1, idCliente: 1, dataInicio: new Date().toISOString(), clienteWhatsapp: '5511999999999', status: 'em_andamento' },
    ]);
    countRespostasMock.mockResolvedValue(0);
    registerRespostaEAvancarMock.mockResolvedValue({ inserted: true, answeredCount: 1 });
    classificarConfirmacaoComGeminiMock.mockResolvedValue({ confirmacao: 'sim' });

    await processInboundWebhook(webhookPayload(inboundMessage({ text: { body: 'por mim tudo certo, pode seguir' } })));

    expect(classificarConfirmacaoComGeminiMock).toHaveBeenCalledWith('por mim tudo certo, pode seguir');
    expect(registerRespostaEAvancarMock).toHaveBeenCalledOnce();
    expect(markAtendimentoRecusadoMock).not.toHaveBeenCalled();
  });

  it('item 16: quando a regra determinística fica indefinida, usa a classificação da IA para recusar ("nao")', async () => {
    listActiveAtendimentosMock.mockResolvedValue([
      { id: 1, idCliente: 1, dataInicio: new Date().toISOString(), clienteWhatsapp: '5511999999999', status: 'em_andamento' },
    ]);
    countRespostasMock.mockResolvedValue(0);
    classificarConfirmacaoComGeminiMock.mockResolvedValue({ confirmacao: 'nao' });

    await processInboundWebhook(webhookPayload(inboundMessage({ text: { body: 'acho que não quero fazer isso agora' } })));

    expect(markAtendimentoRecusadoMock).toHaveBeenCalledWith(expect.anything(), 1);
    expect(sendTextMessageMock).toHaveBeenCalledWith('5511999999999', expect.stringContaining('não vamos continuar'));
  });

  it('item 16: IA indisponível (erro/timeout/sem chave) preserva o comportamento atual — pede esclarecimento', async () => {
    listActiveAtendimentosMock.mockResolvedValue([
      { id: 1, idCliente: 1, dataInicio: new Date().toISOString(), clienteWhatsapp: '5511999999999', status: 'em_andamento' },
    ]);
    countRespostasMock.mockResolvedValue(0);
    classificarConfirmacaoComGeminiMock.mockResolvedValue(null);

    await processInboundWebhook(webhookPayload(inboundMessage({ text: { body: 'sei la' } })));

    expect(insertRespostaMock).not.toHaveBeenCalled();
    expect(markAtendimentoRecusadoMock).not.toHaveBeenCalled();
    expect(sendTextMessageMock).toHaveBeenCalledWith('5511999999999', expect.stringContaining('Não entendi'));
  });

  it('item 3.3: pedido de cancelamento em qualquer pergunta pede confirmação sem registrar como resposta', async () => {
    listActiveAtendimentosMock.mockResolvedValue([
      { id: 1, idCliente: 1, dataInicio: new Date().toISOString(), clienteWhatsapp: '5511999999999', status: 'em_andamento' },
    ]);
    countRespostasMock.mockResolvedValue(1); // pergunta de tema

    await processInboundWebhook(webhookPayload(inboundMessage({ text: { body: 'quero cancelar' } })));

    expect(insertRespostaMock).not.toHaveBeenCalled();
    expect(markAtendimentoAguardandoCancelamentoMock).toHaveBeenCalledWith(expect.anything(), 1);
    expect(sendTextMessageMock).toHaveBeenCalledWith('5511999999999', expect.stringContaining('cancelar este atendimento'));
  });

  it('item 3.3: confirmação do cancelamento efetiva sem criar solicitação', async () => {
    listActiveAtendimentosMock.mockResolvedValue([
      {
        id: 1,
        idCliente: 1,
        dataInicio: new Date().toISOString(),
        clienteWhatsapp: '5511999999999',
        status: 'aguardando_cancelamento',
      },
    ]);

    await processInboundWebhook(webhookPayload(inboundMessage({ text: { body: 'Cancelar' } })));

    expect(markAtendimentoCanceladoMock).toHaveBeenCalledWith(expect.anything(), 1);
    expect(revertAtendimentoParaAndamentoMock).not.toHaveBeenCalled();
    expect(sendTextMessageMock).toHaveBeenCalledWith('5511999999999', expect.stringContaining('Atendimento cancelado'));
    expect(insertRespostaMock).not.toHaveBeenCalled();
    expect(completeAtendimentoAndCreateSolicitacaoMock).not.toHaveBeenCalled();
  });

  it('item 3.3: qualquer resposta que não confirme o cancelamento retoma o atendimento normalmente', async () => {
    listActiveAtendimentosMock.mockResolvedValue([
      {
        id: 1,
        idCliente: 1,
        dataInicio: new Date().toISOString(),
        clienteWhatsapp: '5511999999999',
        status: 'aguardando_cancelamento',
      },
    ]);
    countRespostasMock.mockResolvedValue(1); // pergunta de tema pendente

    await processInboundWebhook(webhookPayload(inboundMessage({ text: { body: 'Continuar' } })));

    expect(revertAtendimentoParaAndamentoMock).toHaveBeenCalledWith(expect.anything(), 1);
    expect(markAtendimentoCanceladoMock).not.toHaveBeenCalled();
    expect(sendTextMessageMock).toHaveBeenCalledWith(
      '5511999999999',
      expect.stringContaining('Qual é o tema da arte'),
    );
  });
});
