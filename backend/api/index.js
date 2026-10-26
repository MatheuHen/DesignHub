/**
 * Entry versionado da função serverless da Vercel (RF/RN inalterados — puramente
 * infra de deploy, seção 2.1).
 *
 * Este arquivo precisa existir no repositório: a Vercel valida o glob `functions`
 * do `vercel.json` como primeira etapa do `vercel build`, antes do install e do
 * buildCommand. O bundle real (`_handler.js`, gerado por
 * `scripts/build-vercel-function.mjs` via esbuild) é artefato e não é versionado,
 * então no build por Git ele ainda não existe nesse momento — o que fazia o
 * deploy automático falhar com `[unused_function]`.
 *
 * O require abaixo é estático de propósito, para o tracing da Vercel incluir o
 * bundle no pacote da função. Reexporta o módulo inteiro (`{ default, __esModule }`)
 * para preservar exatamente o formato que a plataforma já consumia.
 */
module.exports = require('./_handler.js');
