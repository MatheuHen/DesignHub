/**
 * Item 9: converte a chave pública VAPID (base64url) para o formato exigido
 * por `pushManager.subscribe`. Retorno anotado como `Uint8Array<ArrayBuffer>`
 * (não o `Uint8Array<ArrayBufferLike>` genérico) porque `new
 * Uint8Array(length)` sempre aloca sobre `ArrayBuffer` — `lib.dom.d.ts`
 * exige especificamente esse tipo para `applicationServerKey`.
 */
export function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  // Rodada correções (item 10.2): espaço/quebra de linha acidental no valor
  // configurado desalinha o cálculo de padding (`length % 4`) e faz `atob`
  // lançar `InvalidCharacterError` — o que virava "navegador não suportado".
  const normalized = base64String.trim();
  const padding = '='.repeat((4 - (normalized.length % 4)) % 4);
  const base64 = (normalized + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/**
 * Pede ao Service Worker que exiba uma notificação LOCAL de confirmação
 * (ativação/desativação). Não passa pelo serviço de push: serve para o
 * designer ver, na hora, que este dispositivo realmente consegue exibir
 * notificações — permissão do navegador e do sistema operacional em ordem.
 *
 * Diagnóstico importante: ver esta notificação comprova apenas a exibição
 * local. A entrega remota dos eventos do backend é um caminho separado.
 *
 * Melhor esforço: uma falha aqui nunca pode desfazer a ativação já
 * concluída no servidor.
 */
export async function mostrarNotificacaoLocal(
  registration: ServiceWorkerRegistration,
  payload: { title: string; body: string; url?: string },
): Promise<void> {
  try {
    if (registration.active) {
      registration.active.postMessage({ type: 'designhub:notificacao-local', ...payload });
      return;
    }
    // Sem worker ativo (janela entre registro e ativação), a própria
    // registration consegue exibir — mesmo resultado para o usuário.
    await registration.showNotification(payload.title, {
      body: payload.body,
      icon: '/favicon.svg',
      badge: '/favicon.svg',
      data: { url: payload.url ?? '/designer' },
      tag: `designhub:${payload.url ?? '/designer'}`,
    });
  } catch {
    // Silencioso de propósito: é confirmação visual, não parte do contrato.
  }
}

export function isWebPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}
