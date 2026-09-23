import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseAdminClient } from '../config/supabase.js';
import {
  classificarConfirmacaoComGemini,
  classificarRespostaPerguntaComGemini,
} from '../integrations/ai/geminiClient.js';
import {
  downloadMediaFromWhatsApp,
  sendTemplateMessage,
  sendTextMessage,
} from '../integrations/whatsapp/whatsappClient.js';
import { ConflictError, NotFoundError } from '../lib/errors.js';
import {
  CONTENT_TYPE_BY_FORMATO,
  EXTENSION_BY_FORMATO,
  detectVersaoArteFormato,
} from '../lib/fileSignature.js';
import { uploadArquivoToStorage } from '../repositories/versaoArte.repository.js';
import {
  completeAtendimentoAndCreateSolicitacao,
  countRespostas,
  createAtendimento,
  deleteAtendimento,
  expireStaleAtendimentos,
  findActiveAtendimentoByClienteId,
  findClienteById,
  findSolicitacaoEmAndamentoByClienteId,
  insertResposta,
  listActiveAtendimentos,
  listRespostasOrdenadas,
  markAtendimentoAguardandoCancelamento,
  markAtendimentoCancelado,
  markAtendimentoExpired,
  markAtendimentoRecusado,
  normalizePhone,
  phoneStorageCandidates,
  markWebhookEventoConcluido,
  registerRespostaEAvancar,
  registerWebhookEventOnce,
  revertAtendimentoParaAndamento,
  type ActiveAtendimento,
} from '../repositories/atendimento.repository.js';
import { getDesignerById } from '../repositories/designer.repository.js';
import { syncDesignerBloqueio } from '../repositories/solicitacao.repository.js';
import type { WhatsAppInboundMessage, WhatsAppWebhookPayload } from '../schemas/whatsapp.schemas.js';
import {
  ATENDIMENTO_QUESTIONS,
  CANCELAMENTO_ABORTADO_MESSAGE,
  CANCELAMENTO_CONFIRMACAO_PROMPT,
  CANCELAMENTO_CONFIRMADO_MESSAGE,
  CLOSING_MESSAGE,
  CONFIRMACAO_INVALIDA_MESSAGE,
  RECUSA_MESSAGE,
  RESPOSTA_NAO_PERTINENTE_MESSAGE,
  TIPO_MENSAGEM_NAO_SUPORTADA_MESSAGE,
  TIPO_MENSAGEM_NAO_SUPORTADA_REFERENCIA_MESSAGE,
  buildConfirmacaoPromptComDesigner,
  type QuestionDefinition,
} from './atendimentoQuestions.js';

/** RN05: cliente tem até 2 dias para responder. */
const ATENDIMENTO_TIMEOUT_MS = 2 * 24 * 60 * 60 * 1000;

/**
 * RF004/RN02/RN03: designer inicia o atendimento estruturado no WhatsApp
 * para um cliente já cadastrado (RN04). Envia a primeira pergunta
 * (RN08) e persiste o atendimento; se o envio falhar, compensa removendo
 * o atendimento recém-criado para não bloquear uma nova tentativa.
 *
 * RF006/RN11/RN12: bloqueia a criação de nova solicitação (que nasce ao
 * concluir este atendimento) quando o designer possui solicitação
 * vencida sem primeira versão.
 */
