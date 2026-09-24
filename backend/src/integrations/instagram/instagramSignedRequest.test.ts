import { createHmac } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { envMock } = vi.hoisted(() => ({
  envMock: { INSTAGRAM_APP_SECRET: 'app-secret-de-teste' },
}));
vi.mock('../../config/env.js', () => ({ env: envMock }));

/** Mesmo padrão do teste de serviço: cast só no ponto de mutação, para simular env ausente sem alterar o tipo declarado. */
function setAppSecret(value: string | undefined): void {
  (envMock as { INSTAGRAM_APP_SECRET: string | undefined }).INSTAGRAM_APP_SECRET = value;
}

const { verifyInstagramSignedRequest } = await import('./instagramSignedRequest.js');

function base64Url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url');
}

function buildSignedRequest(payload: object, secret = 'app-secret-de-teste'): string {
  const encodedPayload = base64Url(JSON.stringify(payload));
  const signature = createHmac('sha256', secret).update(encodedPayload).digest();
  return `${base64Url(signature)}.${encodedPayload}`;
}

describe('verifyInstagramSignedRequest (Deauthorize/Data Deletion — Meta signed_request)', () => {
  beforeEach(() => {
    setAppSecret('app-secret-de-teste');
  });

  it('aceita um signed_request válido e devolve o payload', () => {
    const signed = buildSignedRequest({ algorithm: 'HMAC-SHA256', user_id: 'ig-user-1', issued_at: 123 });

    expect(verifyInstagramSignedRequest(signed)).toEqual({
      algorithm: 'HMAC-SHA256',
      user_id: 'ig-user-1',
      issued_at: 123,
    });
  });

  it('rejeita quando a assinatura não bate (adulterada)', () => {
    const [, payload] = buildSignedRequest({ algorithm: 'HMAC-SHA256', user_id: 'ig-user-1' }).split('.');
    const forjado = `${base64Url('assinatura-forjada-qualquer')}.${payload}`;

    expect(verifyInstagramSignedRequest(forjado)).toBeNull();
  });

  it('rejeita quando assinada com um App Secret diferente', () => {
    const signed = buildSignedRequest({ algorithm: 'HMAC-SHA256', user_id: 'ig-user-1' }, 'outro-secret');

    expect(verifyInstagramSignedRequest(signed)).toBeNull();
  });

  it('rejeita algoritmo diferente de HMAC-SHA256', () => {
    const signed = buildSignedRequest({ algorithm: 'none', user_id: 'ig-user-1' });

    expect(verifyInstagramSignedRequest(signed)).toBeNull();
  });

  it('rejeita formato sem o separador "."', () => {
    expect(verifyInstagramSignedRequest('sem-ponto-nenhum')).toBeNull();
  });

  it('rejeita payload que não é JSON válido', () => {
    const badPayload = base64Url('isto-nao-e-json');
    const signature = createHmac('sha256', 'app-secret-de-teste').update(badPayload).digest();
    expect(verifyInstagramSignedRequest(`${base64Url(signature)}.${badPayload}`)).toBeNull();
  });

  it('rejeita quando INSTAGRAM_APP_SECRET não está configurado (fail-closed)', () => {
    setAppSecret(undefined);
    const signed = buildSignedRequest({ algorithm: 'HMAC-SHA256', user_id: 'ig-user-1' });

    expect(verifyInstagramSignedRequest(signed)).toBeNull();
  });

  it('rejeita string vazia ou absurdamente longa', () => {
    expect(verifyInstagramSignedRequest('')).toBeNull();
    expect(verifyInstagramSignedRequest('a'.repeat(5000))).toBeNull();
  });
});
