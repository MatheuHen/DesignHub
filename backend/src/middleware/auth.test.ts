import type { Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getUserMock = vi.fn();
const maybeSingleMock = vi.fn();

vi.mock('../config/supabase.js', () => ({
  getSupabasePublicClient: () => ({
    auth: { getUser: getUserMock },
  }),
  getSupabaseUserClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: maybeSingleMock,
        }),
      }),
    }),
  }),
}));

const { attachProfile, requireAuth, requireProfile } = await import('./auth.js');

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

function createMockRequest(overrides: Record<string, unknown> = {}): Request {
  return {
    header: () => undefined,
    ...overrides,
  } as unknown as Request;
}

describe('requireAuth', () => {
  beforeEach(() => {
    getUserMock.mockReset();
  });

  it('rejeita quando não há header Authorization', async () => {
    const request = createMockRequest();
    const response = createMockResponse();
    const next = vi.fn();

    await requireAuth(request, response, next);

    expect((response as unknown as { statusCode: number }).statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('rejeita header sem esquema Bearer', async () => {
    const request = createMockRequest({ header: () => 'Token abc123' });
    const response = createMockResponse();
    const next = vi.fn();

    await requireAuth(request, response, next);

    expect((response as unknown as { statusCode: number }).statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('rejeita quando o Supabase Auth retorna erro', async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: { message: 'invalid' } });
    const request = createMockRequest({ header: () => 'Bearer token-invalido' });
    const response = createMockResponse();
    const next = vi.fn();

    await requireAuth(request, response, next);

    expect((response as unknown as { statusCode: number }).statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('autentica e popula request.auth com token válido', async () => {
    getUserMock.mockResolvedValue({
      data: { user: { id: 'user-1', email: 'designer@exemplo.com' } },
      error: null,
    });
    const request = createMockRequest({ header: () => 'Bearer token-valido' });
    const response = createMockResponse();
    const next = vi.fn();

    await requireAuth(request, response, next);

    expect(next).toHaveBeenCalledOnce();
    expect(request.auth).toEqual({
      userId: 'user-1',
      email: 'designer@exemplo.com',
      accessToken: 'token-valido',
    });
  });
});

describe('attachProfile', () => {
  beforeEach(() => {
    maybeSingleMock.mockReset();
  });

  it('rejeita quando request.auth não foi definido', async () => {
    const request = createMockRequest();
    const response = createMockResponse();
    const next = vi.fn();

    await attachProfile(request, response, next);

    expect((response as unknown as { statusCode: number }).statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('retorna 403 PROFILE_NOT_FOUND quando não há linha em usuario', async () => {
    maybeSingleMock.mockResolvedValue({ data: null, error: null });
    const request = createMockRequest({
      auth: { userId: 'user-1', email: 'x@x.com', accessToken: 'tok' },
    });
    const response = createMockResponse();
    const next = vi.fn();

    await attachProfile(request, response, next);

    const body = (response as unknown as { body: { error: string } }).body;
    expect((response as unknown as { statusCode: number }).statusCode).toBe(403);
    expect(body.error).toBe('PROFILE_NOT_FOUND');
    expect(next).not.toHaveBeenCalled();
  });

  it('retorna 403 PROFILE_INACTIVE quando usuário está inativo', async () => {
    maybeSingleMock.mockResolvedValue({
      data: {
        perfil: 'designer',
        status: 'inativo',
        nome_completo: 'Designer Teste',
        email: 'designer@exemplo.com',
      },
      error: null,
    });
    const request = createMockRequest({
      auth: { userId: 'user-1', email: 'designer@exemplo.com', accessToken: 'tok' },
    });
    const response = createMockResponse();
    const next = vi.fn();

    await attachProfile(request, response, next);

    const body = (response as unknown as { body: { error: string } }).body;
    expect((response as unknown as { statusCode: number }).statusCode).toBe(403);
    expect(body.error).toBe('PROFILE_INACTIVE');
    expect(next).not.toHaveBeenCalled();
  });

  it('popula request.profile quando usuário ativo é encontrado', async () => {
    maybeSingleMock.mockResolvedValue({
      data: {
        perfil: 'administrador',
        status: 'ativo',
        nome_completo: 'Admin Teste',
        email: 'admin@exemplo.adm',
      },
      error: null,
    });
    const request = createMockRequest({
      auth: { userId: 'user-2', email: 'admin@exemplo.adm', accessToken: 'tok' },
    });
    const response = createMockResponse();
    const next = vi.fn();

    await attachProfile(request, response, next);

    expect(next).toHaveBeenCalledOnce();
    expect(request.profile).toEqual({
      perfil: 'administrador',
      status: 'ativo',
      nomeCompleto: 'Admin Teste',
      email: 'admin@exemplo.adm',
    });
  });
});

describe('requireProfile', () => {
  it('bloqueia perfil não autorizado (autorização negativa)', () => {
    const request = createMockRequest({
      profile: { perfil: 'designer', status: 'ativo', nomeCompleto: 'D', email: 'd@x.com' },
    });
    const response = createMockResponse();
    const next = vi.fn();

    requireProfile('administrador')(request, response, next);

    expect((response as unknown as { statusCode: number }).statusCode).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('permite perfil autorizado', () => {
    const request = createMockRequest({
      profile: { perfil: 'administrador', status: 'ativo', nomeCompleto: 'A', email: 'a@x.com' },
    });
    const response = createMockResponse();
    const next = vi.fn();

    requireProfile('administrador')(request, response, next);

    expect(next).toHaveBeenCalledOnce();
  });
});
