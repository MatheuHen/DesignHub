import { useEffect, useState } from 'react';
import { ApiError } from '../../../lib/apiClient';
import { getVapidPublicKey, subscribePush, unsubscribePush, type PushSubscriptionJson } from './api';
import { isWebPushSupported, urlBase64ToUint8Array } from './webPush';

type Status = 'checking' | 'unsupported' | 'unconfigured' | 'denied' | 'inactive' | 'active';

/**
 * Rodada correções (item 10.4): antes, oito causas distintas (permissão,
 * service worker inativo, serviço de push inalcançável, sessão expirada,
 * VAPID ausente, payload rejeitado…) caíam num único `catch {}` sem log e
 * viravam a mesma frase "não foi possível ativar as notificações neste
 * navegador" — impossível de diagnosticar. Agora cada fase produz uma
 * mensagem própria para o usuário e um log sanitizado (nome/status, nunca
 * chave, endpoint ou token) para o console.
 */
function describeAtivacaoError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return 'Sua sessão expirou. Entre novamente para ativar as notificações.';
    if (error.status === 403) return 'Esta conta não tem permissão para ativar notificações.';
    if (error.status === 429) return 'Muitas tentativas seguidas. Aguarde alguns minutos e tente de novo.';
    return 'O servidor recusou o registro das notificações. Tente novamente em instantes.';
  }
  if (error instanceof Error) {
    if (error.name === 'NotAllowedError') return 'A permissão de notificações foi negada para este site.';
    if (error.name === 'AbortError' || error.name === 'NotSupportedError') {
      return 'Não foi possível falar com o serviço de notificações do navegador. Verifique a conexão e tente novamente.';
    }
    if (error.name === 'InvalidStateError') {
      return 'O navegador ainda não terminou de preparar as notificações. Recarregue a página e tente novamente.';
    }
  }
  return 'Não foi possível ativar as notificações neste navegador.';
}

/** Loga só nome/status do erro — nunca endpoint, chave VAPID ou corpo da resposta. */
function logPushFailure(fase: string, error: unknown): void {
  const detalhe =
    error instanceof ApiError
      ? `ApiError ${error.status}`
      : error instanceof Error
        ? error.name
        : 'erro desconhecido';
  console.error(`[designhub:push] falha na fase "${fase}": ${detalhe}`);
}

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

    /**
     * Rodada correções (item 10.4): sem este catch, uma falha de rede ao
     * buscar a chave VAPID deixava o estado preso em `checking` — e como
     * `checking` não renderiza nada, o CTA simplesmente desaparecia da tela
     * para sempre, sem erro visível. Agora cai para `inactive`: o botão
     * continua disponível e a causa real aparece ao clicar.
     */
    void check().catch((checkError: unknown) => {
      logPushFailure('verificacao-inicial', checkError);
      if (!cancelled) setStatus('inactive');
    });
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

      /**
       * Rodada correções (item 10.2): `register()` resolve assim que o job de
       * registro é criado — o service worker ainda pode estar em `installing`.
       * `pushManager.subscribe()` exige um worker ATIVO e lança
       * `InvalidStateError` nesse intervalo, que era exatamente o sintoma
       * "falha no primeiro clique e funciona no segundo". `ready` aguarda a
       * ativação antes de assinar.
       */
      await navigator.serviceWorker.register('/sw.js');
      const registration = await navigator.serviceWorker.ready;

      /**
       * Item 10.3: reaproveita a assinatura existente em vez de criar outra —
       * `subscribe()` com uma `applicationServerKey` diferente da já
       * registrada também lança `InvalidStateError`. Se a chave do servidor
       * mudou, a assinatura antiga é descartada antes de criar a nova.
       */
      let subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await subscription.unsubscribe().catch(() => undefined);
        subscription = null;
      }
      subscription ??= await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });

      /**
       * Item 10.3: envia exatamente o contrato da API (`endpoint` + `keys`).
       * `toJSON()` também traz `expirationTime`, que não faz parte do
       * contrato — normalizar aqui evita depender da tolerância do servidor.
       */
      const json = subscription.toJSON() as PushSubscriptionJson & { keys?: Record<string, string> };
      const p256dh = json.keys?.p256dh;
      const authKey = json.keys?.auth;
      if (!json.endpoint || !p256dh || !authKey) {
        throw new Error('Assinatura de push incompleta devolvida pelo navegador.');
      }

      await subscribePush({ endpoint: json.endpoint, keys: { p256dh, auth: authKey } });
      setStatus('active');
    } catch (ativarError: unknown) {
      logPushFailure('ativacao', ativarError);
      setError(describeAtivacaoError(ativarError));
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
    } catch (desativarError: unknown) {
      logPushFailure('desativacao', desativarError);
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
