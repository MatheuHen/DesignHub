import { defineConfig, devices } from '@playwright/test';

/**
 * Item 10 (rodada de correções): configuração E2E dedicada à validação do Web
 * Push REAL do DesignHub — APIs de verdade do navegador (ServiceWorker,
 * PushManager, Notification), backend de produção e chaves VAPID de produção.
 * Nada aqui é mock.
 *
 * O alvo é o deploy de produção, não um servidor local: o objetivo do teste é
 * provar o comportamento no ambiente que a banca vai usar. Por isso não há
 * `webServer` — a suíte pressupõe o deploy READY.
 */
const BASE_URL = process.env.E2E_BASE_URL ?? 'https://designhub-frontend-ten.vercel.app';

export default defineConfig({
  testDir: './e2e',
  // Web Push depende de ida e volta a um serviço externo (FCM) — um único
  // worker evita competir por permissão/registro do mesmo Service Worker.
  workers: 1,
  fullyParallel: false,
  timeout: 120_000,
  expect: { timeout: 20_000 },
  reporter: [['list']],
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    // `E2E_HEADED=0` permite rodar sem sessão gráfica (CI); o padrão é headed,
    // porque o Chromium completo é o mais próximo do navegador real do usuário.
    headless: process.env.E2E_HEADED === '0',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Chromium completo (não o headless-shell): o shell não implementa
        // push messaging, que é justamente o que está sob teste.
        channel: 'chromium',
      },
    },
  ],
});
