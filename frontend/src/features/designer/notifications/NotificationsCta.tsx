import { useEffect, useState } from 'react';
import { ApiError } from '../../../lib/apiClient';
import { getVapidPublicKey, subscribePush, unsubscribePush, type PushSubscriptionJson } from './api';
import { isWebPushSupported, mostrarNotificacaoLocal, urlBase64ToUint8Array } from './webPush';

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

/** Extrai o contrato que a API espera, descartando campos fora dele. */
function toSubscriptionJson(subscription: PushSubscription): PushSubscriptionJson {
  /**
   * Item 10.3: envia exatamente o contrato da API (`endpoint` + `keys`).
   * `toJSON()` também traz `expirationTime`, que não faz parte do contrato —
   * normalizar aqui evita depender da tolerância do servidor.
   */
  const json = subscription.toJSON() as PushSubscriptionJson & { keys?: Record<string, string> };
  const p256dh = json.keys?.p256dh;
  const authKey = json.keys?.auth;
  if (!json.endpoint || !p256dh || !authKey) {
    throw new Error('Assinatura de push incompleta devolvida pelo navegador.');
  }
  return { endpoint: json.endpoint, keys: { p256dh, auth: authKey } };
}

/**
 * Item 9 (requisito explícito): controle de notificações do Dashboard —
 * nunca pede permissão automaticamente no carregamento da página. O
 * designer decide clicando. Degrada normalmente (esconde-se) quando o
 * navegador não suporta Web Push ou quando o backend não tem as chaves
 * VAPID configuradas — o resto do Dashboard continua funcionando.
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

      /**
       * "Ativou uma vez, continua ativado": o estado vem da assinatura que o
       * navegador já guarda para este dispositivo. Enquanto ela existir, o
       * designer não precisa ativar de novo a cada login ou reload.
       *
       * Reconciliação: a assinatura é reenviada ao backend (upsert
       * idempotente pela chave `id_usuario + endpoint`). Isso recupera, sem
       * nenhuma ação do designer, o caso em que o navegador manteve a
       * inscrição mas o registro do servidor se perdeu — por exemplo depois
       * de uma limpeza de assinaturas expiradas.
       */
      const registration = await navigator.serviceWorker.getRegistration('/sw.js');
      const existing = await registration?.pushManager.getSubscription();
      if (cancelled) return;

      if (!existing) {
        setStatus('inactive');
        return;
      }

      setStatus('active');
      try {
        await subscribePush(toSubscriptionJson(existing));
      } catch (syncError: unknown) {
        // Falha de sincronização não desativa nada nem polui a tela: a
        // assinatura do navegador continua válida e a próxima visita tenta
        // de novo.
        logPushFailure('sincronizacao', syncError);
      }
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
       * Reaproveita a assinatura que já existe neste navegador em vez de
       * destruí-la e criar outra a cada clique. A recriação gerava um
       * endpoint novo toda vez — e, enquanto o servidor não fosse avisado,
       * uma linha órfã apontando para o endpoint morto.
       *
       * Só vale a pena trocar quando a assinatura foi criada com OUTRA chave
       * VAPID (servidor rotacionou a chave): aí ela nunca receberia os
       * envios atuais, e `subscribe()` com uma chave diferente lançaria
       * `InvalidStateError`.
       */
      const applicationServerKey = urlBase64ToUint8Array(publicKey);
      let subscription = await registration.pushManager.getSubscription();

      if (subscription && !mesmaChaveDoServidor(subscription, applicationServerKey)) {
        const endpointAntigo = subscription.endpoint;
        // O servidor é avisado ANTES de descartar, para não deixar a linha
        // órfã; se essa limpeza falhar, seguimos assim mesmo (o envio já
        // remove endpoints que respondem 404/410).
        await unsubscribePush(endpointAntigo).catch((cleanupError: unknown) => {
          logPushFailure('limpeza-assinatura-anterior', cleanupError);
        });
        await subscription.unsubscribe().catch(() => undefined);
        subscription = null;
      }

      subscription ??= await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey,
      });

      // A ativação só é dada como concluída depois que o servidor confirma a
      // vinculação do dispositivo à conta. Se isto falhar, o catch abaixo
      // mantém o estado anterior e mostra o motivo.
      await subscribePush(toSubscriptionJson(subscription));
      setStatus('active');

      await mostrarNotificacaoLocal(registration, {
        title: 'DesignHub — NOTIFICAÇÕES ATIVADAS',
        body: 'As notificações do DesignHub foram ativadas neste dispositivo.',
        url: '/designer',
      });
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
        // Servidor primeiro: enquanto a linha existir lá, este dispositivo
        // continuaria recebendo. Só depois o navegador descarta.
        await unsubscribePush(subscription.endpoint);
        await subscription.unsubscribe();
      }

      setStatus('inactive');

      /**
       * A confirmação sai DEPOIS da desativação concluída e enquanto a
       * permissão do navegador ainda permite exibir — remover a assinatura
       * de push não revoga a permissão de notificação, então o aviso local
       * continua possível.
       */
      if (registration) {
        await mostrarNotificacaoLocal(registration, {
          title: 'DesignHub — NOTIFICAÇÕES DESATIVADAS',
          body: 'As notificações do DesignHub foram desativadas neste dispositivo.',
          url: '/designer',
        });
      }
    } catch (desativarError: unknown) {
      // Falha parcial: a assinatura pode continuar ativa, então o estado NÃO
      // muda para "desativado" — seria informar uma conclusão que não houve.
      logPushFailure('desativacao', desativarError);
      setError('Não foi possível desativar as notificações. Tente novamente.');
    } finally {
      setBusy(false);
    }
  }

  if (status === 'checking' || status === 'unsupported' || status === 'unconfigured') return null;

  return (
    <div className="dashboard-notifications-cta">
      {status === 'denied' && (
        <p className="dashboard-notifications-hint">
          Notificações bloqueadas nas permissões do navegador para este site.
        </p>
      )}
      {status === 'inactive' && (
        <button type="button" onClick={() => void handleAtivar()} disabled={busy}>
          {busy ? 'Ativando…' : 'Ativar notificações'}
        </button>
      )}
      {status === 'active' && (
        <p className="dashboard-notifications-status">
          <span className="dashboard-notifications-on">✓ Notificações ativadas</span>{' '}
          <button
            type="button"
            className="link-button"
            onClick={() => void handleDesativar()}
            disabled={busy}
          >
            {busy ? 'desativando…' : 'desativar'}
          </button>
        </p>
      )}
      {error && (
        <p role="alert" className="auth-error">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * Compara a chave VAPID com a qual a assinatura foi criada. Quando o
 * servidor rotaciona o par de chaves, a assinatura antiga deixa de receber
 * os envios e precisa ser refeita; fora isso, ela é reaproveitada.
 *
 * `applicationServerKey` pode não estar disponível em navegadores antigos —
 * nesse caso tratamos como "mesma chave" para não recriar a assinatura sem
 * necessidade (o envio real revelaria o problema com um 404/410).
 */
function mesmaChaveDoServidor(
  subscription: PushSubscription,
  applicationServerKey: Uint8Array<ArrayBuffer>,
): boolean {
  const atual = subscription.options?.applicationServerKey;
  if (!atual) return true;

  const bytes = new Uint8Array(atual);
  if (bytes.length !== applicationServerKey.length) return false;
  return bytes.every((valor, indice) => valor === applicationServerKey[indice]);
}
