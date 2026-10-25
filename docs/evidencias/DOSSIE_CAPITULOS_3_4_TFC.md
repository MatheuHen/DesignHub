# DesignHub — Dossiê técnico para Capítulos 3 e 4 do TFC

> Documento de levantamento factual, gerado por leitura direta do código, `package.json`,
> migrations, Git e execução real de testes/lint/typecheck/build no commit abaixo.
> Não contém segredos, tokens, connection strings ou valores de `.env`.
> Uso interno para redação do relatório — **não versionar no Git**.

**Commit analisado:** `280fbca64f629343a2a37c7a2a4fed8f6230ddfa` (branch `main`)
**Data do levantamento:** 2026-09-22
**Total de commits no repositório:** 59

---

## 1. IMPLEMENTAÇÃO

### 1.1 Como o DesignHub foi implementado

Monorepo com dois workspaces npm (`frontend`, `backend`) orquestrados por um
`package.json` raiz (scripts `dev`, `lint`, `typecheck`, `test`, `build`, `verify`
rodando nos dois workspaces). Backend é uma API REST (Express + TypeScript) que
fala com o Postgres do Supabase via `@supabase/supabase-js`; frontend é uma SPA
React consumindo essa API por HTTP. Nenhuma lógica de negócio roda no frontend —
toda regra (status, prazos, autorização, idempotência) está no backend e/ou em
funções Postgres (`SECURITY DEFINER`) chamadas via RPC.

### 1.2 Atores existentes (confirmados no código)

- **Administrador** — gerencia designers (`backend/src/routes/designer.routes.ts`,
  `frontend/src/features/admin/designers/`), reatribui solicitações
  (`reassign_solicitacao`), tem visão somente-leitura de qualquer solicitação
  (`frontend/src/features/admin/solicitacoes/AdminSolicitacaoDetailPage.tsx`).
- **Designer** — cadastra clientes, conduz atendimento WhatsApp, faz upload de
  versões, agenda/cancela publicação, cancela solicitação
  (`frontend/src/features/designer/`).
- **Cliente** — não autentica no sistema; interage via link público de avaliação
  (token opaco) e via WhatsApp.
- **Serviço Automático** — jobs pg_cron (publicação vencida, expiração de
  atendimento, notificação de publicação próxima) chamando endpoints internos
  protegidos por segredo compartilhado (`backend/src/middleware/internalAuth.ts`).

### 1.3 Fluxo principal (confirmado nas rotas/serviços)

1. Admin autentica → cadastra designer (`POST /api/designers`).
2. Designer autentica → cadastra cliente (`POST /api/clientes`).
3. Designer inicia atendimento WhatsApp (`POST /api/clientes/:id/atendimento` →
   `iniciarAtendimento`, `backend/src/services/atendimento.service.ts`).
4. Webhook WhatsApp (`POST /api/webhooks/whatsapp`) recebe respostas do cliente,
   conduz o questionário fechado (`ATENDIMENTO_QUESTIONS`,
   `atendimentoQuestions.ts`) e, ao concluir, cria a `solicitacao` em
   `Em produção` (`completeAtendimentoAndCreateSolicitacao`, RPC).
5. Designer envia versão (`POST /api/solicitacoes/:id/versoes`) → status
   `Enviado para avaliação`.
6. Cliente acessa link de avaliação (token opaco, `GET /api/avaliacao/:token`) →
   aprova, pede ajuste ou cancela (`submit_avaliacao` RPC).
7. Ajuste → status `Ajustes`; nova versão → volta para `Enviado para avaliação`.
8. Aprovação → 3 caminhos: agendamento automático, designer agenda manual, ou
   cliente publica por conta própria (`avaliacao.service.ts`,
   `submitAvaliacaoDecisao`).
9. Agendamento aprovado (`create_agendamento`/`create_agendamento_cliente`) →
   status `Agendado`.
10. Job pg_cron (`*/5 * * * *`) processa agendamentos vencidos
    (`internalPublicacao.routes.ts` → `publicacao.service.ts`) → publica no
    Instagram (quando conectado) ou aguarda registro manual → status
    `Publicado`.

### 1.4 Frontend

React 19 + TypeScript + Vite, roteamento com `react-router-dom` 7. Estrutura por
feature (`frontend/src/features/{admin,designer,avaliacao,auth}`), sem
gerenciador de estado global externo (estado local por página + Context de auth,
`AuthContext.tsx`). 14 arquivos `.tsx` de tela (sem contar testes).

### 1.5 Backend