export async function iniciarAtendimento(
  userClient: SupabaseClient,
  idDesigner: string,
  idCliente: number,
): Promise<{ idAtendimento: number }> {
  const cliente = await findClienteById(userClient, idCliente);
  if (!cliente) {
    throw new NotFoundError('Cliente não encontrado.');
  }

  const adminClient = getSupabaseAdminClient();

  const bloqueado = await syncDesignerBloqueio(adminClient, idDesigner);
  if (bloqueado) {
    throw new ConflictError(
      'Você possui solicitação vencida sem a primeira versão enviada. Envie a versão pendente ou cancele a solicitação para poder iniciar um novo atendimento.',
    );
  }

  const existing = await findActiveAtendimentoByClienteId(adminClient, idCliente);
  if (existing) {
    throw new ConflictError('Já existe um atendimento em andamento para este cliente.');
  }

  const solicitacaoEmAndamento = await findSolicitacaoEmAndamentoByClienteId(adminClient, idCliente);
  if (solicitacaoEmAndamento) {
    throw new ConflictError(
      `Já existe uma solicitação de arte em andamento para este cliente (status: ${solicitacaoEmAndamento.status}). Conclua ou cancele antes de iniciar um novo atendimento.`,
    );
  }

  const atendimento = await createAtendimento(adminClient, idCliente);

  const primeiraPergunta = ATENDIMENTO_QUESTIONS[0];
  if (!primeiraPergunta) {
    throw new Error('Configuração inválida: nenhuma pergunta definida para o atendimento.');
  }

  // Item 27 (rodada correções): a pergunta de confirmação identifica o
  // designer responsável pelo nome — nunca e-mail/ID (RNF010). Falha ao
  // buscar o nome não pode travar o início do atendimento: cai para o texto
  // genérico já aprovado.
  const designer = await getDesignerById(adminClient, idDesigner);
  const primeiraPerguntaTexto = designer
    ? buildConfirmacaoPromptComDesigner(designer.nomeCompleto)
    : primeiraPergunta.prompt;

  try {
    // RF004/item 20: mensagem que abre a conversa é business-initiated (fora
    // da janela de 24h) — a Cloud API exige `type: 'template'`, não texto
    // livre. O template aprovado pela Meta (`inicio_atendimento_designhub`)
    // não possui variável no corpo, então é enviado sem parâmetros; a
    // pergunta de confirmação (RN08) é enviada em seguida como texto livre,
    // já dentro da janela de 24h que o template acabou de abrir.
    await sendTemplateMessage(cliente.whatsapp);
    await sendTextMessage(cliente.whatsapp, primeiraPerguntaTexto);
  } catch (sendError) {
    await deleteAtendimento(adminClient, atendimento.id);
    throw sendError;
  }

  return { idAtendimento: atendimento.id };
}

/**
 * RF004/RN08/item 14: baixa e valida a imagem/documento de referência que o
 * cliente enviou e sobe para o mesmo bucket privado usado por RF007/RF010
 * (`artes`). Retorna o path (mesma convenção de `versao_arte.arquivo_url` —
 * não é URL pública; exige URL assinada para visualização, seção 12.5).
 */
async function downloadAndStoreReferencia(idAtendimento: number, mediaId: string): Promise<string> {
  const buffer = await downloadMediaFromWhatsApp(mediaId);
  const formato = detectVersaoArteFormato(buffer);
  if (!formato) {
    throw new Error('Formato de referência não suportado (PDF, JPG ou PNG esperado).');
  }

  const adminClient = getSupabaseAdminClient();
  const path = `atendimentos/${idAtendimento}/referencias/${randomUUID()}.${EXTENSION_BY_FORMATO[formato]}`;
  await uploadArquivoToStorage(adminClient, path, buffer, CONTENT_TYPE_BY_FORMATO[formato]);
  return path;
}

/**
 * Gate G: falha ao baixar/validar a mídia (rede, formato não suportado,
 * tamanho excedido) não pode travar o questionário nem ser reprocessada — o
 * evento do webhook já foi marcado como processado (idempotência). Registra
 * um texto explícito de falha em vez de simular sucesso (seção 3.6.1).
 */
