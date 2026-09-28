# Evidências de Testes Finais — DesignHub

> Documento gerado por validação técnica real (não simulada) executada em sessão do Claude Code, para uso como fonte de evidência do Capítulo 4 do TFC. Todos os números abaixo foram observados na execução real dos comandos indicados; nenhum valor foi estimado ou reaproveitado de rodadas anteriores sem reexecução.

## Ambiente avaliado

- **Data/hora da validação:** 2026-09-27 (noite, horário de Brasília)
- **Branch:** `main`
- **Commit no início desta sessão:** `e970db7`
- **Commit final após esta sessão** (inclui correções desta validação + correções aplicadas por uma sessão autônoma do Claude Code que já estava em execução em paralelo neste mesmo repositório): ver seção "Commits desta validação"
- **Frontend produção:** https://designhub-frontend-ten.vercel.app
- **Backend produção:** https://designhub-backend.vercel.app

**Observação de processo:** durante esta validação foi identificada uma segunda sessão autônoma do Claude Code (`INICIAR_CLAUDE_AUTONOMO`) já em execução no mesmo repositório desde antes do início desta sessão. Ela havia corrigido/commitado/deployado, de forma independente, os headers de segurança do frontend (commit `9bada1c`) antes de qualquer ação nesta sessão. Todas as validações abaixo foram re-executadas nesta sessão para confirmar o estado real, não reaproveitadas às cegas.

## Testes automatizados do backend

- **Comando:** `npm run test --workspace backend` (Vitest)
- **Arquivos/suítes:** 52
- **Testes:** 644
- **Falhas:** 0 (após correção — ver "Correções aplicadas")
- **Resultado:** PASS

## Testes automatizados do frontend

- **Comando:** `npm run test --workspace frontend` (Vitest + Testing Library)
- **Arquivos/suítes:** 15
- **Testes:** 150
- **Falhas:** 0 (após correção — ver "Correções aplicadas")
- **Resultado:** PASS

## Total geral (unitário/integração)

- **Arquivos/suítes:** 67 (52 backend + 15 frontend)
- **Testes:** 794 (644 backend + 150 frontend)
- **Falhas finais:** 0

## Análise estática

### Backend
- **ESLint:** `npm run lint --workspace backend` → `eslint . --max-warnings=0` — PASS, 0 warnings/erros.
- **TypeScript:** `npm run typecheck --workspace backend` → `tsc -p tsconfig.json --noEmit --pretty false` — PASS, 0 erros.
- **Build:** `npm run build --workspace backend` → `tsc -p tsconfig.json` — PASS.

### Frontend
- **ESLint:** `npm run lint --workspace frontend` → `eslint . --max-warnings=0` — PASS, 0 warnings/erros.
- **TypeScript:** `npm run typecheck --workspace frontend` → `tsc -b --pretty false` — PASS, 0 erros.
- **Build:** `npm run build --workspace frontend` → `tsc -b && vite build` — PASS. Bundle gerado: `index-*.js` 329.19 kB (gzip 98.20 kB) + chunk vendor `supabase-*.js` isolado em 216.82 kB (gzip 57.10 kB), confirmando o `manualChunks` de Supabase já aplicado em rodada anterior.

## Testes E2E (Playwright)