Node.js + Express 5 + TypeScript, camadas: `routes` (13 arquivos) →
`services` (12) → `repositories` (10) → `integrations` (adapters externos:
`ai`, `instagram`, `webpush`, `whatsapp`). Validação de entrada centralizada
com Zod (`backend/src/schemas`). Middleware próprio de auth
(`middleware/auth.ts`), auth interna de job (`middleware/internalAuth.ts`),
upload (`middleware/upload.ts`, via `multer`), tratamento de erro
(`middleware/error-handler.ts`).

### 1.6 Banco

PostgreSQL 17 via Supabase, 45 migrations versionadas, 18 tabelas com RLS
habilitada, 27 funções/RPCs `SECURITY DEFINER`, 8 triggers, 36 índices. Ver
seção 5.

### 1.7 WhatsApp

WhatsApp Cloud API oficial da Meta (`backend/src/integrations/whatsapp/
whatsappClient.ts`), webhook HTTPS (`POST /api/webhooks/whatsapp`) com
verificação de assinatura HMAC (`webhookSignature.ts`), idempotência por
`whatsapp_webhook_evento` (claim atômico), questionário fechado (RN08),
suporte a template message (abertura fora da janela de 24h) e texto livre
(dentro da janela). Rejeita sticker/reação/áudio/vídeo/emoji isolado como
resposta válida (`isRespostaAceitavelParaPergunta`).

### 1.8 Instagram

Instagram API oficial da Meta ("Instagram API with Instagram Login"),
autorização **por cliente** via OAuth (`backend/src/routes/
instagramOAuth.routes.ts`, tabela `cliente_instagram_conexao`, token cifrado
em repouso via `pgcrypto`). Publicação automática quando conectado; fallback
manual documental sempre disponível (`registrarPublicacaoManual`).

### 1.9 Armazenamento

Supabase Storage, bucket privado `artes` (15 MB, `application/pdf`,
`image/jpeg`, `image/png`), URLs assinadas de curta duração para
download/preview.

### 1.10 Autenticação

Supabase Auth (e-mail/senha) + tabela `usuario` na aplicação vinculada ao
`auth.uid()` (ver ADR 0001). Perfil (`administrador`/`designer`) resolvido
no backend a partir do registro persistido, nunca só por string de e-mail no
frontend (RN50).

### 1.11 Avaliação das artes

Link público com token opaco de 256 bits, hash armazenado (nunca o valor
bruto), expiração e revogação, decisão fechada
(Aprovar/Ajustes/Cancelar) via RPC `submit_avaliacao`.

### 1.12 Versões

Tabela `versao_arte`, número sequencial por solicitação, cada envio novo
gera nova versão (RN26), histórico completo preservado.

### 1.13 Agendamento

Tabela `agendamento_publicacao`, só para solicitação `Aprovado`, cancelamento
restrito a ≥3h antes do horário (`cancel_agendamento`).

### 1.14 Publicação

Tabela `publicacao`, log de toda tentativa (sucesso e falha), job idempotente
(`claim_agendamento_publicacao`), nunca marca sucesso sem confirmação real do
Instagram.

### 1.15 Notificações

WhatsApp (aviso de link de avaliação, aviso "arte publicada", alerta de
cancelamento ao designer) e Web Push (VAPID) para o designer (aviso de
publicação em ~2h). Web Push está implementado e testado, mas **inativo em
produção por falta de par de chaves VAPID configurado**
(`BLOCKED_EXTERNAL_CREDENTIAL`).

### 1.16 IA — efetivamente implementada, escopo restrito

`backend/src/integrations/ai/geminiClient.ts` (Google Gemini, modelo
`gemini-2.5-flash-lite` por padrão). Uso único e específico: classificador
auxiliar de sim/não/indefinido na pergunta de confirmação inicial do
questionário WhatsApp, consultado **somente** quando a regra determinística
por regex não consegue decidir. Nunca muta estado diretamente, nunca tem
acesso a ferramentas/function-calling, saída restrita por schema, fail-closed
em qualquer indisponibilidade. Documentado em `docs/decisions/
0006-ia-classificadora-confirmacao-whatsapp.md`. **Inativo em produção por
falta de `GEMINI_API_KEY`** (`BLOCKED_EXTERNAL_CREDENTIAL`) — código e testes
prontos, sem chamada real à API ainda realizada.

---

## 2. ARQUITETURA

### 2.1 Estilo

Arquitetura cliente-servidor com API REST, backend em camadas
(routes → services → repositories → integrations), banco como segunda
camada de autorização (RLS) além do backend.

### 2.2 Componentes e responsabilidades

- **Frontend (React/Vite, Vercel)**: UI, chamadas HTTP autenticadas
  (`Authorization: Bearer <token Supabase>`), nenhuma regra de negócio.