async function extractAnswerText(idAtendimento: number, question: QuestionDefinition, message: WhatsAppInboundMessage): Promise<string> {
  if (message.type === 'text' && message.text) {
    return message.text.body;
  }

  const media = message.type === 'image' ? message.image : message.type === 'document' ? message.document : undefined;
  if (question.key === 'referencia' && media) {
    try {
      return await downloadAndStoreReferencia(idAtendimento, media.id);
    } catch {
      // Seção 12.5: string fixa, nunca o erro cru — uma falha de rede de
      // baixo nível poderia eventualmente ecoar a URL assinada de mídia na
      // mensagem de erro, dependendo da implementação interna do fetch.
      console.error('[designhub:whatsapp] falha ao baixar/validar mídia de referência', { idAtendimento });
      return '[referência enviada, mas não foi possível processar o arquivo]';
    }
  }

  return `[mensagem tipo ${message.type} recebida]`;
}

/**
 * Seção 12.3/Gate G: a mensagem recebida já foi persistida com sucesso
 * quando isto é chamado — uma falha aqui (rede/token/limite da Meta) é do
 * envio de SAÍDA, não da ingestão do webhook. Não deve derrubar o
 * processamento (a Meta reenviaria o webhook, mas o evento já está
 * marcado como processado — reenviar não ajudaria); só registra o erro
 * para diagnóstico operacional, sem incluir o número do destinatário no
 * log (RNF010/minimização de dado pessoal).
 */
async function sendTextMessageBestEffort(
  idAtendimento: number,
  toPhoneNumber: string,
  body: string,
): Promise<void> {
  try {
    await sendTextMessage(toPhoneNumber, body);
  } catch {
    // Seção 12.5: string fixa — o corpo de erro da Graph API às vezes ecoa
    // o parâmetro inválido (pode incluir o número de telefone) e não deve
    // ir para o log.
    console.error('[designhub:whatsapp] falha ao enviar mensagem de saída', { idAtendimento });
  }
}

/** Remove acentos e normaliza para minúsculas — variações seguras (item 3.2) sem inventar dado. */
/** Intervalo Unicode de marcas diacríticas combinantes (U+0300–U+036F), usado para remover acentos após normalize('NFD'). */
const DIACRITIC_MARKS_PATTERN = /[̀-ͯ]/g;

function normalizeText(value: string): string {
  return value.normalize('NFD').replace(DIACRITIC_MARKS_PATTERN, '').trim().toLowerCase();
}

const YES_PATTERN = /^(sim|s|yes|ok(ay)?|okey|claro|pode|confirmo|confirmado)\b/;
const NO_PATTERN = /^(nao|n|no|nunca|negativo)\b/;
/**
 * Item 3.3: reconhece intenção de cancelar em qualquer ponto do
 * questionário. Regex propositalmente restrita a termos inequívocos de
 * cancelamento — nunca dispara para respostas normais de tema/cores/etc.
 */
// Item 12.3: ancorado no início — antes, um tema legítimo contendo a palavra
// ("post sobre cancelar assinatura") disparava o fluxo de cancelamento. A
// linguagem natural fora deste padrão é coberta pelo classificador de IA.
const CANCEL_INTENT_PATTERN =
  /^(cancelar|cancela|quero cancelar|desejo cancelar|pode cancelar|quero encerrar|encerrar atendimento)\b/;
const CANCEL_CONFIRM_PATTERN = /^(cancelar|confirmar|confirmo|sim)\b/;

type ConfirmacaoClassificacao = 'sim' | 'nao' | 'indefinido';

function classificarConfirmacaoRegex(message: WhatsAppInboundMessage): ConfirmacaoClassificacao {
  if (message.type !== 'text' || !message.text) return 'indefinido';
  const normalized = normalizeText(message.text.body);
  if (YES_PATTERN.test(normalized)) return 'sim';
  if (NO_PATTERN.test(normalized)) return 'nao';
  return 'indefinido';
}

/**
 * Item 16 (rodada correções — IA autorizada nesta rodada): a regra
 * determinística acima cobre as respostas inequívocas de sempre ("sim",
 * "não", "pode", "claro"...) e nunca é sobrescrita quando já decide algo —
 * o classificador Gemini (`classificarConfirmacaoComGemini`) só é consultado
 * quando ela retorna 'indefinido' e a mensagem é texto real, como uma
 * segunda tentativa de entender respostas mais naturais ("por mim tudo
 * certo", "acho que não quero agora") antes de pedir esclarecimento ao
 * cliente. Em qualquer indisponibilidade da IA (sem chave, timeout, erro,
 * limite local) o resultado permanece 'indefinido' — comportamento idêntico
 * ao existente antes deste item, nunca bloqueia nem muda o fluxo por conta
 * própria.
 */