- **Ferramenta:** Playwright 1.63.0, projeto `chromium` (canal `chromium` completo, não headless-shell — necessário para Push API real).
- **Cenário:** `e2e/web-push.spec.ts` — designer ativa notificações, recebe um Web Push real (VAPID de produção, Service Worker real, sem mock), confirma persistência no banco e desativa/reativa a assinatura.
- **Alvo:** produção real (`https://designhub-frontend-ten.vercel.app` + `https://designhub-backend.vercel.app`), não um servidor local — teste feito para provar o comportamento no ambiente que a banca vai usar.
- **Resultado antes da correção:** FAIL — mas por erro de infraestrutura de teste, não do produto: `browserContext.close()` lançava `ENOENT` ao gravar o trace (`retain-on-failure`) no teardown de um `launchPersistentContext` manual, no Windows. Todas as evidências funcionais do fluxo (subscribe, Service Worker `activated`, push aceito com HTTP 201, notificação exibida, unsubscribe, resubscribe) foram observadas com sucesso nos logs mesmo nessa execução.
- **Correção aplicada:** `frontend/playwright.config.ts` — `trace: 'retain-on-failure'` → `trace: 'off'` (ver "Correções aplicadas"). Não altera nenhum comportamento de produto, apenas a captura de artefato de depuração do teste.
- **Resultado após correção:** **1 passed** (36.9s). Evidências de console da execução real:
  - `GET /api/push/vapid-public-key -> 200`
  - `POST /api/push/subscribe -> 204`
  - Service Worker: `scope=https://designhub-frontend-ten.vercel.app/ script=.../sw.js estado=activated`
  - Subscription no navegador: `endpoint=SIM p256dh=SIM auth=SIM`
  - Banco: registro encontrado=SIM, `id_usuario` corresponde ao designer=SIM
  - Serviço de push aceitou o envio (HTTP 201)
  - Notificação exibida pelo Service Worker: "DesignHub" / "Teste de notificações realizado com sucesso." → `/designer`
  - `POST /api/push/unsubscribe -> 204`, seguido de novo `subscribe -> 204` (reativação)
- **Tempo:** ~37s (execução real contra produção, sem mock).

## Segurança

### Headers de segurança em produção

**Frontend** (`https://designhub-frontend-ten.vercel.app`):
```
Content-Security-Policy: default-src 'self'; base-uri 'self'; form-action 'self'; object-src 'none';
  script-src 'self'; script-src-attr 'none'; style-src 'self' 'unsafe-inline';
  img-src 'self' data: blob: https://hfwgodzvitinubarwrjm.supabase.co; font-src 'self' data:;
  connect-src 'self' https://designhub-backend.vercel.app https://hfwgodzvitinubarwrjm.supabase.co
  wss://hfwgodzvitinubarwrjm.supabase.co; frame-src 'self' https://hfwgodzvitinubarwrjm.supabase.co;
  frame-ancestors 'none'; upgrade-insecure-requests
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
Referrer-Policy: no-referrer
Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=(), magnetometer=(),
  gyroscope=(), accelerometer=()
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
```

**Backend** (`https://designhub-backend.vercel.app/api/health`, via `helmet()` + middleware próprio):
```
Content-Security-Policy: default-src 'self';base-uri 'self';font-src 'self' https: data:;
  form-action 'self';frame-ancestors 'self';img-src 'self' data:;object-src 'none';
  script-src 'self';script-src-attr 'none';style-src 'self' https: 'unsafe-inline';
  upgrade-insecure-requests
Strict-Transport-Security: max-age=31536000; includeSubDomains
X-Content-Type-Options: nosniff
X-Frame-Options: SAMEORIGIN
Referrer-Policy: no-referrer
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Resource-Policy: same-origin
Cache-Control: no-store
```

Ambos verificados com `curl -I` real contra as URLs de produção após o deploy; nenhum cookie, token ou dado sensível foi exposto na verificação.

### CORS

- **Origem legítima** (`https://designhub-frontend-ten.vercel.app`): preflight `OPTIONS` responde `204`, `Access-Control-Allow-Origin: https://designhub-frontend-ten.vercel.app`, `Access-Control-Allow-Credentials: true`, `Vary: Origin, Access-Control-Request-Headers`.
- **Origem não autorizada** (`https://example.com`): o backend responde com o **mesmo** `Access-Control-Allow-Origin` fixo (`https://designhub-frontend-ten.vercel.app`), nunca refletindo o `Origin` da requisição recebida. Como o valor não corresponde ao `Origin` real enviado pelo navegador, o próprio navegador bloqueia o acesso da página maliciosa à resposta — o comportamento observado via `curl` (que não aplica same-origin policy) é exatamente o esperado de um servidor com allowlist fixo (`cors({ origin: env.FRONTEND_URL, credentials: true })`), não um wildcard.
- **Resultado:** PASS — sem exposição de CORS indevido, nenhuma alteração de configuração foi necessária.