- **Backend (Express/TS, Vercel Serverless Function)**: validação de entrada
  (Zod), autorização por perfil + ownership, orquestração de integrações
  externas, chamada de RPCs Postgres para operações atômicas.
- **Supabase Postgres**: dados relacionais, RLS, funções `SECURITY DEFINER`
  para operações críticas (evita corrida/duplicidade), pg_cron para jobs
  periódicos.
- **Supabase Auth**: identidade/sessão.
- **Supabase Storage**: arquivos de arte/referência.
- **Integrações externas**: WhatsApp Cloud API, Instagram API (Meta), Gemini
  API (Google), Web Push (VAPID, protocolo aberto).

### 2.3 Comunicação

- Frontend → Backend: HTTPS/JSON, CORS restrito ao domínio do frontend
  (confirmado em produção: `Access-Control-Allow-Origin` ecoa exatamente o
  domínio do frontend, não wildcard).
- Backend → Supabase: `@supabase/supabase-js`, dois clientes — um com token
  do usuário (respeita RLS) e um com service-role (bypassa RLS, só para
  operações já autorizadas no backend).
- Backend → Meta (WhatsApp/Instagram): HTTPS REST, Graph API, timeout
  explícito (`AbortController`).
- Meta → Backend: webhook HTTPS assinado (HMAC SHA-256).
- Supabase (pg_cron) → Backend: HTTPS para endpoints internos protegidos por
  segredo compartilhado (`INTERNAL_JOB_SECRET`, `pg_net`).

### 2.4 Deploy

Vercel (2 projetos separados: `designhub-backend`, `designhub-frontend`,
mesmo time). Backend empacotado como função serverless (`api/index.js`, via
`scripts/build-vercel-function.mjs` + esbuild). Frontend é build estático
Vite (`dist/`) servido pela CDN da Vercel. Supabase Free tier (projeto
`hfwgodzvitinubarwrjm`, região `sa-east-1`, Postgres 17).

### 2.5 Roteiro sugerido para o diagrama de arquitetura

```
[Cliente/Designer/Admin - Navegador]
        |  HTTPS
        v
[Frontend - React/Vite - Vercel CDN]
        |  HTTPS (Bearer token Supabase)
        v
[Backend - Express/TS - Vercel Function]
   |        |         |          |
   v        v         v          v
[Supabase [Supabase [WhatsApp  [Instagram
 Postgres  Storage   Cloud API  API oficial
 + Auth   ]         (Meta)]    (Meta, OAuth
 + RLS +                        por cliente)]
 RPCs +
 pg_cron] -----HTTPS(webhook assinado)-----> [Meta]
   |
   v (pg_net, a cada 5 min)
[Backend /api/internal/* (segredo compartilhado)]

[Backend] --HTTPS--> [Gemini API] (classificador de confirmação, opcional)
[Backend] --Web Push (VAPID)--> [Navegador do designer] (opcional)
```

---

## 3. GERÊNCIA DE PROJETO

- **Git**: histórico linear em `main`, 59 commits, mensagens em português no
  padrão `tipo: descrição` (`feat:`, `fix:`, `chore:`, `docs:`).
- **GitHub**: remoto único `https://github.com/MatheuHen/DesignHub.git`.
- **Monorepo**: workspaces npm (`frontend`, `backend`), scripts raiz agregando
  lint/typecheck/test/build dos dois workspaces (`npm run verify`).
- **Rastreabilidade**: `docs/decisions/` (7 ADRs numerados registrando
  decisões arquiteturais — troca WhatsApp Web→Cloud API, Instagram oficial +
  fallback manual, Supabase Auth x DER, preferência de agendamento, IA);
  `docs/evidencias/CONTROLE_EXECUCAO.md` (checkpoint contínuo de execução,
  3022 linhas, atualizado a cada etapa concluída).
- **Higiene de repositório**: `scripts/preflight.mjs` (script próprio,
  versionado, verifica presença de arquivos obrigatórios do TFC antes de
  considerar o setup válido); `.gitignore` cobrindo `.env`/`.env.*`,
  `node_modules`, builds, caches.
- **Ambientes**: `.env.local` (desenvolvimento, não versionado) + variáveis
  de ambiente do provedor em produção (Vercel).
- **Vercel**: 2 projetos linkados via Vercel CLI (`vercel link`,
  `.vercel/project.json` versionado com IDs, sem segredo), deploy feito via
  `vercel deploy --prod`.
- **Supabase**: projeto único (`hfwgodzvitinubarwrjm`), migrations aplicadas
  via Supabase CLI (`supabase db push --db-url`).
