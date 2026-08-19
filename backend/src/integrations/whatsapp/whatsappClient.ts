import { env, whatsappConfigStatus } from '../../config/env.js';
import { BlockedExternalCredentialError, ValidationError } from '../../lib/errors.js';

const GRAPH_API_VERSION = 'v21.0';
const REQUEST_TIMEOUT_MS = 10_000;
/** RF004/item 14: mesmo limite do bucket privado 'artes' (RF007/RNF008, 15 MB). */
const MAX_MEDIA_BYTES = 15 * 1024 * 1024;

export interface SendMessageResult {
  wamid: string;
}

interface WhatsAppSendResponse {
  messages?: Array<{ id: string }>;
}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Timeout ao chamar a WhatsApp Cloud API.');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * RF004/item 17: log técnico de observabilidade (sem número/telefone —
 * RNF010/minimização) confirmando que a Cloud API aceitou o envio. Não
 * cria tabela nova (DER congelado, seção 9): é diagnóstico operacional, não
 * histórico de negócio — RN10 já é satisfeito por `resposta_cliente`.
 */
function logOutboundMessage(kind: 'text' | 'template', wamid: string): void {
  console.info('[designhub:whatsapp] mensagem enviada', { kind, wamid, at: new Date().toISOString() });
}

async function postToGraphMessages(body: Record<string, unknown>): Promise<WhatsAppSendResponse> {
  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
  const response = await fetchWithTimeout(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Falha ao enviar mensagem WhatsApp (status ${response.status}): ${errorBody}`);
  }

  return (await response.json()) as WhatsAppSendResponse;
}

/**
 * RF004/seção 2.1: envia mensagem de texto via WhatsApp Cloud API oficial
 * da Meta — nunca automação não oficial de navegador/WhatsApp Web. Só
 * válida dentro da janela de 24h de atendimento ao cliente (resposta a uma
 * mensagem recebida); mensagens que abrem conversa (business-initiated)
 * devem usar `sendTemplateMessage` (item 20).
 */
export async function sendTextMessage(toPhoneNumber: string, body: string): Promise<SendMessageResult> {
  if (!whatsappConfigStatus.hasSendingClient) {
    throw new BlockedExternalCredentialError(
      'WHATSAPP_ACCESS_TOKEN/WHATSAPP_PHONE_NUMBER_ID ausentes — envio de mensagem indisponível até a credencial ser configurada.',
    );
  }

  const data = await postToGraphMessages({
    messaging_product: 'whatsapp',
    to: toPhoneNumber,
    type: 'text',
    text: { body },
  });

  const wamid = data.messages?.[0]?.id;
  if (!wamid) {
    throw new Error('Resposta inesperada da WhatsApp Cloud API: sem id de mensagem.');
  }
  logOutboundMessage('text', wamid);
  return { wamid };
}

/**
 * RF004/RN08 item 20: a WhatsApp Cloud API exige que a primeira mensagem de
 * uma conversa business-initiated (fora da janela de 24h de atendimento ao
 * cliente) use um template pré-aprovado pela Meta (`type: 'template'`), não
 * texto livre. O nome/idioma vêm de env (`WHATSAPP_TEMPLATE_NAME`/
 * `WHATSAPP_TEMPLATE_LANGUAGE`) porque dependem de aprovação externa no
 * Business Manager — sem template configurado, falha explicitamente em vez
 * de simular sucesso (seção 3.6.1/16.5: nunca mascarar integração ausente).
 * `bodyParams` preenche as variáveis `{{1}}, {{2}}...` do corpo aprovado,
 * preservando o texto de RN08 (ex.: a pergunta de confirmação) como
 * parâmetro do template em vez de reescrever a regra de negócio.
 */
export async function sendTemplateMessage(
  toPhoneNumber: string,
  bodyParams: readonly string[] = [],
): Promise<SendMessageResult> {
  if (!whatsappConfigStatus.hasSendingClient) {
    throw new BlockedExternalCredentialError(
      'WHATSAPP_ACCESS_TOKEN/WHATSAPP_PHONE_NUMBER_ID ausentes — envio de mensagem indisponível até a credencial ser configurada.',
    );
  }
  if (!whatsappConfigStatus.hasTemplateConfigured) {
    throw new BlockedExternalCredentialError(
      'WHATSAPP_TEMPLATE_NAME ausente — nenhum template aprovado pela Meta configurado para iniciar conversa (RF004/item 20).',
    );
  }

  const data = await postToGraphMessages({
    messaging_product: 'whatsapp',
    to: toPhoneNumber,
    type: 'template',
    template: {
      name: env.WHATSAPP_TEMPLATE_NAME,
      language: { code: env.WHATSAPP_TEMPLATE_LANGUAGE },
      ...(bodyParams.length > 0
        ? { components: [{ type: 'body', parameters: bodyParams.map((text) => ({ type: 'text', text })) }] }
        : {}),
    },
  });

  const wamid = data.messages?.[0]?.id;
  if (!wamid) {
    throw new Error('Resposta inesperada da WhatsApp Cloud API: sem id de mensagem.');
  }
  logOutboundMessage('template', wamid);
  return { wamid };
}

interface WhatsAppMediaUrlResponse {
  url?: string;
  file_size?: number;
}

/**
 * Seção 12.3 (SSRF): a URL de download vem da resposta da própria Meta (1ª
 * chamada, autenticada por nós), não de input do cliente do WhatsApp — mas
 * ainda é "URL externamente influenciada". Antes de reenviar o Bearer token
 * nela (2ª chamada), confirma HTTPS e um domínio Meta conhecido, em vez de
 * confiar cegamente no campo.
 */
const ALLOWED_MEDIA_HOST_SUFFIXES = ['.fbsbx.com', '.facebook.com', '.cdninstagram.com'];

function isTrustedMetaMediaUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    return (
      parsed.protocol === 'https:' &&
      ALLOWED_MEDIA_HOST_SUFFIXES.some((suffix) => parsed.hostname.endsWith(suffix))
    );
  } catch {
    return false;
  }
}

/**
 * RF004/RN08/item 14: baixa a mídia (imagem/documento de referência) que o
 * cliente enviou no WhatsApp. Fluxo oficial em duas etapas da Media API da
 * Meta: (1) resolve o `media_id` do webhook em uma URL de download de curta
 * duração; (2) baixa o binário — ambas as chamadas exigem o mesmo Bearer
 * token (a URL não é pública). Limite de tamanho igual ao bucket 'artes'
 * (seção 12.2/RNF008); o formato real ainda é validado por assinatura de
 * bytes no chamador (`lib/fileSignature.ts`), nunca pelo `mime_type`
 * declarado pela Meta.
 */
export async function downloadMediaFromWhatsApp(mediaId: string): Promise<Buffer> {
  if (!whatsappConfigStatus.hasSendingClient) {
    throw new BlockedExternalCredentialError(
      'WHATSAPP_ACCESS_TOKEN ausente — download de mídia do WhatsApp indisponível.',
    );
  }

  const metaResponse = await fetchWithTimeout(
    `https://graph.facebook.com/${GRAPH_API_VERSION}/${mediaId}`,
    { headers: { Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}` } },
  );
  if (!metaResponse.ok) {
    throw new Error(`Falha ao consultar mídia do WhatsApp (status ${metaResponse.status}).`);
  }
  const meta = (await metaResponse.json()) as WhatsAppMediaUrlResponse;
  if (!meta.url) {
    throw new Error('Resposta inesperada da WhatsApp Media API: sem URL de download.');
  }
  if (!isTrustedMetaMediaUrl(meta.url)) {
    throw new Error('Resposta inesperada da WhatsApp Media API: URL de download fora dos domínios Meta esperados.');
  }
  if (typeof meta.file_size === 'number' && meta.file_size > MAX_MEDIA_BYTES) {
    throw new ValidationError('Arquivo de referência excede o tamanho máximo permitido (15 MB).');
  }

  const fileResponse = await fetchWithTimeout(meta.url, {
    headers: { Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}` },
  });
  if (!fileResponse.ok) {
    throw new Error(`Falha ao baixar mídia do WhatsApp (status ${fileResponse.status}).`);
  }

  const arrayBuffer = await fileResponse.arrayBuffer();
  if (arrayBuffer.byteLength > MAX_MEDIA_BYTES) {
    throw new ValidationError('Arquivo de referência excede o tamanho máximo permitido (15 MB).');
  }
  return Buffer.from(arrayBuffer);
}
