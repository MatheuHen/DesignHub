import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

/**
 * Fase 16: empacota `src/app.ts` (a mesma API Express usada localmente e
 * nos testes) num único arquivo JS autocontido para a função serverless da
 * Vercel — sem depender do `npm install`/tracing de `node_modules` da
 * plataforma para as dependências de runtime, que se mostrou não
 * confiável para este monorepo (RF/RN inalterados; puramente infra de
 * deploy, seção 2.1).
 *
 * A saída é `api/_handler.js` (gitignored), e não `api/index.js`. Motivo: a
 * Vercel valida o glob `functions` do `vercel.json` como PRIMEIRA etapa do
 * `vercel build` — antes do install e antes do buildCommand. Como o bundle é
 * artefato gerado e não versionado, no build por Git ele não existe no clone
 * e a validação abortava com `[unused_function]`, impedindo deploy automático
 * (deploy por CLI funcionava só porque subia o bundle já pronto do disco).
 * Agora `api/index.js` é um stub de uma linha versionado que reexporta este
 * bundle: o glob encontra a function no clone, e o bundle é produzido antes
 * de a function ser empacotada. O prefixo `_` impede que a Vercel trate o
 * bundle como uma segunda função.
 */
const backendDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

// Formato CJS (não ESM): várias dependências transitivas (ex.: `debug`,
// usada pelo `express`) fazem `require()` condicional de módulos nativos
// do Node em tempo de carregamento — sob bundle ESM o esbuild não consegue
// prover um `require` real para isso ("Dynamic require of 'tty' is not
// supported"). A extensão continua `.js` (a Vercel só reconhece
// `.js`/`.mjs`/`.ts` como função zero-config, não `.cjs`); a ambiguidade
// com o `"type": "module"` do package.json do workspace é resolvida por
// `api/package.json` (`{"type":"commonjs"}`, committed), que tem
// precedência para qualquer arquivo dentro de `api/`.
await build({
  entryPoints: [path.join(backendDir, 'src', 'vercelHandler.ts')],
  outfile: path.join(backendDir, 'api', '_handler.js'),
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  sourcemap: true,
  logLevel: 'info',
});