- **Package manager**: npm (workspaces), `package-lock.json` versionado.

---

## 4. TECNOLOGIAS

### TECNOLOGIAS FRONTEND
| Tecnologia | Versão | Função real |
|---|---|---|
| React | ^19.1.1 | Biblioteca de UI |
| React DOM | ^19.1.1 | Renderização web |
| react-router-dom | ^7.18.2 | Roteamento SPA |
| TypeScript | ^5.9.2 | Tipagem estática |
| Vite | ^7.1.2 | Build/dev server |
| @supabase/supabase-js | ^2.112.3 | Cliente Auth (login/sessão) |

### TECNOLOGIAS BACKEND
| Tecnologia | Versão | Função real |
|---|---|---|
| Node.js | 24.x (runtime) | Runtime do backend |
| Express | ^5.1.0 | Framework HTTP/REST |
| TypeScript | ^5.9.2 | Tipagem estática |
| @supabase/supabase-js | ^2.112.3 | Cliente Postgres/Auth/Storage |
| Zod | ^4.0.17 | Validação de schema de entrada |
| cors | ^2.8.5 | Política CORS |
| helmet | ^8.1.0 | Headers de segurança HTTP |
| express-rate-limit | ^8.0.1 | Rate limiting por rota |
| multer | ^2.2.0 | Upload multipart (versões/comprovantes) |
| web-push | ^3.6.7 | Envio de notificações Web Push (VAPID) |
| dotenv | ^17.2.1 | Carregamento de `.env.local` em dev |
| esbuild | ^0.28.2 (dev) | Empacota a função Vercel (`build:vercel-function`) |

### BANCO DE DADOS
PostgreSQL 17 (Supabase), 45 migrations, 18 tabelas, RLS habilitada em todas,
27 funções `SECURITY DEFINER`, 8 triggers, 36 índices, extensões `citext`,
`pgcrypto`, `pg_trgm`, `pg_cron`, `pg_net`.

### AUTENTICAÇÃO
Supabase Auth (e-mail + senha, hash gerenciado pelo subsistema Auth, nunca
duplicado em tabela própria — ver ADR 0001).

### STORAGE
Supabase Storage, bucket privado `artes` (PDF/JPG/PNG, 15 MB).

### WHATSAPP
WhatsApp Cloud API oficial da Meta, Graph API v21.0.

### INSTAGRAM
Instagram API oficial da Meta ("Instagram API with Instagram Login"), OAuth
por cliente.

### IA
Google Gemini (`gemini-2.5-flash-lite`, configurável via env), uso único
como classificador auxiliar de confirmação no WhatsApp — ver seção 1.16.
**Sem chamada real em produção ainda (sem chave configurada).**

### HOSPEDAGEM/DEPLOY
Vercel (2 projetos, plano compatível com uso acadêmico), Supabase Free tier
(`sa-east-1`).

### FERRAMENTAS DE DESENVOLVIMENTO
Git, GitHub, npm workspaces, Supabase CLI (`2.117.0`), Vercel CLI (`52.0.0`
local / `59.23.2` no build remoto).

### FERRAMENTAS DE TESTES
Vitest ^3.2.4 (backend e frontend), Supertest ^7.1.4 (testes de rota HTTP no
backend), @testing-library/react ^16.3.0 + jsdom ^26.1.0 (frontend).

### FERRAMENTAS DE ANÁLISE ESTÁTICA
ESLint ^9.33.0 (flat config, `@eslint/js` + `typescript-eslint` ^8.39.1),
TypeScript compiler (`tsc`) em modo `--noEmit`/`-b` para typecheck e build.

---

## 5. PERSISTÊNCIA

### 5.1 Motor
PostgreSQL 17 via Supabase (`db.hfwgodzvitinubarwrjm.supabase.co`), 45
migrations versionadas em `supabase/migrations/`, aplicadas sequencialmente
por timestamp no nome do arquivo.

### 5.2 Tabelas (18, confirmadas via `CREATE TABLE` nas migrations)
`usuario`, `designer`, `administrador`, `cliente`, `solicitacao`,
`agendamento_publicacao`, `publicacao`, `atendimento`, `resposta_cliente`,
`historico_solicitacao`, `versao_arte`, `avaliacao`, `ajuste` (núcleo do DER
do TFC) + `avaliacao_link_token`, `cliente_instagram_conexao`,
`instagram_oauth_state`, `whatsapp_webhook_evento`, `push_subscription`
(tabelas técnicas de suporte a segurança/idempotência, não substituem
nenhuma entidade do DER).

