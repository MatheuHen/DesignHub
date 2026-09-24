import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '../../config/env.js';

/**
 * RF014/ADR 0005: os callbacks Deauthorize e Data Deletion Request que a
 * Meta chama neste App usam o mesmo formato `signed_request` do Facebook
 * Login — `<assinatura_base64url>.<payload_base64url>`, HMAC-SHA256 do
 * payload usando o App Secret. Mesma garantia de segurança do webhook do
 * WhatsApp (`webhookSignature.ts`): a requisição nunca é processada sem essa
 * verificação passar, e a comparação usa `timingSafeEqual`.
 */
interface InstagramSignedRequestPayload {
  algorithm: string;
  user_id?: string;
  [key: string]: unknown;
}

function base64UrlDecode(input: string): Buffer | null {
  // `signed_request` usa base64url sem padding — Buffer.from tolera a
  // ausência de padding nesse alfabeto.
  if (!/^[A-Za-z0-9_-]+$/.test(input)) return null;
  try {
    return Buffer.from(input, 'base64url');
  } catch {
    return null;
  }
}

/**
 * Verifica e decodifica um `signed_request` recebido em `deauthorize`/
 * `data-deletion`. Retorna `null` em qualquer falha (formato, algoritmo,
 * assinatura) — nunca lança, para que a rota sempre responda de forma
 * previsível sem vazar detalhe técnico (seção 12.6).
 */
export function verifyInstagramSignedRequest(signedRequest: string): InstagramSignedRequestPayload | null {
  if (!env.INSTAGRAM_APP_SECRET) return null;
  if (typeof signedRequest !== 'string' || signedRequest.length === 0 || signedRequest.length > 4096) return null;

  const parts = signedRequest.split('.');
  if (parts.length !== 2) return null;
  const [encodedSignature, encodedPayload] = parts;
  if (!encodedSignature || !encodedPayload) return null;

  const providedSignature = base64UrlDecode(encodedSignature);
  const payloadBuffer = base64UrlDecode(encodedPayload);
  if (!providedSignature || !payloadBuffer) return null;

  const expectedSignature = createHmac('sha256', env.INSTAGRAM_APP_SECRET)
    .update(encodedPayload)
    .digest();
  if (expectedSignature.length !== providedSignature.length) return null;
  if (!timingSafeEqual(expectedSignature, providedSignature)) return null;

  let payload: unknown;
  try {
    payload = JSON.parse(payloadBuffer.toString('utf8'));
  } catch {
    return null;
  }
  if (typeof payload !== 'object' || payload === null) return null;
  const candidate = payload as InstagramSignedRequestPayload;
  if (typeof candidate.algorithm !== 'string' || candidate.algorithm.toUpperCase() !== 'HMAC-SHA256') return null;

  return candidate;
}
