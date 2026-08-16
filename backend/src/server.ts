import { createApp } from './app.js';
import { env } from './config/env.js';

const app = createApp();

const server = app.listen(env.PORT, () => {
  console.log(`[designhub] API disponível em http://localhost:${env.PORT}`);
});

function shutdown(signal: string) {
  console.log(`[designhub] encerrando por ${signal}`);
  server.close((error) => {
    if (error) {
      console.error('[designhub] falha ao encerrar servidor', error);
      process.exitCode = 1;
    }
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