### 5.3 Integridade
FKs entre todas as entidades relacionadas do DER, `NOT NULL`/`CHECK`
constraints nos enums de status (`solicitacao.status`,
`agendamento_publicacao.status`, `publicacao.status`, `avaliacao.decisao`),
`UNIQUE` em `usuario.email`. 36 índices, incluindo um índice `trgm` para
busca de cliente por nome e um índice parcial para o job de notificação 2h
(`where status = 'Agendado' and notificado_2h = false`).

### 5.4 RLS/Policies
RLS habilitada nas 18 tabelas. 15 `CREATE POLICY` explícitas (leitura
own-or-admin via função `is_admin()`); nenhuma policy de escrita para
`anon`/`authenticated` nas tabelas sensíveis — toda escrita crítica passa
por função `SECURITY DEFINER` chamada pelo backend com service-role, nunca
diretamente pelo cliente autenticado.

### 5.5 Funções/RPCs (27, todas `SECURITY DEFINER`, `search_path` fixo)
Cobrem: criação de solicitação a partir do atendimento
(`complete_atendimento_and_create_solicitacao`), avaliação
(`submit_avaliacao`), agendamento (`create_agendamento`,
`create_agendamento_cliente`, `update_agendamento`, `cancel_agendamento`,
`cancel_agendamento_cliente`), publicação
(`claim_agendamento_publicacao`, `register_publicacao_sucesso`,
`register_publicacao_falha`), cancelamento de solicitação pelo designer
(`cancel_solicitacao_designer`), reatribuição (`reassign_solicitacao`),
bloqueio por atraso (`sync_designer_bloqueio`), idempotência de webhook
(`claim_webhook_evento`, `mark_webhook_evento_concluido`), autorização
(`is_admin`), entre outras.

### 5.6 Triggers (8)
`set_updated_at` em 4 tabelas (`usuario`, `designer`, `cliente`,
`agendamento_publicacao`), cálculo automático de prazo/data (
`solicitacao_set_prazo_primeira_versao`,
`agendamento_publicacao_set_data_hora_publicacao`), validação de domínio
(`ajuste_requer_avaliacao_ajustes` — impede `ajuste` sem `avaliacao` em
status `Ajustes`).

### 5.7 Concorrência/idempotência
Padrão consistente em todo o schema: `SELECT ... FOR UPDATE` antes de
checar/alterar status crítico, `UPDATE ... WHERE <precondição> RETURNING`
para "reivindicar" trabalho exatamente uma vez (jobs de publicação,
notificação, webhook). Testado com casos de concorrência explícitos nos
testes de repositório/serviço do backend.

### 5.8 Jobs periódicos (pg_cron + pg_net)
3 jobs agendados: publicação vencida (`*/5 * * * *`), expiração de
atendimento parado (`*/30 * * * *`), notificação de publicação próxima
(`*/5 * * * *`) — todos chamando endpoints internos HTTPS do backend
protegidos por segredo compartilhado.

### 5.9 Storage
Bucket privado `artes` (Supabase Storage), 15 MB, `application/pdf`,
`image/jpeg`, `image/png`, URLs assinadas de curta duração.

---

## 6. TESTES AUTOMATIZADOS

Resultado real, executado neste levantamento (commit `280fbca`).

### BACKEND
- Framework: Vitest ^3.2.4 + Supertest ^7.1.4 (rotas HTTP).
- Suites: **51**
- Testes: **551**
- Aprovados: **551**
- Falhos: **0**
- Áreas cobertas: schemas (validação Zod), repositórios (queries/RPCs
  mockados), serviços (regras de negócio, máquina de estados, idempotência,
  best-effort de notificação), rotas HTTP via Supertest (autenticação,
  autorização, rate limit, shape de resposta), integrações externas
  mockadas (WhatsApp, Web Push, Gemini), `env.ts` (guardas de produção).

### FRONTEND
- Framework: Vitest ^3.2.4 + @testing-library/react ^16.3.0 + jsdom.
- Suites: **13**
- Testes: **114**
- Aprovados: **114**
- Falhos: **0**
- Áreas cobertas: páginas principais (Dashboard, Designers, Clientes,
  Solicitações, Avaliação, Agendamentos), componentes (`FilePreviewPicker`,
  `PasswordInput`, `NotificationsCta`), fluxo de autenticação
  (login/recuperação de senha), roteamento/proteção de rota (`App.test.tsx`).

### Outros testes existentes (evidenciados no código)
- **Integração/API (backend)**: 13 arquivos de teste usam Supertest contra
  `createApp()` real (rotas montadas, middlewares aplicados), não só
  unidade isolada.
- **RLS/banco**: não há suíte automatizada de RLS rodando contra banco real
  neste repositório (RLS é validada por leitura/revisão de migration, não
  por teste automatizado executável); *pendência real* se o capítulo exigir
  evidência de teste automatizado de RLS.
