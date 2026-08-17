import { createHmac, timingSafeEqual } from 'node:crypto';
import { env, whatsappConfigStatus } from '../../config/env.js';

const SIGNATURE_PREFIX = 'sha256=';

/**
 * Seção 12.3: valida a assinatura `X-Hub-Signature-256` do webhook da Meta
 * (HMAC-SHA256 do corpo bruto usando o App Secret), conforme a
 * documentação oficial de webhooks da plataforma. O payload nunca deve ser
 * processado sem essa verificação passar.
 */
export function verifyWebhookSignature(
  rawBody: Buffer,
  signatureHeader: string | undefined,
): boolean {
  if (!whatsappConfigStatus.hasWebhookSecurity) return false;
  if (!signatureHeader || !signatureHeader.startsWith(SIGNATURE_PREFIX)) return false;

  const providedHex = signatureHeader.slice(SIGNATURE_PREFIX.length);
  const expectedHex = createHmac('sha256', env.META_APP_SECRET!).update(rawBody).digest('hex');

  const expectedBuffer = Buffer.from(expectedHex, 'hex');
  const providedBuffer = Buffer.from(providedHex, 'hex');
  if (expectedBuffer.length !== providedBuffer.length) return false;

  return timingSafeEqual(expectedBuffer, providedBuffer);
}

/** Handshake de verificação (GET) exigido pela Meta ao configurar o webhook. */
export function verifyWebhookHandshake(mode: string | undefined, token: string | undefined): boolean {
  if (!whatsappConfigStatus.hasWebhookSecurity) return false;
  return mode === 'subscribe' && token === env.WHATSAPP_VERIFY_TOKEN;
}
