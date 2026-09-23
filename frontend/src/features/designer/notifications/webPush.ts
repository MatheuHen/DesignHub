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

export function isWebPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}