- **Segurança**: revisão manual/por subagente registrada em
  `docs/evidencias/CONTROLE_EXECUCAO.md` (não é suíte automatizada
  separada; achados de autorização/IDOR cobertos indiretamente pelos testes
  de rota que verificam 401/403).
- **E2E (ponta a ponta, navegador real)**: não há suíte E2E automatizada
  (ex. Playwright/Cypress) no repositório — os "testes de integração" são
  no nível de API (Supertest) e componente (Testing Library), não
  navegação real ponta a ponta.
- **Meta (WhatsApp/Instagram)**: sem testes automatizados contra a API real
  da Meta (uso de mocks); verificação real foi manual, registrada em
  `docs/decisions/meta-whatsapp-templates-business-initiated.md`.
- **Smoke test de produção**: executado manualmente via `curl` contra as
  URLs de produção após o deploy (health check, rotas protegidas, CORS,
  headers, rota pública de avaliação com token inválido) — registrado em
  `docs/evidencias/CONTROLE_EXECUCAO.md`, não é uma suíte automatizada
  versionada.

---

## 7. ANÁLISE ESTÁTICA

Resultado real, executado neste levantamento.

| Verificação | Comando | Resultado |
|---|---|---|
| ESLint backend | `eslint . --max-warnings=0` | **0 erros, 0 warnings** |
| ESLint frontend | `eslint . --max-warnings=0` | **0 erros, 0 warnings** |
| TypeScript typecheck backend | `tsc -p tsconfig.json --noEmit` | **0 erros** |
| TypeScript typecheck/build frontend | `tsc -b` (parte do build) | **0 erros** |
| Build backend | `tsc -p tsconfig.json` | **sucesso** |
| Build frontend | `tsc -b && vite build` | **sucesso** (bundle gerado, ~317 kB JS principal + ~217 kB chunk Supabase, gzip ~95 kB + ~57 kB) |

### Problema real encontrado e corrigido (exemplo acadêmico válido)
Durante a regressão final, `npx tsc --noEmit` isolado no frontend **não
detectou** um erro de tipo real porque o projeto usa TypeScript project
references (`tsc -b`) — rodar `tsc --noEmit` fora do modo `-b` não checa
nada em um tsconfig "solution-style". O erro real só apareceu no
`npm run build` (`tsc -b && vite build`): `Uint8Array<ArrayBufferLike>` não
compatível com o tipo `BufferSource` exigido por `applicationServerKey` do
Web Push (TypeScript 5.9 tipa `Uint8Array` como genérico sobre o buffer).
Corrigido anotando o retorno da função como `Uint8Array<ArrayBuffer>`
(`frontend/src/features/designer/notifications/webPush.ts`). Boa
ilustração para o TFC de por que "typecheck passou" isoladamente não é
suficiente — o build real (`-b`) é a checagem autoritativa em projetos com
project references.

### ESLint — achados relevantes corrigidos ao longo do desenvolvimento
- `@typescript-eslint/no-misused-promises` (handler `onClick` async sem
  wrapper) — padrão do projeto: `onClick={() => void handler()}`.
- `@typescript-eslint/require-await` em mock de teste (`json: async () =>
  ({...})` sem `await` interno) — corrigido para `json: () =>
  Promise.resolve({...})`.

---

## 8. PRINTS PARA O TFC

