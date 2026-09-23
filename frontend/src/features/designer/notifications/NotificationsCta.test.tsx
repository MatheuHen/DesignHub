import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { getVapidPublicKeyMock, subscribePushMock, unsubscribePushMock } = vi.hoisted(() => ({
  getVapidPublicKeyMock: vi.fn(),
  subscribePushMock: vi.fn(),
  unsubscribePushMock: vi.fn(),
}));

vi.mock('./api', () => ({
  getVapidPublicKey: getVapidPublicKeyMock,
  subscribePush: subscribePushMock,
  unsubscribePush: unsubscribePushMock,
}));

const { NotificationsCta } = await import('./NotificationsCta');

function stubSupportedBrowser(options: {
  permission?: NotificationPermission;
  existingSubscription?: { endpoint: string; toJSON: () => unknown; unsubscribe: () => Promise<boolean> } | null;
}) {
  /**
   * Rodada correções (item 10.3): `PushSubscription.toJSON()` de um navegador
   * REAL sempre inclui `expirationTime` — o stub anterior o omitia, o que
   * escondia a rejeição 400 do backend em produção. O stub agora reproduz o
   * payload real da especificação Push API.
   */
  const subscribeMock = vi.fn().mockResolvedValue({
    endpoint: 'https://push.example/new',
    toJSON: () => ({
      endpoint: 'https://push.example/new',
      expirationTime: null,
      keys: { p256dh: 'p', auth: 'a' },
    }),
  });
  const pushManager = {
    getSubscription: vi.fn().mockResolvedValue(options.existingSubscription ?? null),
    subscribe: subscribeMock,
  };
  const registration = { pushManager };

  vi.stubGlobal('Notification', {
    permission: options.permission ?? 'default',
    requestPermission: vi.fn().mockResolvedValue(options.permission === 'denied' ? 'denied' : 'granted'),
  });
  vi.stubGlobal('navigator', {
    ...navigator,
    serviceWorker: {
      getRegistration: vi.fn().mockResolvedValue(registration),
      /**
       * Item 10.2: `register()` resolve antes da ativação do worker; só
       * `ready` garante um worker ativo. O stub distingue os dois para que o
       * componente seja obrigado a esperar `ready` antes de assinar.
       */
      register: vi.fn().mockResolvedValue({ pushManager: undefined }),
      ready: Promise.resolve(registration),
    },
  });
  vi.stubGlobal('PushManager', class {});

  return { subscribeMock, pushManager };
}

describe('NotificationsCta (item 9)', () => {
  beforeEach(() => {
    getVapidPublicKeyMock.mockReset();
    subscribePushMock.mockReset();
    unsubscribePushMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('não renderiza nada quando o navegador não suporta Web Push', async () => {
    const { container } = render(<NotificationsCta />);
    await Promise.resolve();
    expect(container).toBeEmptyDOMElement();
  });

  it('não renderiza nada quando o backend não tem as chaves VAPID configuradas', async () => {
    stubSupportedBrowser({});
    getVapidPublicKeyMock.mockResolvedValue(null);

    const { container } = render(<NotificationsCta />);
    await screen.findByText('', { selector: 'body' }).catch(() => undefined);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(container).toBeEmptyDOMElement();
  });

  it('mostra "Ativar notificações" quando suportado e ainda não há assinatura', async () => {
    stubSupportedBrowser({ existingSubscription: null });
    getVapidPublicKeyMock.mockResolvedValue('chave-publica-base64url');

    render(<NotificationsCta />);

    expect(await screen.findByRole('button', { name: 'Ativar notificações' })).toBeInTheDocument();
  });

  it('mostra "Desativar notificações" quando já existe uma assinatura ativa', async () => {
    stubSupportedBrowser({
      existingSubscription: { endpoint: 'https://push.example/existing', toJSON: () => ({}), unsubscribe: vi.fn() },
    });
    getVapidPublicKeyMock.mockResolvedValue('chave-publica-base64url');

    render(<NotificationsCta />);

    expect(await screen.findByRole('button', { name: 'Desativar notificações' })).toBeInTheDocument();
  });

  it('ao clicar em "Ativar notificações", pede permissão, assina e chama o backend', async () => {
    const { subscribeMock } = stubSupportedBrowser({ existingSubscription: null, permission: 'default' });
    getVapidPublicKeyMock.mockResolvedValue('chave-publica-base64url');
    subscribePushMock.mockResolvedValue(undefined);

    render(<NotificationsCta />);
    fireEvent.click(await screen.findByRole('button', { name: 'Ativar notificações' }));

    expect(await screen.findByRole('button', { name: 'Desativar notificações' })).toBeInTheDocument();
    expect(subscribeMock).toHaveBeenCalledOnce();
    expect(subscribePushMock).toHaveBeenCalledWith({ endpoint: 'https://push.example/new', keys: { p256dh: 'p', auth: 'a' } });
  });

  /**
   * Item 10.3: o backend valida o corpo com `.strict()`. Encaminhar o
   * `toJSON()` cru levava `expirationTime` junto e o servidor respondia 400,
   * que chegava ao designer como "não foi possível ativar as notificações".
   */
  it('não encaminha o expirationTime do navegador no corpo enviado ao backend', async () => {
    stubSupportedBrowser({ existingSubscription: null, permission: 'default' });
    getVapidPublicKeyMock.mockResolvedValue('chave-publica-base64url');
    subscribePushMock.mockResolvedValue(undefined);

    render(<NotificationsCta />);
    fireEvent.click(await screen.findByRole('button', { name: 'Ativar notificações' }));

    await screen.findByRole('button', { name: 'Desativar notificações' });
    expect(subscribePushMock.mock.calls[0]?.[0]).not.toHaveProperty('expirationTime');
  });

  /** Item 10.4: causas distintas precisam produzir mensagens distintas, nunca a frase genérica. */
  it('mostra mensagem específica quando a permissão é negada durante a ativação', async () => {
    stubSupportedBrowser({ existingSubscription: null, permission: 'default' });
    vi.stubGlobal('Notification', {
      permission: 'default',
      requestPermission: vi.fn().mockResolvedValue('denied'),
    });
    getVapidPublicKeyMock.mockResolvedValue('chave-publica-base64url');

    render(<NotificationsCta />);
    fireEvent.click(await screen.findByRole('button', { name: 'Ativar notificações' }));

    expect(
      await screen.findByText(/As notificações estão bloqueadas nas permissões do navegador/),
    ).toBeInTheDocument();
  });

  /**
   * Item 10.4: uma falha de rede ao buscar a chave VAPID deixava o estado em
   * `checking` para sempre — e o CTA sumia da tela sem erro visível.
   */
  it('mantém o botão disponível quando a checagem inicial falha por rede', async () => {
    stubSupportedBrowser({ existingSubscription: null });
    getVapidPublicKeyMock.mockRejectedValueOnce(new Error('network'));

    render(<NotificationsCta />);

    expect(await screen.findByRole('button', { name: 'Ativar notificações' })).toBeInTheDocument();
  });

  it('mostra aviso quando a permissão do navegador está bloqueada', async () => {
    stubSupportedBrowser({ permission: 'denied' });
    getVapidPublicKeyMock.mockResolvedValue('chave-publica-base64url');

    render(<NotificationsCta />);

    expect(
      await screen.findByText(/As notificações estão bloqueadas nas permissões do navegador/),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ativar notificações' })).not.toBeInTheDocument();
  });
});
