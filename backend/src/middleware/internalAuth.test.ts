import type { Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { envMock, internalJobConfigStatusMock } = vi.hoisted(() => ({
  envMock: { INTERNAL_JOB_SECRET: 'segredo-de-teste-com-64-bytes-de-comprimento-para-o-timing-safe' },
  internalJobConfigStatusMock: { hasSecret: true },
}));

vi.mock('../config/env.js', () => ({
  env: envMock,
  internalJobConfigStatus: internalJobConfigStatusMock,
}));

const { requireInternalJobSecret } = await import('./internalAuth.js');

function createMockResponse() {
  const response = {
    statusCode: 0,
    body: undefined as unknown,
    status(code: number) {
      response.statusCode = code;
      return response;
    },
    json(payload: unknown) {
      response.body = payload;
      return response;
    },
  };
  return response as unknown as Response;
}

function createMockRequest(headerValue: string | undefined): Request {
  return { header: () => headerValue } as unknown as Request;
}

describe('requireInternalJobSecret (RF014/seção 11)', () => {
  beforeEach(() => {
    internalJobConfigStatusMock.hasSecret = true;
    envMock.INTERNAL_JOB_SECRET = 'segredo-de-teste-com-64-bytes-de-comprimento-para-o-timing-safe';
  });

  it('retorna 503 (fail-closed) quando INTERNAL_JOB_SECRET não está configurado', () => {
    internalJobConfigStatusMock.hasSecret = false;
    const request = createMockRequest('qualquer-valor');
    const response = createMockResponse();
    const next = vi.fn();

    requireInternalJobSecret(request, response, next);

    expect((response as unknown as { statusCode: number }).statusCode).toBe(503);
    expect(next).not.toHaveBeenCalled();
  });

  it('retorna 401 quando o header do segredo está ausente', () => {
    const request = createMockRequest(undefined);
    const response = createMockResponse();
    const next = vi.fn();

    requireInternalJobSecret(request, response, next);

    expect((response as unknown as { statusCode: number }).statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('retorna 401 quando o segredo enviado não confere', () => {
    const request = createMockRequest('segredo-errado');
    const response = createMockResponse();
    const next = vi.fn();

    requireInternalJobSecret(request, response, next);

    expect((response as unknown as { statusCode: number }).statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('chama next() quando o segredo confere', () => {
    const request = createMockRequest(envMock.INTERNAL_JOB_SECRET);
    const response = createMockResponse();
    const next = vi.fn();

    requireInternalJobSecret(request, response, next);

    expect(next).toHaveBeenCalledOnce();
  });
});
