// DesignHub — item 9 (rodada correções): Service Worker mínimo, só para
// Web Push. Não faz cache de rotas/assets (fora de escopo desta rodada) —
// existe só para receber o evento `push` do navegador e mostrar a
// notificação nativa, e para focar/abrir a aba do DesignHub ao clicar nela.

/**
 * Sem `skipWaiting`, um Service Worker novo ficava em `waiting` enquanto
 * houvesse qualquer aba do DesignHub aberta — e só assumia depois de TODAS
 * serem fechadas. Na prática, o designer continuava com a versão antiga do
 * worker por tempo indeterminado, mesmo depois de atualizar a página.
 * `skipWaiting` + `clients.claim` fazem a versão nova assumir no próximo
 * carregamento. É seguro aqui porque este worker não faz cache: não existe
 * estado versionado que possa divergir entre páginas controladas.
 */
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

/** Opções comuns das notificações do DesignHub (Windows e Android). */
function buildNotificationOptions(payload) {
  const url = payload.url || '/';
  return {
    body: payload.body || '',
    icon: '/favicon.svg',
    // Badge: ícone monocromático da barra de status no Android.
    badge: '/favicon.svg',
    data: { url },
    /**
     * `tag` por destino + `renotify`: se dois avisos da MESMA solicitação
     * chegarem (ex.: reentrega do serviço de push), o segundo SUBSTITUI o
     * primeiro na central em vez de empilhar duas linhas iguais. Avisos de
     * solicitações diferentes continuam aparecendo separadamente, porque a
     * tag inclui a URL de destino.
     */
    tag: `designhub:${url}`,
    renotify: true,
    timestamp: Date.now(),
  };
}

self.addEventListener('push', (event) => {
  /**
   * A assinatura é criada com `userVisibleOnly: true`, então TODO push
   * precisa resultar numa notificação visível. Antes, um push sem payload
   * (`return` na primeira linha) ou com corpo não-JSON (`catch { return }`)
   * era descartado em silêncio: o navegador acordava o worker, nada era
   * exibido e o designer concluía que "a notificação não chegou", sem
   * nenhum rastro. Agora qualquer push exibe algo — na pior hipótese, um
   * aviso genérico que leva ao Dashboard.
   */
  let payload = {};
  if (event.data) {
    try {
      payload = event.data.json();
    } catch {
      // Payload não-JSON: aproveita o texto cru como corpo, em vez de sumir.
      let texto = '';
      try {
        texto = event.data.text();
      } catch {
        texto = '';
      }
      payload = { body: texto };
    }
  }

  const title = payload.title || 'DesignHub';
  if (!payload.body) {
    payload.body = 'Você tem uma novidade no DesignHub.';
  }
  if (!payload.url) {
    payload.url = '/designer';
  }

  event.waitUntil(self.registration.showNotification(title, buildNotificationOptions(payload)));
});

/**
 * Confirmação LOCAL de ativação/desativação, pedida pela página via
 * `postMessage`. Não depende de ida e volta ao serviço de push: comprova
 * que este dispositivo consegue EXIBIR notificações (permissão do
 * navegador e do sistema operacional em ordem).
 *
 * Importante para diagnóstico: ver esta notificação prova só a exibição
 * local — a entrega remota dos eventos do backend é um caminho separado.
 */
self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || data.type !== 'designhub:notificacao-local') return;

  const payload = {
    title: data.title || 'DesignHub',
    body: data.body || '',
    url: data.url || '/designer',
  };

  event.waitUntil(self.registration.showNotification(payload.title, buildNotificationOptions(payload)));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data && event.notification.data.url ? event.notification.data.url : '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      return self.clients.openWindow(targetUrl);
    }),
  );
});