async function classificarConfirmacao(message: WhatsAppInboundMessage): Promise<ConfirmacaoClassificacao> {
  const classificacaoRegex = classificarConfirmacaoRegex(message);
  if (classificacaoRegex !== 'indefinido') return classificacaoRegex;
  if (message.type !== 'text' || !message.text) return 'indefinido';

  const iaResultado = await classificarConfirmacaoComGemini(message.text.body);
  return iaResultado?.confirmacao ?? 'indefinido';
}

function textoBrutoDaMensagem(message: WhatsAppInboundMessage): string | null {
  return message.type === 'text' && message.text ? message.text.body : null;
}

/** Ausência declarada de preferência — as perguntas de cores/observações/referência sugerem literalmente "não tenho". */
const SEM_PREFERENCIA_PATTERN =
  /^(nao tenho|nao|n tenho|nenhuma|nenhum|tanto faz|sem preferencia|voce escolhe|vc escolhe|fica a seu criterio|qualquer uma|qualquer um)\b/;

/** Pedido explícito de retomar de onde parou (item 13). */
const CONTINUAR_INTENT_PATTERN = /^(continuar|continua|seguir|prosseguir|vamos continuar|pode continuar)\b/;

/**
 * Rodada correções (item 12.3): heurística determinística usada quando o
 * classificador de IA está indisponível. Cobre exatamente o sintoma
 * relatado — o cliente PERGUNTA em vez de responder ("Você já está com a IA
 * nesse chat?", "Oq vc quer q eu falo?") e o texto era gravado como tema/
 * cores/observação. Propositalmente conservadora: só barra texto com marca
 * clara de pergunta, para que uma indisponibilidade da IA nunca impeça um
 * cliente de responder normalmente (RNF005).
 */
const PERGUNTA_DO_CLIENTE_PATTERN = /\?\s*$|^(o que|oq|que|qual|quais|como|quando|onde|por que|porque|pq|quem|vc|voce)\b.*\?/;

type PertinenciaDecisao = 'aceitar' | 'esclarecer' | 'cancelar' | 'reenviar_pergunta';

/**
 * Rodada correções (item 12.2/12.3): antes, QUALQUER texto com ao menos um
 * caractere alfanumérico era gravado como a resposta da pergunta corrente —
 * perguntas do próprio cliente viravam o tema da arte e pedidos de ajuda
 * viravam as observações, corrompendo a solicitação criada no fim do
 * atendimento (RN09).
 *
 * Ordem de decisão (a IA é sempre a SEGUNDA camada, nunca a primeira):
 * 1. regras determinísticas inequívocas ("não tenho", "continuar");
 * 2. classificador Gemini para linguagem natural ambígua — fail closed em
 *    dúvida, texto fora de contexto ou confiança baixa: pede esclarecimento
 *    e NÃO avança o questionário;
 * 3. IA indisponível (sem chave, timeout, erro, limite): heurística
 *    determinística acima. Bloquear todo o fluxo durante uma queda do
 *    provedor externo seria uma regressão de disponibilidade pior que o bug
 *    original, então só o padrão claro de pergunta é barrado.
 */
