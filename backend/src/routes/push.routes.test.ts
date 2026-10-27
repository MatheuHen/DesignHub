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

const {
  subscribePushMock,
  unsubscribePushMock,
  enviarPushDeTesteMock,
  contarDispositivosInscritosMock,
} = vi.hoisted(() => ({
  subscribePushMock: vi.fn(),
  unsubscribePushMock: vi.fn(),
  enviarPushDeTesteMock: vi.fn(),
  contarDispositivosInscritosMock: vi.fn(),
}));

vi.mock('../services/pushSubscription.service.js', () => ({
  subscribePush: subscribePushMock,
  unsubscribePush: unsubscribePushMock,
  enviarPushDeTeste: enviarPushDeTesteMock,
  contarDispositivosInscritos: contarDispositivosInscritosMock,
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

describe('POST /api/push/teste e GET /api/push/status', () => {
  beforeEach(() => {
    getUserMock.mockReset();
    maybeSingleMock.mockReset();
    enviarPushDeTesteMock.mockReset();
    contarDispositivosInscritosMock.mockReset();
  });

  it('POST /teste exige autenticação', async () => {
    const response = await request(createApp())
      .post('/api/push/teste')
      .send({ endpoint: 'https://push.example/a' });

    expect(response.status).toBe(401);
    expect(enviarPushDeTesteMock).not.toHaveBeenCalled();
  });

  it('POST /teste é exclusivo do designer — administrador recebe 403', async () => {
    mockAuthenticatedUser('administrador');

    const response = await request(createApp())
      .post('/api/push/teste')
      .set('Authorization', 'Bearer token-admin')
      .send({ endpoint: 'https://push.example/a' });

    expect(response.status).toBe(403);
    expect(enviarPushDeTesteMock).not.toHaveBeenCalled();
  });

  it('POST /teste delega ao service usando o caller autenticado', async () => {
    mockAuthenticatedUser('designer');
    enviarPushDeTesteMock.mockResolvedValue(true);

    const response = await request(createApp())
      .post('/api/push/teste')
      .set('Authorization', 'Bearer token-designer')
      .send({ endpoint: 'https://push.example/a' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ entregue: true });
    expect(enviarPushDeTesteMock).toHaveBeenCalledWith('designer-1', 'https://push.example/a');
  });

  it('POST /teste rejeita campo desconhecido no corpo (mass assignment)', async () => {
    mockAuthenticatedUser('designer');

    const response = await request(createApp())
      .post('/api/push/teste')
      .set('Authorization', 'Bearer token-designer')
      .send({ endpoint: 'https://push.example/a', idUsuario: 'outro-designer' });

    expect(response.status).toBe(400);
    expect(enviarPushDeTesteMock).not.toHaveBeenCalled();
  });

  it('POST /teste devolve entregue=false quando a assinatura expirou', async () => {
    mockAuthenticatedUser('designer');
    enviarPushDeTesteMock.mockResolvedValue(false);

    const response = await request(createApp())
      .post('/api/push/teste')
      .set('Authorization', 'Bearer token-designer')
      .send({ endpoint: 'https://push.example/a' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ entregue: false });
  });

  it('GET /status devolve a contagem de dispositivos do próprio designer', async () => {
    mockAuthenticatedUser('designer');
    contarDispositivosInscritosMock.mockResolvedValue(2);

    const response = await request(createApp())
      .get('/api/push/status')
      .set('Authorization', 'Bearer token-designer');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ dispositivos: 2 });
    expect(contarDispositivosInscritosMock).toHaveBeenCalledWith('designer-1');
  });

  it('GET /status exige autenticação', async () => {
    const response = await request(createApp()).get('/api/push/status');

    expect(response.status).toBe(401);
    expect(contarDispositivosInscritosMock).not.toHaveBeenCalled();
  });
});
