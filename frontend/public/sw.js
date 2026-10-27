// DesignHub — item 9 (rodada correções): Service Worker mínimo, só para
// Web Push. Não faz cache de rotas/assets (fora de escopo desta rodada) —
// existe só para receber o evento `push` do navegador e mostrar a
// notificação nativa, e para focar/abrir a aba do DesignHub ao clicar nela.

self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    return;
  }

  const title = payload.title || 'DesignHub';
  const url = payload.url || '/';

  event.waitUntil(
    self.registration.showNotification(title, {
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
      /** Mantém o aviso na central até o designer interagir (Windows/Android). */
      requireInteraction: true,
      timestamp: Date.now(),
    }),
  );
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
