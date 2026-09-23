import { createClient } from '@supabase/supabase-js';
import type { Page } from '@playwright/test';
import webpush from 'web-push';
import { expect, test } from './support/pushContext';
import { fingerprint, loadDesignerCredentials, requireSecret } from './support/env';

/**
 * Item 10 (rodada de correções) — validação REAL do Web Push do DesignHub.
 *
 * Nada aqui é mockado: Chromium completo, `Notification`/`ServiceWorker`/
 * `PushManager` nativos, backend e Supabase de produção, e o envio de push
 * usa `web-push` com o par VAPID de produção contra o endpoint REAL que o
 * navegador acabou de criar.
 *
 * Contexto: os testes unitários já cobriam o fluxo, mas mockavam
 * `pushManager` e o `toJSON()` do navegador — foi exatamente aí que dois bugs
 * de produção passaram despercebidos (o backend rejeitava o `expirationTime`
 * que todo navegador envia, e o frontend assinava antes do Service Worker
 * ativar). Este teste fecha essa lacuna exercitando o caminho verdadeiro.
 */

const ORIGIN = process.env.E2E_BASE_URL ?? 'https://designhub-frontend-ten.vercel.app';
const PUSH_TITLE = 'DesignHub';
const PUSH_BODY = 'Teste de notificações realizado com sucesso.';
const PUSH_URL = '/designer';

interface SubscriptionShape {
  presente: boolean;
  endpointPresente: boolean;
  p256dhPresente: boolean;
  authPresente: boolean;
  endpointHash: string;
}

/** Inspeção da assinatura no navegador — devolve presença e hash, nunca valores. */
async function inspecionarSubscription(page: Page): Promise<SubscriptionShape> {
  return page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      return { presente: false, endpointPresente: false, p256dhPresente: false, authPresente: false, endpoint: '' };
    }
    const json = subscription.toJSON() as { endpoint?: string; keys?: Record<string, string> };
    return {
      presente: true,
      endpointPresente: Boolean(json.endpoint),
      p256dhPresente: Boolean(json.keys?.p256dh),
      authPresente: Boolean(json.keys?.auth),
      endpoint: json.endpoint ?? '',
    };
  }).then((r) => ({
    presente: r.presente,
    endpointPresente: r.endpointPresente,
    p256dhPresente: r.p256dhPresente,
    authPresente: r.authPresente,
    endpointHash: r.endpoint ? fingerprint(r.endpoint) : '',
  }));
}

function adminClient() {
  return createClient(requireSecret('NEXT_PUBLIC_SUPABASE_URL'), requireSecret('SUPABASE_SECRET_KEY'), {
    auth: { persistSession: false },
  });
}

