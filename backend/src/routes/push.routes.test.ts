import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getUserMock, maybeSingleMock } = vi.hoisted(() => ({
  getUserMock: vi.fn(),
  maybeSingleMock: vi.fn(),
}));

vi.mock('../config/supabase.js', () => ({
  getSupabasePublicClient: () => ({ auth: { getUser: getUserMock } }),
  getSupabaseUserClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: maybeSingleMock }),
      }),
    }),
  }),
}));

const { subscribePushMock, unsubscribePushMock } = vi.hoisted(() => ({
  subscribePushMock: vi.fn(),
  unsubscribePushMock: vi.fn(),
}));

vi.mock('../services/pushSubscription.service.js', () => ({
  subscribePush: subscribePushMock,
  unsubscribePush: unsubscribePushMock,
}));

const { webPushConfigStatusMock } = vi.hoisted(() => ({
  webPushConfigStatusMock: { hasVapidKeys: true },
}));

vi.mock('../config/env.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../config/env.js')>();
  return {
    ...actual,
    env: { ...actual.env, WEB_PUSH_VAPID_PUBLIC_KEY: 'chave-publica-de-teste' },
    webPushConfigStatus: webPushConfigStatusMock,
  };
});

const { createApp } = await import('../app.js');

function mockAuthenticatedUser(perfil: 'designer' | 'administrador') {
  getUserMock.mockResolvedValue({ data: { user: { id: 'designer-1', email: 'designer@exemplo.com' } }, error: null });
  maybeSingleMock.mockResolvedValue({
    data: { perfil, status: 'ativo', nome_completo: 'Designer Teste', email: 'designer@exemplo.com' },
    error: null,
  });
}

const VALID_SUBSCRIPTION = {
  endpoint: 'https://push.example/subscription-1',
  keys: { p256dh: 'valor-p256dh', auth: 'valor-auth' },
};

describe('rotas /api/push (item 9)', () => {
  beforeEach(() => {
    getUserMock.mockReset();
    maybeSingleMock.mockReset();
    subscribePushMock.mockReset();
    unsubscribePushMock.mockReset();
    webPushConfigStatusMock.hasVapidKeys = true;
  });

  it('GET /vapid-public-key retorna a chave pública sem autenticação', async () => {
    const response = await request(createApp()).get('/api/push/vapid-public-key');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ publicKey: 'chave-publica-de-teste' });
  });

  it('GET /vapid-public-key retorna 404 quando o Web Push não está configurado', async () => {
    webPushConfigStatusMock.hasVapidKeys = false;

    const response = await request(createApp()).get('/api/push/vapid-public-key');

    expect(response.status).toBe(404);
  });

  it('POST /subscribe rejeita sem autenticação', async () => {
    const response = await request(createApp()).post('/api/push/subscribe').send(VALID_SUBSCRIPTION);

    expect(response.status).toBe(401);
    expect(subscribePushMock).not.toHaveBeenCalled();
  });

  it('POST /subscribe rejeita perfil administrador (só designer usa o dashboard com esse aviso)', async () => {
    mockAuthenticatedUser('administrador');

    const response = await request(createApp())
      .post('/api/push/subscribe')
      .set('Authorization', 'Bearer token-valido')
      .send(VALID_SUBSCRIPTION);

    expect(response.status).toBe(403);
    expect(subscribePushMock).not.toHaveBeenCalled();
  });

  it('POST /subscribe salva a assinatura do designer autenticado', async () => {
    mockAuthenticatedUser('designer');
    subscribePushMock.mockResolvedValue(undefined);

    const response = await request(createApp())
      .post('/api/push/subscribe')
      .set('Authorization', 'Bearer token-valido')
      .send(VALID_SUBSCRIPTION);

    expect(response.status).toBe(204);
    expect(subscribePushMock).toHaveBeenCalledWith('designer-1', VALID_SUBSCRIPTION);
  });

  it('POST /subscribe rejeita payload com campo desconhecido (mass assignment)', async () => {
    mockAuthenticatedUser('designer');

    const response = await request(createApp())
      .post('/api/push/subscribe')
      .set('Authorization', 'Bearer token-valido')
      .send({ ...VALID_SUBSCRIPTION, idUsuario: 'outro-designer' });

    expect(response.status).toBe(400);
    expect(subscribePushMock).not.toHaveBeenCalled();
  });

  it('POST /unsubscribe remove a assinatura do designer autenticado', async () => {
    mockAuthenticatedUser('designer');
    unsubscribePushMock.mockResolvedValue(undefined);

    const response = await request(createApp())
      .post('/api/push/unsubscribe')
      .set('Authorization', 'Bearer token-valido')
      .send({ endpoint: VALID_SUBSCRIPTION.endpoint });

    expect(response.status).toBe(204);
    expect(unsubscribePushMock).toHaveBeenCalledWith('designer-1', VALID_SUBSCRIPTION.endpoint);
  });
});
