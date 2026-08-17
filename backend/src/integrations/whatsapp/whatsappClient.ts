import { env, whatsappConfigStatus } from '../../config/env.js';
import { BlockedExternalCredentialError } from '../../lib/errors.js';

const GRAPH_API_VERSION = 'v21.0';
const REQUEST_TIMEOUT_MS = 10_000;

export interface SendTextMessageResult {
  wamid: string;
}

interface WhatsAppSendResponse {
  messages?: Array<{ id: string }>;
}

/**
 * RF004/seção 2.1: envia mensagem de texto via WhatsApp Cloud API oficial
 * da Meta — nunca automação não oficial de navegador/WhatsApp Web. Seção
 * 12.3: timeout explícito para chamada a serviço externo.
 */
export async function sendTextMessage(
  toPhoneNumber: string,
  body: string,
): Promise<SendTextMessageResult> {
  if (!whatsappConfigStatus.hasSendingClient) {
    throw new BlockedExternalCredentialError(
      'WHATSAPP_ACCESS_TOKEN/WHATSAPP_PHONE_NUMBER_ID ausentes — envio de mensagem indisponível até a credencial ser configurada.',
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
    const response = await fetch(url, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: toPhoneNumber,
        type: 'text',
        text: { body },
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Falha ao enviar mensagem WhatsApp (status ${response.status}): ${errorBody}`);
    }

    const data = (await response.json()) as WhatsAppSendResponse;
    const wamid = data.messages?.[0]?.id;
    if (!wamid) {
      throw new Error('Resposta inesperada da WhatsApp Cloud API: sem id de mensagem.');
    }

    return { wamid };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Timeout ao chamar a WhatsApp Cloud API.');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
