import { createApp } from './app.js';

/**
 * Fase 16: ponto de entrada exigido pela função serverless da Vercel —
 * nenhuma regra de negócio aqui, só o mesmo `createApp()` usado localmente
 * e nos testes. Empacotado num arquivo único autocontido por
 * `scripts/build-vercel-function.mjs` (esbuild) para `api/index.js`.
 */
export default createApp();