async function avaliarPertinenciaResposta(
  question: QuestionDefinition,
  texto: string,
): Promise<PertinenciaDecisao> {
  const normalized = normalizeText(texto);

  if (CONTINUAR_INTENT_PATTERN.test(normalized)) return 'reenviar_pergunta';
  // "não tenho" é resposta legítima para cores/observações/referência (o
  // próprio prompt a sugere), mas não diz nada sobre o TEMA da arte.
  if (SEM_PREFERENCIA_PATTERN.test(normalized)) {
    return question.key === 'tema' ? 'esclarecer' : 'aceitar';
  }

  const ia = await classificarRespostaPerguntaComGemini(question.prompt, texto);
  if (ia === null) {
    return PERGUNTA_DO_CLIENTE_PATTERN.test(normalized) ? 'esclarecer' : 'aceitar';
  }
  if (ia.classificacao === 'cancelar') return 'cancelar';
  if (ia.classificacao === 'continuar') return 'reenviar_pergunta';
  if (ia.confianca === 'baixa') return 'esclarecer';
  if (ia.classificacao === 'duvida' || ia.classificacao === 'fora_de_contexto') return 'esclarecer';
  if (ia.classificacao === 'sem_preferencia') {
    return question.key === 'tema' ? 'esclarecer' : 'aceitar';
  }
  return 'aceitar';
}

/** RN08/item 28: uma resposta só de emoji/símbolo (sem letra nem número) não carrega informação real. */
const HAS_ALPHANUMERIC_CONTENT = /[\p{L}\p{N}]/u;

/**
 * Item 28 (rodada correções): distingue o que a Cloud API pode entregar
 * (`text`, `image`, `document`, `sticker`, `reaction`, `audio`, `video`,
 * `location`, `contacts`, `interactive`, `unknown`) do que cada pergunta
 * RN08 de fato aceita como resposta. `referencia` aceita texto ou
 * imagem/PDF; as demais perguntas livres (tema/cores/observações) só
 * aceitam texto com conteúdo real — nunca figurinha/reação/áudio/vídeo/
 * emoji isolado tratados como se fossem a resposta.
 */
function isRespostaAceitavelParaPergunta(question: QuestionDefinition, message: WhatsAppInboundMessage): boolean {
  if (question.key === 'referencia') {
    return message.type === 'text' || message.type === 'image' || message.type === 'document';
  }
  return message.type === 'text' && message.text !== undefined && HAS_ALPHANUMERIC_CONTENT.test(message.text.body);
}

/**
 * Item 3.3: atendimento em `aguardando_cancelamento` — a mensagem atual não
 * é resposta a nenhuma pergunta RN08, é a confirmação (ou não) do
 * cancelamento pedido na mensagem anterior.
 */
async function processCancelamentoPendente(
  adminClient: SupabaseClient,
  match: ActiveAtendimento,
  message: WhatsAppInboundMessage,
): Promise<void> {
  const texto = textoBrutoDaMensagem(message);
  const confirmou = texto !== null && CANCEL_CONFIRM_PATTERN.test(normalizeText(texto));

  if (confirmou) {
    await markAtendimentoCancelado(adminClient, match.id);
    await sendTextMessageBestEffort(match.id, match.clienteWhatsapp, CANCELAMENTO_CONFIRMADO_MESSAGE);
    return;
  }

  await revertAtendimentoParaAndamento(adminClient, match.id);
  const answeredCount = await countRespostas(adminClient, match.id);
  const pendingQuestion = ATENDIMENTO_QUESTIONS[answeredCount];
  const retomada = pendingQuestion
    ? `${CANCELAMENTO_ABORTADO_MESSAGE} ${pendingQuestion.prompt}`
    : CANCELAMENTO_ABORTADO_MESSAGE;
  await sendTextMessageBestEffort(match.id, match.clienteWhatsapp, retomada);
}

/**
 * Auditoria (achado HIGH — perda silenciosa de resposta do cliente): a
 * reserva do evento (`registerWebhookEventOnce`) só marca conclusão
 * (`markWebhookEventoConcluido`) DEPOIS que todo o processamento real
 * termina sem lançar erro. Se qualquer chamada dentro de
 * `handleInboundMessage` falhar (timeout, erro transitório do Supabase), a
 * exceção propaga para a rota do webhook, que responde não-2xx — a Meta
 * reentrega, e `registerWebhookEventOnce` permite uma nova tentativa real
 * (reserva travada há mais de 30s) em vez de descartar a mensagem em
 * silêncio.
 */
