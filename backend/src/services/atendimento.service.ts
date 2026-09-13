import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseAdminClient } from '../config/supabase.js';
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
  registerWebhookEventOnce,
  revertAtendimentoParaAndamento,
  type ActiveAtendimento,
} from '../repositories/atendimento.repository.js';
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

  try {
    // RF004/item 20: mensagem que abre a conversa é business-initiated (fora
    // da janela de 24h) — a Cloud API exige `type: 'template'`, não texto
    // livre. O template aprovado pela Meta (`inicio_atendimento_designhub`)
    // não possui variável no corpo, então é enviado sem parâmetros; a
    // pergunta de confirmação (RN08) é enviada em seguida como texto livre,
    // já dentro da janela de 24h que o template acabou de abrir.
    await sendTemplateMessage(cliente.whatsapp);
    await sendTextMessage(cliente.whatsapp, primeiraPergunta.prompt);
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
const CANCEL_INTENT_PATTERN = /cancelar|cancela\b|encerrar atendimento/;
const CANCEL_CONFIRM_PATTERN = /^(cancelar|confirmar|confirmo|sim)\b/;

type ConfirmacaoClassificacao = 'sim' | 'nao' | 'indefinido';

function classificarConfirmacao(message: WhatsAppInboundMessage): ConfirmacaoClassificacao {
  if (message.type !== 'text' || !message.text) return 'indefinido';
  const normalized = normalizeText(message.text.body);
  if (YES_PATTERN.test(normalized)) return 'sim';
  if (NO_PATTERN.test(normalized)) return 'nao';
  return 'indefinido';
}

function textoBrutoDaMensagem(message: WhatsAppInboundMessage): string | null {
  return message.type === 'text' && message.text ? message.text.body : null;
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

async function processInboundMessage(
  adminClient: SupabaseClient,
  message: WhatsAppInboundMessage,
): Promise<void> {
  const isNewEvent = await registerWebhookEventOnce(adminClient, message.id);
  if (!isNewEvent) return; // seção 12.3: reentrega do webhook — idempotente, ignora silenciosamente

  const senderPhone = normalizePhone(message.from);
  const activeAtendimentos = await listActiveAtendimentos(adminClient);
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
    const classificacao = classificarConfirmacao(message);
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

  const answerText = await extractAnswerText(match.id, question, message);
  const inserted = await insertResposta(adminClient, match.id, question.prompt, answerText);
  if (!inserted) return; // seção 12.4: outra requisição concorrente já respondeu esta pergunta

  const nextIndex = answeredCount + 1;
  const nextQuestion = ATENDIMENTO_QUESTIONS[nextIndex];
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