| # | Nome sugerido | O que deve aparecer | Onde capturar | O que NÃO deve aparecer |
|---|---|---|---|---|
| 1 | `figura_arquitetura_geral` | Diagrama de arquitetura (frontend/backend/Supabase/Meta/Vercel) | Diagrama desenhado a partir da seção 2.5 deste dossiê | — |
| 2 | `figura_estrutura_monorepo` | Árvore de pastas `frontend/`, `backend/`, `supabase/`, `docs/` | Explorador de arquivos do editor | Conteúdo de `.env.local` |
| 3 | `figura_testes_backend` | Saída do terminal com `npx vitest run` no backend mostrando "51 passed / 551 passed" | Terminal, após `cd backend && npx vitest run` | Caminhos absolutos do usuário no header do terminal, se sensíveis |
| 4 | `figura_testes_frontend` | Saída do terminal com `npx vitest run` no frontend mostrando "13 passed / 114 passed" | Terminal, após `cd frontend && npx vitest run` | Idem acima |
| 5 | `figura_lint_typecheck_backend` | Saída limpa de `npm run lint` e `npm run typecheck` no backend (sem erros) | Terminal | — |
| 6 | `figura_lint_typecheck_frontend` | Saída limpa de `npm run lint` e `npm run build` (typecheck+build) no frontend | Terminal | — |
| 7 | `figura_build_backend` | Saída de `npm run build` no backend | Terminal | — |
| 8 | `figura_build_frontend` | Saída de `npm run build` no frontend com tamanho dos bundles | Terminal | — |
| 9 | `figura_migrations_supabase` | Lista de migrations aplicadas (`supabase migration list`) mostrando local=remote sincronizado | Terminal (sem expor a connection string usada) | `SUPABASE_DB_URL`, qualquer token |
| 10 | `figura_tabelas_supabase` | Lista de tabelas do schema `public` no Dashboard do Supabase (Table Editor) | Dashboard Supabase → Table Editor | Chaves de API visíveis na URL/topo da página |
| 11 | `figura_rls_policies` | Policies de RLS de uma tabela (ex. `solicitacao`) no Dashboard | Dashboard Supabase → Authentication/Policies | — |
| 12 | `figura_deploy_vercel` | Painel do projeto `designhub-backend` e `designhub-frontend` no Vercel mostrando deployment `Ready`/`Production` | Dashboard Vercel | Variáveis de ambiente (não abrir a aba Env Vars) |
| 13 | `figura_producao_home` | Tela inicial do sistema em produção (login) | `https://designhub-frontend-ten.vercel.app` | — |
| 14 | `figura_producao_health` | Resposta JSON de `GET /api/health` em produção | Navegador/curl contra `https://designhub-backend.vercel.app/api/health` | — |

---

## 9. TELAS ATUAIS PARA O MANUAL DO USUÁRIO (4.2 — não escrever ainda)

### ADMINISTRADOR
- Login (`/login`)
- Dashboard do Administrador (`/admin`, `AdminHome.tsx`)
- Listagem/gestão de Designers (`/admin/designers`, `DesignersPage.tsx`)
- Formulário de Designer — criar/editar (`DesignerFormPanel.tsx`)
- Detalhe de solicitação (visão somente leitura, admin) (`/admin/solicitacoes/:id`,
  `AdminSolicitacaoDetailPage.tsx`)

### DESIGNER
- Login (`/login`)
- Esqueci minha senha (`/esqueci-senha`, `ForgotPasswordPage.tsx`)
- Redefinir senha (`/redefinir-senha`, `ResetPasswordPage.tsx`)
- Dashboard do Designer (`/designer`, `DesignerHome.tsx`) — inclui tiles por
  status, avisos de prazo, seção de publicações agendadas, botão de
  notificações
- Listagem/gestão de Clientes (`/designer/clientes`, `ClientesPage.tsx`)
- Formulário de Cliente — criar/editar + conectar Instagram
  (`ClienteFormPanel.tsx`)
- Listagem de Solicitações (`/designer/solicitacoes`, `SolicitacoesPage.tsx`)
- Detalhe de Solicitação (`/designer/solicitacoes/:id`,
  `SolicitacaoDetailPage.tsx`) — upload de versão, histórico, agendamento,
  publicação manual, comprovante, cancelamento
- Listagem de Agendamentos (`/designer/agendamentos`,
  `AgendamentosPage.tsx`)

### CLIENTE/LINK PÚBLICO
- Página de Avaliação da Arte (`/avaliacao/:token`, `AvaliacaoPage.tsx`) —
  visualização da arte, Aprovar/Ajustes/Cancelar, escolha de opção de
  publicação, agendamento (data/horário/legenda)
- Tela de link inválido/expirado (estado dentro da própria `AvaliacaoPage`)

### WHATSAPP
- Mensagem de abertura do atendimento (template aprovado, cita o nome do
  designer)
- Sequência de perguntas do questionário (confirmação, tema, cores,
  observações, referência)
- Mensagens de erro/esclarecimento (tipo de mensagem não suportado,
  confirmação ambígua)
- Fluxo de cancelamento pelo cliente (pedido + confirmação)
- Aviso de nova versão disponível para avaliação (link)
- Aviso de arte publicada

---

## 10. CONSIDERAÇÕES / TRABALHOS FUTUROS (fatos, não conclusão final)

### Objetivo alcançado (evidência objetiva)
Todos os RF001-RF016 têm rota/serviço/tela correspondente identificável no
código; máquina de estados oficial (7 estados) implementada em RPC única
(`backend/src/lib/statusTransitions.ts` documenta as transições válidas);
deploy de produção funcional e verificado por smoke test.

### Dificuldades reais (evidenciadas no processo)
- Divergência entre DER (exige `usuario.senha_hash`) e Supabase Auth
  (gerencia credencial internamente) — resolvida e documentada em ADR 0001,
  sem duplicar segredo.