async function processInboundMessage(
  adminClient: SupabaseClient,
  message: WhatsAppInboundMessage,
): Promise<void> {
  const isNewEvent = await registerWebhookEventOnce(adminClient, message.id);
  if (!isNewEvent) return; // já concluído ou sendo processado por outra requisição concorrente

  await handleInboundMessage(adminClient, message);
  await markWebhookEventoConcluido(adminClient, message.id);
}

async function handleInboundMessage(
  adminClient: SupabaseClient,
  message: WhatsAppInboundMessage,
): Promise<void> {
  const senderPhone = normalizePhone(message.from);
  const activeAtendimentos = await listActiveAtendimentos(adminClient, phoneStorageCandidates(message.from));
  const match = activeAtendimentos.find(
    (atendimento) => normalizePhone(atendimento.clienteWhatsapp) === senderPhone,
  );
  if (!match) return; // RN04: sem atendimento estruturado ativo para este número

  if (match.status === 'aguardando_cancelamento') {
    await processCancelamentoPendente(adminClient, match, message);
    return;
  }

  const startedAtMs = new Date(match.dataInicio).getTime();
  if (Date.now() - startedAtMs > ATENDIMENTO_TIMEOUT_MS) {
    await markAtendimentoExpired(adminClient, match.id);
    return;
  }

  const answeredCount = await countRespostas(adminClient, match.id);
  if (answeredCount >= ATENDIMENTO_QUESTIONS.length) return; // já concluído

  const question = ATENDIMENTO_QUESTIONS[answeredCount];
  if (!question) return;

  // Item 3.3: cancelamento explícito tem prioridade sobre qualquer pergunta
  // em aberto — não é registrado como resposta (RN09 cobre respostas reais
  // ao questionário, não meta-conversação sobre encerrar o atendimento).
  const textoBruto = textoBrutoDaMensagem(message);
  if (textoBruto !== null && CANCEL_INTENT_PATTERN.test(normalizeText(textoBruto))) {
    await markAtendimentoAguardandoCancelamento(adminClient, match.id);
    await sendTextMessageBestEffort(match.id, match.clienteWhatsapp, CANCELAMENTO_CONFIRMACAO_PROMPT);
    return;
  }

  // Item 3.1/3.2: a pergunta de confirmação tem domínio de resposta
  // restrito (sim/não) — "não" encerra sem avançar; resposta ambígua pede
  // esclarecimento e repete a pergunta, sem inventar dado nem avançar.
  if (question.key === 'confirmacao') {
    const classificacao = await classificarConfirmacao(message);
    if (classificacao === 'nao') {
      const answerText = await extractAnswerText(match.id, question, message);
      await insertResposta(adminClient, match.id, question.prompt, answerText);
      await markAtendimentoRecusado(adminClient, match.id);
      await sendTextMessageBestEffort(match.id, match.clienteWhatsapp, RECUSA_MESSAGE);
      return;
    }
    if (classificacao === 'indefinido') {
      await sendTextMessageBestEffort(match.id, match.clienteWhatsapp, CONFIRMACAO_INVALIDA_MESSAGE);
      return;
    }
  }

  // Item 28: figurinha/reação/áudio/vídeo/emoji isolado nunca contam como
  // resposta válida — pede esclarecimento e NÃO avança o questionário
  // (sem isso, `extractAnswerText` caía no fallback genérico e gravava um
  // texto de placeholder como se fosse a resposta real, RN09).
  if (!isRespostaAceitavelParaPergunta(question, message)) {
    const naoSuportadaMessage =
      question.key === 'referencia' ? TIPO_MENSAGEM_NAO_SUPORTADA_REFERENCIA_MESSAGE : TIPO_MENSAGEM_NAO_SUPORTADA_MESSAGE;
    await sendTextMessageBestEffort(match.id, match.clienteWhatsapp, naoSuportadaMessage);
    return;
  }

  /**
   * Item 12.2/12.3: só agora — depois de garantir que o tipo da mensagem é
   * aceitável — avalia se o TEXTO de fato responde à pergunta. Sem esta
   * etapa, uma pergunta do cliente era gravada como tema/cores/observação.
   * Não se aplica à confirmação (já classificada acima) nem a referência
   * enviada como imagem/documento (o arquivo é a resposta).
   */
  const textoResposta = textoBrutoDaMensagem(message);
  if (question.key !== 'confirmacao' && textoResposta !== null) {
    const decisao = await avaliarPertinenciaResposta(question, textoResposta);
    if (decisao === 'cancelar') {
      await markAtendimentoAguardandoCancelamento(adminClient, match.id);
      await sendTextMessageBestEffort(match.id, match.clienteWhatsapp, CANCELAMENTO_CONFIRMACAO_PROMPT);
      return;
    }
    if (decisao === 'reenviar_pergunta') {
      await sendTextMessageBestEffort(
        match.id,
        match.clienteWhatsapp,
        `${CANCELAMENTO_ABORTADO_MESSAGE} ${question.prompt}`,
      );
      return;
    }
    if (decisao === 'esclarecer') {
      await sendTextMessageBestEffort(
        match.id,
        match.clienteWhatsapp,
        `${RESPOSTA_NAO_PERTINENTE_MESSAGE} ${question.prompt}`,
      );
      return;
    }
  }

  // Item N.5.6: a decisão de qual pergunta esta resposta corresponde e o
  // INSERT ocorrem atomicamente sob lock do atendimento (fecha a corrida
  // entre duas mensagens quase simultâneas — a versão anterior lia a
  // contagem aqui fora de qualquer lock).
  const answerText = await extractAnswerText(match.id, question, message);
  const { inserted, answeredCount: answeredCountAfter } = await registerRespostaEAvancar(
    adminClient,
    match.id,
    ATENDIMENTO_QUESTIONS.map((q) => q.prompt),
    answerText,
    // Item 15: `wamid` da mensagem — reprocessar o mesmo evento reentregue
    // pela Meta vira no-op em vez de gravar este texto na pergunta seguinte.
    message.id,
  );
  if (!inserted) return; // questionário já concluído (mensagem espontânea) ou nada a fazer

  const nextQuestion = ATENDIMENTO_QUESTIONS[answeredCountAfter];
  if (nextQuestion) {
    await sendTextMessageBestEffort(match.id, match.clienteWhatsapp, nextQuestion.prompt);
    return;
  }

  const respostas = await listRespostasOrdenadas(adminClient, match.id);
  await completeAtendimentoAndCreateSolicitacao(adminClient, {
    idAtendimento: match.id,
    tema: respostas[1] ?? '',
    cores: respostas[2] ?? '',
    observacoes: respostas[3] ?? '',
  });
  await sendTextMessageBestEffort(match.id, match.clienteWhatsapp, CLOSING_MESSAGE);
}

/** RF004: processa o payload recebido do webhook da WhatsApp Cloud API. */
export async function processInboundWebhook(payload: WhatsAppWebhookPayload): Promise<void> {
  const adminClient = getSupabaseAdminClient();

  for (const entry of payload.entry) {
    for (const change of entry.changes) {
      if (change.field !== 'messages') continue;
      for (const message of change.value.messages ?? []) {
        await processInboundMessage(adminClient, message);
      }
    }
  }
}

/**
 * RN05/seção 11: encerra atendimentos abertos há mais de 2 dias sem
 * resposta completa. Chamada pelo endpoint interno protegido (job/cron),
 * mesmo padrão do RF014 (`processarAgendamentosVencidos`).
 */
export async function processarAtendimentosExpirados(): Promise<{ expirados: number }> {
  const adminClient = getSupabaseAdminClient();
  const expirados = await expireStaleAtendimentos(adminClient);
  return { expirados };
}
