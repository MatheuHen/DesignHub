import { useEffect, useState } from 'react';
import { getVapidPublicKey, subscribePush, unsubscribePush, type PushSubscriptionJson } from './api';
import { isWebPushSupported, urlBase64ToUint8Array } from './webPush';

type Status = 'checking' | 'unsupported' | 'unconfigured' | 'denied' | 'inactive' | 'active';

/**
 * Item 9 (requisito explícito): CTA "Ativar notificações" — nunca pede
 * permissão automaticamente no carregamento da página. O designer decide
 * clicando. Degrada normalmente (esconde-se) quando o navegador não
 * suporta Web Push ou quando o backend não tem as chaves VAPID
 * configuradas — o resto do Dashboard continua funcionando.
 */
export function NotificationsCta() {
  const [status, setStatus] = useState<Status>('checking');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function check() {
      if (!isWebPushSupported()) {
        if (!cancelled) setStatus('unsupported');
        return;
      }
      if (Notification.permission === 'denied') {
        if (!cancelled) setStatus('denied');
        return;
      }

      const publicKey = await getVapidPublicKey();
      if (cancelled) return;
      if (!publicKey) {
        setStatus('unconfigured');
        return;
      }

      const registration = await navigator.serviceWorker.getRegistration('/sw.js');
      const existing = await registration?.pushManager.getSubscription();
      if (!cancelled) setStatus(existing ? 'active' : 'inactive');
    }

    void check();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleAtivar() {
    setBusy(true);
    setError(null);
    try {
      const publicKey = await getVapidPublicKey();
      if (!publicKey) {
        setStatus('unconfigured');
        return;
      }

      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setStatus('denied');
        return;
      }

      const registration = await navigator.serviceWorker.register('/sw.js');
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });

      await subscribePush(subscription.toJSON() as PushSubscriptionJson);
      setStatus('active');
    } catch {
      setError('Não foi possível ativar as notificações neste navegador.');
    } finally {
      setBusy(false);
    }
  }

  async function handleDesativar() {
    setBusy(true);
    setError(null);
    try {
      const registration = await navigator.serviceWorker.getRegistration('/sw.js');
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        await unsubscribePush(subscription.endpoint);
        await subscription.unsubscribe();
      }
      setStatus('inactive');
    } catch {
      setError('Não foi possível desativar as notificações.');
    } finally {
      setBusy(false);
    }
  }

  if (status === 'checking' || status === 'unsupported' || status === 'unconfigured') return null;

  return (
    <div className="dashboard-notifications-cta">
      {status === 'denied' && (
        <p className="dashboard-notifications-hint">
          As notificações estão bloqueadas nas permissões do navegador para este site.
        </p>
      )}
      {status === 'inactive' && (
        <button type="button" onClick={() => void handleAtivar()} disabled={busy}>
          {busy ? 'Ativando…' : 'Ativar notificações'}
        </button>
      )}
      {status === 'active' && (
        <button type="button" onClick={() => void handleDesativar()} disabled={busy}>
          {busy ? 'Desativando…' : 'Desativar notificações'}
        </button>
      )}
      {error && (
        <p role="alert" className="auth-error">
          {error}
        </p>
      )}
    </div>
  );
}