- `tsc --noEmit` isolado não detecta erros em projeto com TypeScript
  project references — só `tsc -b`/`npm run build` é autoritativo (achado
  desta rodada, seção 7).
- Publicação automática no Instagram depende de token por cliente (não uma
  conta global) — exigiu ADR próprio (0005) e tabela dedicada
  (`cliente_instagram_conexao`) para corrigir um desenho inicial que
  usava uma única conta de teste para todos os clientes.

### Limitações reais
- Web Push implementado mas inativo em produção (falta gerar par de chaves
  VAPID).
- Classificador de IA implementado mas inativo em produção (falta gerar
  chave Gemini).
- Sem suíte E2E automatizada (Playwright/Cypress) — testes de integração
  ficam no nível de API (Supertest) e componente (Testing Library).
- Sem teste automatizado de RLS contra banco real (RLS revisada por leitura
  de migration, não por suíte executável).
- Publicação automática no Instagram depende de o cliente ter concluído o
  OAuth — sem isso, sistema usa o caminho manual (comportamento
  documentado, não é falha).

### Integrações externas (status real neste commit)
- WhatsApp Cloud API — configurada e ativa em produção
  (`whatsappSendingClient`/`whatsappWebhookSecurity` = `configured`).
- Instagram API — código pronto (OAuth por cliente); depende de cada
  cliente conectar sua própria conta.
- Supabase (Postgres/Auth/Storage) — configurada e ativa em produção.
- Web Push — código pronto, `BLOCKED_EXTERNAL_CREDENTIAL`.
- Gemini (IA) — código pronto, `BLOCKED_EXTERNAL_CREDENTIAL`.

### Possíveis trabalhos futuros já documentados no código/ADRs
- Ativar Web Push em produção (gerar chaves VAPID).
- Ativar classificador de IA em produção (gerar `GEMINI_API_KEY`).
- Confirmar `INTERNAL_JOB_SECRET` configurado no ambiente de produção do
  Vercel (não verificável remotamente sem acesso de leitura ao painel de
  variáveis).
- Paralelizar consultas do job de notificação de publicação próxima
  (achado de performance MEDIUM, registrado como melhoria de baixo risco,
  não implementado por volume real de uso ser baixo).

---

## RESUMO FINAL

STACK FINAL: React 19 + TypeScript + Vite (frontend) · Node.js 24 + Express 5 + TypeScript (backend) · PostgreSQL 17/Supabase (banco, Auth, Storage) · WhatsApp Cloud API + Instagram API oficiais da Meta · Google Gemini (IA auxiliar, inativa) · Vercel (deploy).

ARQUITETURA: Cliente-servidor REST em camadas (routes→services→repositories→integrations) no backend, SPA React no frontend, Postgres com RLS como segunda camada de autorização, jobs periódicos via pg_cron/pg_net chamando endpoints internos protegidos.

BANCO: PostgreSQL 17, 45 migrations, 18 tabelas (13 do DER + 5 técnicas), RLS em 100% das tabelas, 27 funções `SECURITY DEFINER`, 8 triggers, 36 índices, 3 jobs pg_cron.

TOTAL TESTES: Backend 551/551 (51 suites) · Frontend 114/114 (13 suites) · 665 testes automatizados no total, 0 falhas.

ANÁLISE ESTÁTICA: ESLint 0 erros/0 warnings (backend e frontend) · TypeScript 0 erros (backend `tsc --noEmit`, frontend `tsc -b`) · Build backend e frontend com sucesso.

DEPLOY: Vercel — `designhub-backend` e `designhub-frontend`, ambos `READY`/`Production`; Supabase Free (`sa-east-1`) com as 45 migrations aplicadas e sincronizadas.

PRINTS NECESSÁRIOS: 14 (arquitetura, estrutura, testes ×2, lint/typecheck ×2, build ×2, migrations, tabelas, RLS, deploy Vercel, produção ×2) — lista completa na seção 8.

TELAS PARA MANUAL: 5 (Administrador) + 8 (Designer) + 2 (Cliente/link público) + 6 (WhatsApp) — lista completa na seção 9.

PENDÊNCIAS/BLOCKED_EXTERNAL: `GEMINI_API_KEY` ausente (IA inativa) · chaves VAPID ausentes (Web Push inativo) · `INTERNAL_JOB_SECRET` em produção não verificável remotamente · sem suíte E2E automatizada · sem teste automatizado de RLS contra banco real.

COMMIT ANALISADO: `280fbca64f629343a2a37c7a2a4fed8f6230ddfa` (main, 2026-09-22).
