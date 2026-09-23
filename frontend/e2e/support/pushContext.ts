import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, test as base, type BrowserContext, type Page } from '@playwright/test';

/**
 * Item 10 (rodada de correções) — fixture obrigatória para testar Web Push.
 *
 * O contexto padrão do Playwright (`browser.newContext()`) é efêmero e o
 * Chrome o trata como janela anônima. A Push API é DELIBERADAMENTE desligada
 * em modo anônimo (crbug.com/41124656): `pushManager.subscribe()` rejeita com
 * `AbortError` e — por decisão do próprio Chrome — não existe forma de
 * detectar isso por feature detection. Ou seja: sem contexto persistente,
 * qualquer teste de Web Push falha por limitação do ambiente de teste, não do
 * aplicativo.
 *
 * `launchPersistentContext` usa um perfil real em disco (descartável, fora do
 * repositório), onde a Push API funciona normalmente.
 */
export const test = base.extend<{ pushContext: BrowserContext; pushPage: Page }>({
  pushContext: async ({ headless, baseURL }, use) => {
    const userDataDir = mkdtempSync(join(tmpdir(), 'designhub-e2e-push-'));
    const context = await chromium.launchPersistentContext(userDataDir, {
      headless,
      /**
       * `chromium` (build do Playwright), não `chrome`: medido neste
       * ambiente, o Chrome de marca cria a assinatura em `fcm.googleapis.com`
       * mas nunca entrega em perfil descartável (todo envio responde 410),
       * porque o registro FCM do perfil não se completa. O Chromium usa o
       * endpoint GCM `jmt17.google.com`, no qual a entrega ao Service Worker
       * de fato acontece — que é o comportamento sob teste.
       */
      channel: 'chromium',
      // Um contexto lançado manualmente não herda `use.baseURL` do config.
      ...(baseURL ? { baseURL } : {}),
      // Permissão concedida ao perfil; `Notification.requestPermission()` do
      // componente continua sendo chamado de verdade, sem stub.
      permissions: ['notifications'],
    });
    try {
      await use(context);
    } finally {
      await context.close();
      rmSync(userDataDir, { recursive: true, force: true });
    }
  },
  pushPage: async ({ pushContext }, use) => {
    const page = pushContext.pages()[0] ?? (await pushContext.newPage());
    await use(page);
  },
});

export { expect } from '@playwright/test';
