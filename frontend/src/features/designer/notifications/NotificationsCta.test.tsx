import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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

const CHAVE_VALIDA = 'chave-publica-base64url';

/** Bytes que `urlBase64ToUint8Array(CHAVE_VALIDA)` produz — usados para simular a MESMA chave do servidor. */
function bytesDaChaveAtual(): Uint8Array {
  const normalized = CHAVE_VALIDA.trim();
  const padding = '='.repeat((4 - (normalized.length % 4)) % 4);
  const base64 = (normalized + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

interface SubscriptionStub {
  endpoint: string;
  options?: { applicationServerKey?: ArrayBuffer | null };
  toJSON: () => unknown;
  unsubscribe: () => Promise<boolean>;
}

function criarAssinatura(
  endpoint = 'https://push.example/atual',
  applicationServerKey: ArrayBuffer | null = bytesDaChaveAtual().buffer as ArrayBuffer,
): SubscriptionStub {
  return {
    endpoint,
    options: { applicationServerKey },
    toJSON: () => ({ endpoint, expirationTime: null, keys: { p256dh: 'p', auth: 'a' } }),
    unsubscribe: vi.fn().mockResolvedValue(true),
  };
}

function stubSupportedBrowser(options: {
  permission?: NotificationPermission;
  existingSubscription?: SubscriptionStub | null;
  /** Assinatura vista só por `ready` (SW ainda não registrado na checagem inicial). */
  readySubscription?: SubscriptionStub | null;
  postMessage?: ReturnType<typeof vi.fn>;
}) {
  /**
   * Rodada correções (item 10.3): `PushSubscription.toJSON()` de um navegador
   * REAL sempre inclui `expirationTime` — o stub reproduz o payload real da
   * especificação Push API.
   */
  const subscribeMock = vi.fn().mockResolvedValue(criarAssinatura('https://push.example/new'));
  const postMessage = options.postMessage ?? vi.fn();

  const registrationInicial = {
    pushManager: {
      getSubscription: vi.fn().mockResolvedValue(options.existingSubscription ?? null),
      subscribe: subscribeMock,
    },
    active: { postMessage },
    showNotification: vi.fn().mockResolvedValue(undefined),
  };

  const registrationReady =
    options.readySubscription === undefined
      ? registrationInicial
      : {
          ...registrationInicial,
          pushManager: {
            getSubscription: vi.fn().mockResolvedValue(options.readySubscription),
            subscribe: subscribeMock,
          },
        };

  vi.stubGlobal('Notification', {
    permission: options.permission ?? 'default',
    requestPermission: vi.fn().mockResolvedValue(options.permission === 'denied' ? 'denied' : 'granted'),
  });
  vi.stubGlobal('navigator', {
    ...navigator,
    serviceWorker: {
      getRegistration: vi.fn().mockResolvedValue(registrationInicial),
      /**
       * Item 10.2: `register()` resolve antes da ativação do worker; só
       * `ready` garante um worker ativo.
       */
      register: vi.fn().mockResolvedValue({ pushManager: undefined }),
      ready: Promise.resolve(registrationReady),
    },
  });
  vi.stubGlobal('PushManager', class {});

  return { subscribeMock, postMessage, registrationInicial };
}

describe('NotificationsCta (item 9)', () => {
  beforeEach(() => {
    getVapidPublicKeyMock.mockReset().mockResolvedValue(CHAVE_VALIDA);
    subscribePushMock.mockReset().mockResolvedValue(undefined);
    unsubscribePushMock.mockReset().mockResolvedValue(undefined);
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
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(container).toBeEmptyDOMElement();
  });

  it('mostra "Ativar notificações" quando ainda não há assinatura', async () => {
    stubSupportedBrowser({ existingSubscription: null });

    render(<NotificationsCta />);

    expect(await screen.findByRole('button', { name: 'Ativar notificações' })).toBeInTheDocument();
  });

  /** Item 10.4: causas distintas precisam produzir mensagens distintas. */
  it('mostra mensagem específica quando a permissão é negada durante a ativação', async () => {
    stubSupportedBrowser({ existingSubscription: null, permission: 'default' });
    vi.stubGlobal('Notification', {
      permission: 'default',
      requestPermission: vi.fn().mockResolvedValue('denied'),
    });

    render(<NotificationsCta />);
    fireEvent.click(await screen.findByRole('button', { name: 'Ativar notificações' }));

    expect(await screen.findByText(/Notificações bloqueadas nas permissões/)).toBeInTheDocument();
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

  it('mostra aviso quando a permissão do navegador já está bloqueada', async () => {
    stubSupportedBrowser({ permission: 'denied' });

    render(<NotificationsCta />);

    expect(await screen.findByText(/Notificações bloqueadas nas permissões/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ativar notificações' })).not.toBeInTheDocument();
  });
});

describe('NotificationsCta — interface enxuta', () => {
  beforeEach(() => {
    getVapidPublicKeyMock.mockReset().mockResolvedValue(CHAVE_VALIDA);
    subscribePushMock.mockReset().mockResolvedValue(undefined);
    unsubscribePushMock.mockReset().mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('quando ativado, mostra só o status discreto e a ação de desativar', async () => {
    stubSupportedBrowser({ permission: 'granted', existingSubscription: criarAssinatura() });

    render(<NotificationsCta />);

    expect(await screen.findByText('✓ Notificações ativadas')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'desativar' })).toBeInTheDocument();
  });

  it('não existe mais botão de teste nem mensagem verde de teste enviado', async () => {
    stubSupportedBrowser({ permission: 'granted', existingSubscription: criarAssinatura() });

    render(<NotificationsCta />);
    await screen.findByText('✓ Notificações ativadas');

    expect(screen.queryByRole('button', { name: /teste/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/deve aparecer em instantes/i)).not.toBeInTheDocument();
  });
});

describe('NotificationsCta — ativação', () => {
  beforeEach(() => {
    getVapidPublicKeyMock.mockReset().mockResolvedValue(CHAVE_VALIDA);
    subscribePushMock.mockReset().mockResolvedValue(undefined);
    unsubscribePushMock.mockReset().mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('pede permissão, assina, vincula à conta e confirma com notificação local', async () => {
    const { subscribeMock, postMessage } = stubSupportedBrowser({
      existingSubscription: null,
      permission: 'default',
    });

    render(<NotificationsCta />);
    fireEvent.click(await screen.findByRole('button', { name: 'Ativar notificações' }));

    expect(await screen.findByText('✓ Notificações ativadas')).toBeInTheDocument();
    expect(subscribeMock).toHaveBeenCalledOnce();
    expect(subscribePushMock).toHaveBeenCalledWith({
      endpoint: 'https://push.example/new',
      keys: { p256dh: 'p', auth: 'a' },
    });
    // Confirmação local: não depende de ida e volta ao serviço de push.
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'designhub:notificacao-local',
        title: 'DesignHub — NOTIFICAÇÕES ATIVADAS',
      }),
    );
  });

  /**
   * Item 10.3: o backend valida o corpo com `.strict()`. Encaminhar o
   * `toJSON()` cru levava `expirationTime` junto e o servidor respondia 400.
   */
  it('não encaminha o expirationTime do navegador no corpo enviado ao backend', async () => {
    stubSupportedBrowser({ existingSubscription: null, permission: 'default' });

    render(<NotificationsCta />);
    fireEvent.click(await screen.findByRole('button', { name: 'Ativar notificações' }));

    await screen.findByText('✓ Notificações ativadas');
    expect(subscribePushMock.mock.calls[0]?.[0]).not.toHaveProperty('expirationTime');
  });

  it('NÃO dá a ativação por concluída quando o servidor recusa a vinculação', async () => {
    const { postMessage } = stubSupportedBrowser({
      existingSubscription: null,
      permission: 'default',
    });
    subscribePushMock.mockRejectedValue(new Error('falha ao vincular'));

    render(<NotificationsCta />);
    fireEvent.click(await screen.findByRole('button', { name: 'Ativar notificações' }));

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.queryByText('✓ Notificações ativadas')).not.toBeInTheDocument();
    // Nem confirma algo que não aconteceu.
    expect(postMessage).not.toHaveBeenCalled();
  });

  it('reaproveita a assinatura existente em vez de recriá-la (sem endpoint novo a cada clique)', async () => {
    // "Ativou uma vez, continua ativado": enquanto a chave do servidor for a
    // mesma, a assinatura do navegador é reaproveitada.
    const existente = criarAssinatura('https://push.example/ja-existente');
    const { subscribeMock } = stubSupportedBrowser({
      permission: 'default',
      existingSubscription: null,
      readySubscription: existente,
    });

    render(<NotificationsCta />);
    fireEvent.click(await screen.findByRole('button', { name: 'Ativar notificações' }));

    await screen.findByText('✓ Notificações ativadas');
    expect(subscribeMock).not.toHaveBeenCalled();
    expect(existente.unsubscribe).not.toHaveBeenCalled();
    expect(unsubscribePushMock).not.toHaveBeenCalled();
    expect(subscribePushMock).toHaveBeenCalledWith(
      expect.objectContaining({ endpoint: 'https://push.example/ja-existente' }),
    );
  });

  it('refaz a assinatura quando ela foi criada com OUTRA chave VAPID, limpando a antiga no backend', async () => {
    const chaveAntiga = new Uint8Array([9, 9, 9]).buffer;
    const antiga = criarAssinatura('https://push.example/antiga', chaveAntiga);
    const { subscribeMock } = stubSupportedBrowser({
      permission: 'default',
      existingSubscription: null,
      readySubscription: antiga,
    });

    render(<NotificationsCta />);
    fireEvent.click(await screen.findByRole('button', { name: 'Ativar notificações' }));

    await screen.findByText('✓ Notificações ativadas');
    expect(unsubscribePushMock).toHaveBeenCalledWith('https://push.example/antiga');
    expect(antiga.unsubscribe).toHaveBeenCalled();
    expect(subscribeMock).toHaveBeenCalledOnce();
  });
});

describe('NotificationsCta — persistência e desativação', () => {
  beforeEach(() => {
    getVapidPublicKeyMock.mockReset().mockResolvedValue(CHAVE_VALIDA);
    subscribePushMock.mockReset().mockResolvedValue(undefined);
    unsubscribePushMock.mockReset().mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reconhece a assinatura existente ao carregar e a ressincroniza com o backend', async () => {
    // Recupera sozinho o caso em que o navegador manteve a inscrição mas o
    // registro do servidor se perdeu — sem o designer precisar clicar.
    stubSupportedBrowser({
      permission: 'granted',
      existingSubscription: criarAssinatura('https://push.example/persistida'),
    });

    render(<NotificationsCta />);

    expect(await screen.findByText('✓ Notificações ativadas')).toBeInTheDocument();
    await waitFor(() =>
      expect(subscribePushMock).toHaveBeenCalledWith(
        expect.objectContaining({ endpoint: 'https://push.example/persistida' }),
      ),
    );
    // Nenhuma assinatura nova é criada só por abrir a página.
    expect(screen.queryByRole('button', { name: 'Ativar notificações' })).not.toBeInTheDocument();
  });

  it('falha ao ressincronizar não desativa nem polui a tela', async () => {
    stubSupportedBrowser({ permission: 'granted', existingSubscription: criarAssinatura() });
    subscribePushMock.mockRejectedValue(new Error('rede'));

    render(<NotificationsCta />);

    expect(await screen.findByText('✓ Notificações ativadas')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('desativa no backend e no navegador e confirma com notificação local', async () => {
    const assinatura = criarAssinatura('https://push.example/para-remover');
    const { postMessage } = stubSupportedBrowser({
      permission: 'granted',
      existingSubscription: assinatura,
    });

    render(<NotificationsCta />);
    fireEvent.click(await screen.findByRole('button', { name: 'desativar' }));

    expect(await screen.findByRole('button', { name: 'Ativar notificações' })).toBeInTheDocument();
    expect(unsubscribePushMock).toHaveBeenCalledWith('https://push.example/para-remover');
    expect(assinatura.unsubscribe).toHaveBeenCalled();
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'designhub:notificacao-local',
        title: 'DesignHub — NOTIFICAÇÕES DESATIVADAS',
      }),
    );
  });

  it('falha parcial NÃO informa desativação concluída (assinatura ainda ativa)', async () => {
    stubSupportedBrowser({ permission: 'granted', existingSubscription: criarAssinatura() });
    unsubscribePushMock.mockRejectedValue(new Error('servidor fora'));

    render(<NotificationsCta />);
    fireEvent.click(await screen.findByRole('button', { name: 'desativar' }));

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    // Continua mostrando "ativadas": seria falso dizer que desativou.
    expect(screen.getByText('✓ Notificações ativadas')).toBeInTheDocument();
  });
});
