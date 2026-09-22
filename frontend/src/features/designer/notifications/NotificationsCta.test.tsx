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
  const subscribeMock = vi.fn().mockResolvedValue({
    endpoint: 'https://push.example/new',
    toJSON: () => ({ endpoint: 'https://push.example/new', keys: { p256dh: 'p', auth: 'a' } }),
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
      register: vi.fn().mockResolvedValue(registration),
    },
  });
  vi.stubGlobal('PushManager', class {});

  return { subscribeMock };
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
