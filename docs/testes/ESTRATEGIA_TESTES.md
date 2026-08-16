# Estratégia de testes — DesignHub

A implementação deve transformar RF/RN/RNF em casos de teste rastreáveis.

- unitários: regras puras;
- integração: API/services/repositories/banco;
- E2E: fluxo real pelo navegador;
- segurança negativa: usuário/ownership/perfis/links;
- concorrência/idempotência: jobs/webhooks/publicação;
- performance: medir operações críticas;
- responsividade/acessibilidade/compatibilidade;
- falhas externas: Supabase/Meta;
- regressão após cada correção/refatoração.

Não usar mock como evidência de que uma API externa real está funcionando.