## Testes complementares já realizados

- **k6** (`k6-health-test.js`, 10 VUs / 30s contra `GET /api/health` em produção): 258 requisições, 0% de falha, `http_req_duration` p95 = 228.15ms (limite do threshold: <1000ms — PASS), `p(90)` = 225.95ms, média 184.24ms. Thresholds configurados (`http_req_failed rate<0.01`, `http_req_duration p(95)<1000`) — ambos PASS.
- **Lighthouse / Postman / Newman / OWASP ZAP:** sem execução nova nesta sessão; não há relatório novo desses instrumentos para citar aqui sem reexecução (não foram reexecutados por não estarem no escopo desta rodada de validação). Correções de headers de segurança motivadas por rodada anterior de OWASP ZAP já estão refletidas e confirmadas em produção (seção "Headers de segurança" acima).

## Correções aplicadas nesta validação

1. **`backend/src/repositories/avaliacao.repository.test.ts`** — dois testes usavam `expires_at`/datas absolutas fixas (`2026-09-27T10:00:00Z`, `2026-09-29T10:00:00Z`) que dependiam de rodar antes dessas datas no calendário real. Como a validação ocorreu no próprio dia 27/09/2026, o link já contava como "expirado" antes de a lógica de teste chegar à situação esperada (`falha_envio`/`aguardando_resposta`), quebrando o teste por *timing*, não por regressão de código de produção. Corrigido trocando por `new Date(Date.now() + 100_000).toISOString()`, seguindo o mesmo padrão já usado em outros testes do mesmo arquivo.
2. **`frontend/src/features/avaliacao/AvaliacaoPage.test.tsx`** — mesmo problema: `dataDesejada: '2026-09-26'` (fixa) ficou no passado em relação à data real da execução, acionando a validação legítima de "não agendar no passado" (`isDataHorarioPassadoSaoPaulo`) e nunca chamando `submitAvaliacao`. Corrigido calculando a data desejada dinamicamente (`Date.now() + 7 dias`).
3. **`frontend/playwright.config.ts`** — `trace: 'retain-on-failure'` causava `ENOENT` no teardown do contexto persistente manual (`launchPersistentContext`, usado obrigatoriamente para testar a Push API real) no Windows, fazendo o Playwright reportar FAIL mesmo com o fluxo 100% funcional. Trocado para `trace: 'off'`; não altera nenhum comportamento do produto, apenas a captura de artefato de depuração.

Nenhuma das três correções altera regra de negócio, fluxo, estado ou requisito do TFC — são exclusivamente correções de dados/config de teste que dependiam incorretamente da data absoluta em que foram escritos.

## Resultado final

- **PASS/FAIL geral:** **PASS**
- **Testes automatizados:** 794/794 passando (0 falhas) — 644 backend + 150 frontend.
- **E2E Web Push:** 1/1 passando contra produção real.
- **Lint/typecheck/build:** 100% limpos em backend e frontend.
- **Segurança (headers/CORS):** conforme especificado, sem achado pendente nesta rodada.
- **Performance (k6/health):** dentro dos thresholds definidos (p95 < 1s).
- **Limitações reais:**
  - Lighthouse, Postman/Newman e OWASP ZAP não foram reexecutados nesta sessão (sem resultado novo para citar; os headers de segurança motivados pela rodada anterior de OWASP ZAP já estão confirmados ativos em produção).
  - Coverage automatizado não está configurado no projeto (nem Vitest nem CI possuem script de coverage); nenhuma dependência ou configuração foi adicionada para gerar esse número, por instrução explícita de não alterar o projeto apenas para produzir coverage.
  - Havia uma segunda sessão autônoma do Claude Code operando no mesmo repositório durante esta validação (ver "Ambiente avaliado"); os números acima refletem o estado real observado após a coordenação entre as duas sessões, não uma execução isolada.
