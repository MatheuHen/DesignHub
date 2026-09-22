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
  event.waitUntil(
    self.registration.showNotification(title, {
      body: payload.body || '',
      icon: '/favicon.svg',
      data: { url: payload.url || '/' },
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