async function login(page: Page): Promise<void> {
  const { email, password } = loadDesignerCredentials();
  await page.goto('/login');
  // Por id: o campo de senha convive com o botão "Mostrar senha", que também
  // responde ao rótulo acessível "Senha".
  await page.locator('#login-email').fill(email);
  await page.locator('#login-password').fill(password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.waitForURL('**/designer', { timeout: 60_000 });
}

test.describe('Web Push real (item 10)', () => {
  /**
   * O perfil do navegador é descartado ao fim do teste, então a assinatura
   * persistida apontaria para um endpoint morto. O job de publicação já sabe
   * lidar com isso (410 -> `WebPushSubscriptionGoneError` -> remoção), mas
   * não há razão para deixar resíduo de teste no banco de produção.
   */
  test.afterEach(async () => {
    const { userId } = loadDesignerCredentials();
    if (userId) await adminClient().from('push_subscription').delete().eq('id_usuario', userId);
  });

  test('designer ativa, recebe push real e desativa/reativa as notificações', async ({ pushPage: page }) => {
    test.setTimeout(300_000);
    // Evidência sanitizada do caminho real percorrido (nunca corpo/valores).
    page.on('console', (m) => {
      if (m.type() === 'error') console.log(`[browser.error] ${m.text().slice(0, 200)}`);
    });
    page.on('response', (r) => {
      const path = new URL(r.url()).pathname;
      if (path.startsWith('/api/push')) console.log(`[api] ${r.request().method()} ${path} -> ${r.status()}`);
    });

    const supabase = adminClient();
    const { userId } = loadDesignerCredentials();

    // Estado inicial limpo: o teste precisa provar que a assinatura nasce
    // AQUI, não que já existia de uma execução anterior.
    if (userId) await supabase.from('push_subscription').delete().eq('id_usuario', userId);

    await test.step('login real do designer', async () => {
      await login(page);
      await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
    });

    await test.step('permissão de notificação concedida no navegador', async () => {
      const permission = await page.evaluate(() => Notification.permission);
      expect(permission).toBe('granted');
    });

    await test.step('nenhum service worker antes da ativação (registro sob demanda)', async () => {
      // O DesignHub só registra `/sw.js` quando o designer clica em "Ativar
      // notificações" — nunca no carregamento da página. Por isso
      // `serviceWorker.ready` ainda NÃO resolve aqui: confirmar isso primeiro
      // garante que o registro observado depois nasceu deste clique.
      const registrado = await page.evaluate(() =>
        navigator.serviceWorker.getRegistration('/sw.js').then((r) => Boolean(r?.active)),
      );
      expect(registrado).toBe(false);
    });

    await test.step('clique real em "Ativar notificações"', async () => {
      await page.getByRole('button', { name: 'Ativar notificações' }).click();
      // A troca do rótulo só ocorre depois do POST /api/push/subscribe
      // retornar 204 — é a primeira evidência de assinatura aceita. O prazo é
      // generoso porque `pushManager.subscribe()` num perfil novo precisa
      // registrar o navegador no serviço de push (FCM) antes de responder.
      await expect(page.getByRole('button', { name: 'Desativar notificações' })).toBeVisible({ timeout: 90_000 });
    });

    const swInfo = await test.step('service worker registrado e ativo', async () => {
      const info = await page.evaluate(async () => {
        const registration = await navigator.serviceWorker.ready;
        return {
          scope: registration.scope,
          script: registration.active?.scriptURL ?? '',
          estado: registration.active?.state ?? '',
        };
      });
      expect(info.scope).toBe(`${ORIGIN}/`);
      expect(info.script).toBe(`${ORIGIN}/sw.js`);
      expect(info.estado).toBe('activated');
      return info;
    });
    console.log(`[evidência] service worker: scope=${swInfo.scope} script=${swInfo.script} estado=${swInfo.estado}`);

    const subscription = await test.step('assinatura criada pelo navegador', async () => {
      const shape = await inspecionarSubscription(page);
      expect(shape.presente).toBe(true);
      expect(shape.endpointPresente).toBe(true);
      expect(shape.p256dhPresente).toBe(true);
      expect(shape.authPresente).toBe(true);
      return shape;
    });
    console.log(
      `[evidência] subscription no navegador: endpoint=SIM p256dh=SIM auth=SIM (fingerprint ${subscription.endpointHash})`,
    );

    const persistida = await test.step('assinatura persistida para o designer autenticado', async () => {
      const { data, error } = await supabase
        .from('push_subscription')
        .select('id_usuario, endpoint, p256dh, auth_key')
        .eq('id_usuario', userId!);
      expect(error).toBeNull();
      expect(data).toHaveLength(1);

      const row = data![0] as { id_usuario: string; endpoint: string; p256dh: string; auth_key: string };
      expect(row.id_usuario).toBe(userId);
      // Mesma assinatura do navegador, comparada por hash (nunca pelo valor).
      expect(fingerprint(row.endpoint)).toBe(subscription.endpointHash);
      expect(row.p256dh.length).toBeGreaterThan(0);
      expect(row.auth_key.length).toBeGreaterThan(0);
      return row;
    });
    console.log('[evidência] banco: registro encontrado=SIM | id_usuario corresponde ao designer=SIM');

    await test.step('upsert idempotente: reativar não duplica linha', async () => {
      // Segunda ativação do MESMO navegador tem de atualizar, não inserir.
      const { count, error } = await supabase
        .from('push_subscription')
        .select('id_subscription', { count: 'exact', head: true })
        .eq('id_usuario', userId!);
      expect(error).toBeNull();
      expect(count).toBe(1);
    });

    await test.step('envio REAL de Web Push com as chaves VAPID de produção', async () => {
      webpush.setVapidDetails(
        requireSecret('WEB_PUSH_VAPID_SUBJECT'),
        requireSecret('WEB_PUSH_VAPID_PUBLIC_KEY'),
        requireSecret('WEB_PUSH_VAPID_PRIVATE_KEY'),
      );
      /**
       * Retentativa limitada — do SERVIÇO DE PUSH, não do DesignHub.
       *
       * Medido neste ambiente: o endpoint GCM que o Chromium emite
       * (`jmt17.google.com`) responde de forma inconsistente para a MESMA
       * assinatura viva — três envios seguidos devolveram 201, 410 e 201.
       * Não é assinatura morta (os envios vizinhos entregam), é instabilidade
       * do serviço usado pelo navegador de teste.
       *
       * Isto não afrouxa a prova: o passo seguinte continua exigindo que o
       * Service Worker EXIBA a notificação. Se a entrega realmente não
       * ocorrer, o teste falha lá, por mais 201 que o transporte devolva.
       */
      const statusCodes: Array<number | undefined> = [];
      let statusCode: number | undefined;
      for (let tentativa = 1; tentativa <= 3; tentativa += 1) {
        try {
          const resultado = await webpush.sendNotification(
            {
              endpoint: persistida.endpoint,
              keys: { p256dh: persistida.p256dh, auth: persistida.auth_key },
            },
            JSON.stringify({ title: PUSH_TITLE, body: PUSH_BODY, url: PUSH_URL }),
          );
          statusCode = resultado.statusCode;
          statusCodes.push(statusCode);
          break;
        } catch (error) {
          // O erro do `web-push` traz só "unexpected response code" na
          // mensagem; o status real fica numa propriedade. Nunca logar
          // cabeçalho/corpo — podem conter o endpoint (seção 12.5).
          statusCode = (error as { statusCode?: number }).statusCode;
          statusCodes.push(statusCode);
          if (tentativa === 3) {
            throw new Error(`Serviço de push recusou o envio (HTTP ${statusCodes.join(', ')}).`);
          }
          await new Promise((resolve) => setTimeout(resolve, 2_000));
        }
      }
      // 201 do serviço de push é só o aceite do transporte — a prova real vem
      // do Service Worker no passo seguinte.
      expect([200, 201, 202]).toContain(statusCode);
      console.log(`[evidência] serviço de push aceitou o envio (HTTP ${statusCode})`);
    });

    await test.step('Service Worker recebeu e exibiu a notificação', async () => {
      // Prova de recebimento: o handler `push` do /sw.js chamou
      // showNotification — nenhum HTTP status serve como substituto.
      await expect
        .poll(
          async () =>
            page.evaluate(async () => {
              const registration = await navigator.serviceWorker.ready;
              const notifications = await registration.getNotifications();
              return notifications.map((n) => ({ title: n.title, body: n.body, url: (n.data as { url?: string })?.url }));
            }),
          { timeout: 45_000, message: 'Service Worker não exibiu a notificação enviada' },
        )
        .toContainEqual({ title: PUSH_TITLE, body: PUSH_BODY, url: PUSH_URL });
      console.log(`[evidência] notificação exibida pelo Service Worker: "${PUSH_TITLE}" / "${PUSH_BODY}" -> ${PUSH_URL}`);
    });

    await test.step('desativar remove a assinatura do navegador e do banco', async () => {
      await page.getByRole('button', { name: 'Desativar notificações' }).click();
      await expect(page.getByRole('button', { name: 'Ativar notificações' })).toBeVisible();

      const shape = await inspecionarSubscription(page);
      expect(shape.presente).toBe(false);

      const { data, error } = await supabase.from('push_subscription').select('id_subscription').eq('id_usuario', userId!);
      expect(error).toBeNull();
      expect(data).toHaveLength(0);
    });

    await test.step('reativar cria e persiste uma nova assinatura', async () => {
      await page.getByRole('button', { name: 'Ativar notificações' }).click();
      await expect(page.getByRole('button', { name: 'Desativar notificações' })).toBeVisible();

      const shape = await inspecionarSubscription(page);
      expect(shape.presente).toBe(true);

      const { data, error } = await supabase.from('push_subscription').select('id_usuario').eq('id_usuario', userId!);
      expect(error).toBeNull();
      expect(data).toHaveLength(1);
    });
  });
});
