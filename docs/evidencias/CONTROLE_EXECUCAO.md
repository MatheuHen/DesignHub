# DesignHub — Controle de execução autônoma

Este arquivo e o checkpoint persistente da execucao do desenvolvimento.

Este arquivo deve ser atualizado ao final de cada etapa.

- data/hora;
- fase atual e última fase aprovada;
- RF/RN/RNF trabalhados;
- arquivos/migrations alterados;
- validações executadas e resultado;
- CRITICAL/HIGH/MEDIUM/LOW pendentes;
- bloqueios externos;
- próxima etapa exata;
- último commit/estado do Git, quando aplicável.

## Estado inicial

- Fase: preparação técnica da raiz.
- Implementação de RFs: ainda não declarada.
- `.env.local`: será fornecido localmente pelo usuário e nunca versionado.
- Próximo passo: BOOT/AUDITORIA conforme `PROMPT_AUTONOMO_DESIGNHUB.txt`.

## 2026-08-16 — BOOT/AUDITORIA + Fase 1 concluída

- Auditoria inicial: monorepo (`frontend`+`backend` via npm workspaces), TS estrito,
  ESLint `recommendedTypeChecked`, Vitest, `helmet`+`cors`+`rate-limit`+`/api/health`
  já existentes (Fase 1 parcial herdada de sessão anterior). Nenhuma migration, RLS,
  autenticação, RF de negócio ou integração Meta implementados ainda.
- `.env.local` confirmado ignorado pelo Git (`git check-ignore -v`). Contém apenas
  `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (convenção
  diferente da canônica do projeto, que usa `VITE_`/`SUPABASE_`). Nenhuma
  `SUPABASE_SERVICE_ROLE_KEY` e nenhuma credencial Meta (WhatsApp/Instagram) fornecida.
- **Fase 1 concluída**: adicionado cliente Supabase no backend
  (`backend/src/config/supabase.ts`, público + admin condicional) e no frontend
  (`frontend/src/lib/supabaseClient.ts`), com fallback de leitura para as chaves
  `NEXT_PUBLIC_*` já presentes localmente (sem duplicar valores em arquivo, sem
  alterar `.env.example`). `envPrefix` do Vite ampliado para `NEXT_PUBLIC_` apenas
  para o par URL/publishable key (dado publicável por natureza). `/api/health`
  agora reporta status de configuração das dependências sem expor valores.
  Corrigido `vite.config.ts` para carregar `test.environment = 'jsdom'` (bug
  pré-existente que quebrava `npm run test` no frontend).
- Validações executadas: `npm run lint`, `npm run typecheck`, `npm run test`,
  `npm run build` — todos passando nos dois workspaces. Smoke test manual de
  `GET /api/health` confirmou `supabasePublicClient: "configured"` e
  `supabaseAdminClient: "missing"`.
- **BLOCKED_EXTERNAL_CREDENTIAL**: `SUPABASE_SERVICE_ROLE_KEY` ausente — bloqueia
  operações administrativas server-only que dependem de service role (ex.:
  Supabase Auth Admin API para criação de designers/admin na Fase 3/4). Trabalho
  independente continua.
- **BLOCKED_EXTERNAL**: nenhuma credencial Meta (WhatsApp Cloud API / Instagram API)
  fornecida em `.env.local`. Fases 6 e 12 (integrações reais) ficarão bloqueadas
  até credenciais serem configuradas; os adapters/fallback manual serão
  implementados de forma que a ausência de credencial não simule sucesso.
- Próxima etapa: Fase 2 — ADR Supabase Auth x DER + migrations completas do DER
  (RN01-RN51 relevantes, estados RN39, RLS, Storage).

## 2026-08-16 — Fase 2 concluída (banco e integridade)

- ADR `docs/decisions/0001-supabase-auth-vs-der.md`: `usuario.id_usuario` é
  `uuid` (FK `auth.users`), sem coluna física `senha_hash` (delegada ao
  Supabase Auth); demais entidades mantêm PK `bigint generated always as
  identity`, fiéis ao DER.
- 10 migrations criadas em `supabase/migrations/` cobrindo as 13 tabelas de
  negócio do DER (seção 9 do CLAUDE.md), RN39 (7 estados exatos),
  RN23 (PDF/JPG/PNG), RN11 (prazo +5 dias via coluna gerada), RLS habilitada
  em todas as tabelas com policies de SELECT por ownership/admin
  (`public.is_admin()`), e bucket privado `artes` no Storage.
- Revisão: subagente `designhub-database-reviewer` (leitura estática, sem
  CRITICAL). Achados HIGH corrigidos diretamente nos arquivos (ainda não
  aplicados a nenhum banco real):
  - H1: índice único parcial `publicacao_unica_sucesso_idx` (idempotência de
    publicação, Gate G/seção 12.4).
  - H2: índice único parcial `agendamento_ativo_unico_idx` (no máx. 1
    agendamento ativo por solicitação, RF012/RN30).
  - MEDIUM corrigidos: `avaliacao` unique(id_versao) (M1); unique parcial
    `atendimento_ativo_unico_idx` (M2); CHECK
    `publicacao_sucesso_tem_data` (M3); extensões `pgcrypto`/`citext`
    movidas para schema `extensions` (M4); trigger
    `ajuste_requer_avaliacao_ajustes` garantindo `avaliacao.decisao =
    'Ajustes'` (M7).
  - LOW corrigido: `search_path` fixo em `set_updated_at()` (L1).
  - M5 (convenção created_at/updated_at) e M6 (como registrar reatribuição
    de designer no campo `acao`, já que o DER não reserva coluna própria)
    documentados via comentário nas migrations — sem mudança de schema.
  - L2 (índice em `historico_solicitacao.id_usuario`) e L3 (unicidade
    whatsapp+designer) registrados como baixo risco, deferidos para revisão
    de performance (Fase Gate F) e para a validação de aplicação da Fase 5,
    respectivamente — não bloqueiam a fase.
- **BLOCKED_EXTERNAL**: migrations NÃO aplicadas a nenhum banco real. Sem
  `supabase` CLI/`psql`/Docker localmente e sem acesso, via MCP Supabase, ao
  projeto real do DesignHub (ref `hfwgodzvitinubarwrjm`) — a conta MCP
  conectada só enxerga 3 projetos não relacionados
  (`appcontroledevidaxen`, `Divertex`, `DocesMeM`), que não podem ser usados
  por isolamento de projeto. Ação necessária do usuário: aplicar as
  migrations via `supabase db push`/SQL Editor no projeto correto, ou
  conceder acesso MCP à organização correta.
- Próxima etapa: Fase 3 — RF002 Autenticação e autorização.

## 2026-08-16 — Fase 3 concluída (RF002 autenticação e autorização)

- Modelo: login (e-mail+senha) e recuperação de senha acontecem 100% no
  frontend via Supabase Auth (`supabase-js`), sem tocar o backend — nunca há
  senha em texto puro no Express (RNF007). O backend só entra depois: recebe
  o JWT (`Authorization: Bearer`), valida via `auth.getUser(token)`
  (`backend/src/middleware/auth.ts` — `requireAuth`), busca perfil em
  `public.usuario` com um cliente escopado ao token do próprio usuário
  (`attachProfile`, RLS `id_usuario = auth.uid()`, sem service role), e
  `requireProfile(...)` autoriza por perfil no servidor (RN50/RN51/12.1) —
  nunca por perfil/ID enviado pelo cliente.
- Rota `GET /api/auth/me` devolve perfil (nunca credencial) para o frontend
  decidir o direcionamento Designer x Administrador.
- Frontend: `AuthProvider`/`useAuth`, `LoginPage`, `ForgotPasswordPage`,
  `ResetPasswordPage`, `ProtectedRoute` (checagem de perfil é só UX — a
  autorização real é sempre no backend), `RootRedirect`, e placeholders
  `DesignerHome`/`AdminHome` (telas reais chegam nas Fases 4/5+). Roteamento
  via `react-router-dom` (nova dependência necessária para "rotas
  autenticadas por perfil", seção 11).
- Revisão: subagente `designhub-security-reviewer` — 0 CRITICAL, 0 HIGH.
  MEDIUM M1 (`trust proxy` do Express não configurado) é problema de deploy
  atrás de proxy reverso — registrado como pendência da **Fase 16**, não
  bloqueia esta fase (ainda não há proxy em dev). MEDIUM M2 ("ausência de
  testes de autorização negativa") era falso positivo — `busca do subagente
  não encontrou `backend/src/middleware/auth.test.ts`, que já existe com 10
  testes cobrindo exatamente esses cenários (sem token → 401; header sem
  Bearer → 401; Supabase Auth retorna erro → 401; token válido → popula
  `request.auth`; sem `request.auth` → 401; sem linha em `usuario` → 403
  `PROFILE_NOT_FOUND`; `status=inativo` → 403 `PROFILE_INACTIVE`; válido →
  popula `request.profile`; `requireProfile` nega perfil errado e permite o
  correto) — confirmado rodando `vitest run` (10/10 verdes). LOW L1-L4
  aceitos conforme justificativa do próprio revisor (rate limit
  compartilhado aceitável nesta fase; sessão em localStorage é risco
  residual arquitetural já coberto pelo ADR 0001; healthcheck expõe apenas
  booleano de configuração, não segredo; diferenciação 401 x 403 é
  informação mínima pós-autenticação).
- Validações: `npm run lint`, `npm run typecheck`, `npm run test` (15/15
  testes, frontend+backend), `npm run build` — todos verdes na raiz do
  monorepo. Smoke test manual: `GET /api/auth/me` sem token → 401; com
  token inválido → 401 (validado contra o Supabase Auth real do projeto,
  via `.env.local`); `GET /api/health` inalterado.
- **BLOCKED_EXTERNAL_CREDENTIAL** (herdado da Fase 1, ainda vale): sem
  `SUPABASE_SERVICE_ROLE_KEY`, a criação de usuários Auth (designer/admin)
  na Fase 4 não pode ser testada ponta a ponta com uma conta real nesta
  sessão — o serviço será implementado mesmo assim, e o teste real fica
  pendente até a credencial existir.
- Pendência registrada para a Fase 16: `app.set('trust proxy', ...)` no
  Express antes do deploy atrás de proxy reverso (evita que o rate limit
  global vire uma negação de serviço compartilhada entre todos os usuários).
- Próxima etapa: Fase 4 — RF001/RF015/RF016 Designers e administração.

## 2026-08-16 — Fase 4 concluída (RF001/RF015/RF016 Designers e administração)

- Backend: `backend/src/lib/errors.ts` (novas classes `AppError`/`ConflictError`/
  `NotFoundError`/`ValidationError`/`BlockedExternalCredentialError` + helper
  `toAppError`), `error-handler.ts` agora responde com o status/código
  corretos por tipo de erro. CRUD completo de designers
  (`schemas/designer.schemas.ts`, `repositories/designer.repository.ts`,
  `services/designer.service.ts`, `routes/designer.routes.ts`) e reatribuição
  de solicitação (`repositories/solicitacao.repository.ts`,
  `routes/solicitacao.routes.ts`) — todos exclusivos de perfil administrador
  (`requireProfile('administrador')`). Leitura via cliente escopado ao token
  do admin (RLS `is_admin()`); toda escrita via service role.
- Banco: `supabase/migrations/20260816130000_reassign_solicitacao_function.sql`
  (RPC `reassign_solicitacao`, SECURITY DEFINER, atômica: `solicitacao.id_designer`
  + `historico_solicitacao` numa transação, com `select ... for update`) e
  `20260816130100_create_designer_profile_function.sql` (RPC
  `create_designer_profile`, atômica: `usuario` + `designer` num único INSERT
  transacional).
- Revisão: subagentes `designhub-database-reviewer` e `designhub-security-reviewer`
  em paralelo.
  - **CRITICAL corrigido**: `revoke all ... from public` na função
    `reassign_solicitacao` **não** era suficiente — projetos Supabase concedem
    `EXECUTE` diretamente a `anon`/`authenticated` via `ALTER DEFAULT
    PRIVILEGES` no bootstrap da plataforma, então `REVOKE ... FROM PUBLIC`
    sozinho não removia esse grant direto. Qualquer designer autenticado
    poderia, em tese, chamar `/rpc/reassign_solicitacao` diretamente e
    reatribuir qualquer solicitação, ignorando a checagem de perfil
    administrador do backend. Corrigido adicionando
    `revoke all ... from anon, authenticated` explicitamente em **ambas** as
    funções RPC desta fase.
  - **MEDIUM corrigidos**:
    - Integridade do texto de auditoria sob concorrência + ausência de
      checagem "designer ativo" dentro da própria função `reassign_solicitacao`
      → função redesenhada para derivar nomes do designer anterior/novo e
      validar `status='ativo'` do designer de destino inteiramente dentro da
      transação (sob `for update`), em vez de confiar em parâmetros de texto
      enviados pelo backend.
    - Criação de designer não era atômica (convite Auth + 2 INSERTs
      separados podiam deixar perfil órfão) → agrupados em
      `create_designer_profile` (RPC atômica) e `createDesigner` agora
      compensa com `auth.admin.deleteUser` se a criação do perfil falhar
      depois do convite já emitido.
  - **LOW corrigidos**: `escapeIlikeTerm` agora também escapa `(`/`)`
    (evita quebrar o parser de filtro do PostgREST); `:id` das rotas de
    designer agora é validado como UUID (`designerIdParamSchema`) antes de
    qualquer query, retornando 400 em vez de 500 para IDs malformados.
  - LOW/INFO restantes (perda de visibilidade RLS do designer anterior após
    reatribuição; grants futuros exigirem repetir revoke/grant se a função
    for recriada com `DROP+CREATE`) são comportamento esperado/nota de
    manutenção, sem ação de código necessária.
- Frontend: `frontend/src/lib/apiClient.ts` (fetch autenticado com JWT da
  sessão), `frontend/src/features/admin/designers/*` (listagem com busca/
  filtro por status, criação, edição, ativar/inativar, exclusão com
  confirmação em duas etapas e exibição do erro do backend quando há
  impedimento histórico), rota aninhada `/admin/designers` em `AppRouter.tsx`.
  UI de reatribuição (RF016) fica para a Fase 7, quando existir a listagem
  de solicitações necessária para selecionar o alvo — o endpoint de backend
  já está pronto e testado.
- Validações: `npm run lint`, `npm run typecheck`, `npm run test` (26 testes
  backend + 9 frontend = 35), `npm run build` — todos verdes. Testes cobrem
  autorização negativa (designer tentando acessar `/api/designers` → 403),
  impedimento histórico na exclusão (FK → 409 amigável), regra "não pode
  reatribuir para o mesmo designer", "designer de destino precisa estar
  ativo", e compensação de criação de designer.
- **BLOCKED_EXTERNAL_CREDENTIAL**: sem `SUPABASE_SERVICE_ROLE_KEY`, nenhuma
  operação de escrita desta fase (criar/editar/inativar/excluir designer,
  reatribuir solicitação) pôde ser exercitada ponta a ponta contra um banco
  real nesta sessão — toda a lógica está implementada e coberta por testes
  unitários/integração com mocks; falta validação end-to-end quando a
  credencial e o acesso ao projeto Supabase real estiverem disponíveis.
- Próxima etapa: Fase 5 — RF003 Clientes.

## 2026-08-16 — Fase 5 concluída (RF003 Clientes)

- Backend: `schemas/cliente.schemas.ts`, `repositories/cliente.repository.ts`,
  `services/cliente.service.ts`, `routes/cliente.routes.ts` (montado em
  `/api/clientes`, exclusivo de perfil `designer`). Padrão de ownership:
  leitura via cliente escopado ao token do designer (RLS `id_designer =
  auth.uid()`, já existente desde a Fase 2) prova a posse antes de qualquer
  escrita via service role.
- Revisão: subagente `designhub-security-reviewer` (0 CRITICAL, 0 HIGH).
  Nenhuma revisão de banco foi disparada nesta fase porque não houve
  migration/SQL/RLS/trigger novos — RF003 reaproveita a tabela `cliente` e
  as policies já auditadas na Fase 2.
  - **MEDIUM corrigido**: as queries de UPDATE/DELETE via service role
    filtravam só por `id_cliente`, dependendo inteiramente do pré-check de
    ownership feito antes (nenhuma trava independente no banco, já que
    `cliente` não tem policy de escrita para `authenticated`). Corrigido
    adicionando `.eq('id_designer', idDesigner)` a ambas as queries e
    verificando que exatamente uma linha foi afetada (senão
    `NotFoundError`) — defesa em profundidade contra uma futura regressão
    que chamasse o repository sem passar pelo `assertOwnedCliente`.
  - LOW registrados sem ação necessária: `escapeIlikeTerm` não escapa `_`
    (wildcard de um caractere do LIKE) — resultado ainda fica restrito pela
    RLS ao próprio designer, não é vetor de segurança; schemas usam modo
    "strip" do Zod em vez de `.strict()` — descarta campos desconhecidos
    silenciosamente em vez de rejeitar com 400, aceitável mas registrado
    como possível refinamento de contrato de API para fases futuras.
- Frontend: `frontend/src/features/designer/clientes/*` (listagem com
  busca, criação, edição, exclusão com confirmação e exibição do erro de
  impedimento histórico), rota aninhada `/designer/clientes`.
- Validações: `npm run lint`, `npm run typecheck`, `npm run test` (38
  testes backend + 13 frontend = 51), `npm run build` — todos verdes.
  Testes cobrem autorização negativa (admin tentando acessar
  `/api/clientes` → 403), ownership negativo (cliente de outro designer →
  404 uniforme, sem vazar se o ID existe), impedimento histórico na
  exclusão (FK → 409 amigável).
- **BLOCKED_EXTERNAL_CREDENTIAL** (mesma causa das fases anteriores): sem
  `SUPABASE_SERVICE_ROLE_KEY`, a escrita real (criar/editar/excluir
  cliente) não pôde ser exercitada ponta a ponta contra um banco real
  nesta sessão.
- Próxima etapa: Fase 6 — RF004 WhatsApp Cloud API e coleta inicial
  (bloqueada para testes reais por falta de credenciais Meta — implementar
  adapter/webhook/máquina de perguntas mesmo assim, registrando
  `BLOCKED_EXTERNAL` para a parte que depende da API oficial).

## 2026-08-16 — Fase 6 concluída (RF004 WhatsApp Cloud API e coleta inicial)

- Adapter oficial: `backend/src/integrations/whatsapp/whatsappClient.ts`
  (`sendTextMessage`, timeout 10s) e `webhookSignature.ts` (verificação
  HMAC-SHA256 do `X-Hub-Signature-256` com `timingSafeEqual`, handshake do
  `hub.verify_token`). Nunca usa automação não oficial (seção 2.1).
- Webhook público: `POST/GET /api/webhooks/whatsapp`
  (`backend/src/routes/whatsapp.routes.ts`) — única rota do sistema sem
  JWT; segurança inteiramente via assinatura HMAC + idempotência
  (`whatsapp_webhook_evento`, dedup por `wamid`). Corpo bruto capturado via
  `verify` do `express.json()` (`app.ts`) para validar a assinatura antes
  de processar.
- Máquina de perguntas (RN08): `atendimentoQuestions.ts` (confirmação,
  tema, cores, observações, referência — ordem fixa, índice = contagem de
  `resposta_cliente` já registradas, sem estado adicional). `POST
  /api/clientes/:id/atendimentos` (designer autenticado, ownership via
  RLS) inicia o atendimento e envia a 1ª pergunta; compensa removendo o
  atendimento se o envio falhar. `atendimento.service.ts` processa
  respostas recebidas, envia a próxima pergunta e, ao concluir a última,
  chama a RPC atômica `complete_atendimento_and_create_solicitacao`
  (cria `solicitacao` + atualiza `atendimento` + grava
  `historico_solicitacao` numa transação) — é aqui que a solicitação nasce
  (RN03), antecipando minimamente parte de RF005 que a Fase 7 vai expandir
  com CRUD/listagem completos.
- Migrations: `20260816140000_whatsapp_atendimento_functions.sql`
  (tabela `whatsapp_webhook_evento`, funções `complete_atendimento_and_create_solicitacao`
  e `expire_stale_atendimentos`, ambas SECURITY DEFINER com
  `revoke`/`grant` seguindo o padrão anti-CRITICAL da Fase 4).
- Revisão: subagentes `designhub-database-reviewer` e
  `designhub-security-reviewer` em paralelo. 0 CRITICAL, 0 HIGH.
  - **MEDIUM corrigido (banco)**: `historico_solicitacao.id_usuario`
    estava sendo preenchido com o designer numa transição do ator Serviço
    Automático (RF011), contrariando a convenção já documentada no
    schema (`id_usuario` nulo para transições automáticas) — corrigido
    para `null` na migration.
  - **MEDIUM corrigidos (segurança)**: (1) falha no envio da próxima
    pergunta/mensagem de fechamento não deve derrubar o processamento do
    webhook nem ficar "presa" pela idempotência já marcada — agora
    `sendTextMessageBestEffort` captura e loga o erro (sem PII completa)
    sem propagar, então a ingestão da resposta do cliente nunca é perdida
    por falha de saída; (2) corrida entre duas mensagens distintas do
    mesmo atendimento podia gravar duas respostas para a mesma pergunta —
    corrigido com índice único `(id_atendimento, pergunta)` em
    `resposta_cliente` + `insertResposta` tratando violação como "outra
    requisição já venceu, não repetir efeito colateral"; (3) limite
    global de payload JSON reduzido de 1mb para 256kb (nenhuma rota atual
    precisa de payload grande; uploads da Fase 8 usarão outro mecanismo) +
    limites de tamanho/quantidade nos arrays do schema do webhook.
  - **LOW corrigidos**: erro de validação (Zod) do payload do webhook
    agora vira 400 em vez de 500 (`toAppError`); `cliente.whatsapp` agora
    exige ao menos 10 dígitos (código do país incluído), evitando perda
    silenciosa de resposta por descasamento de DDI entre o que o designer
    cadastrou e o que a Meta envia em `from`.
  - LOW/MEDIUM registrados sem ação de código: `solicitacao.descricao`
    permanece `NULL` neste fluxo — RN08 não inclui pergunta de
    "descrição" e RF005 enumera exatamente tema/cores/observações/
    referências; documentado em comentário na migration, preenchimento
    fica para edição posterior do designer (Fase 7).
- Frontend: botão "Iniciar atendimento" por linha em `ClientesPage.tsx`
  (`frontend/src/features/designer/clientes/api.ts`), com feedback de
  sucesso/erro por cliente (incluindo o 409 de atendimento já em
  andamento).
- Validações: `npm run lint`, `npm run typecheck`, `npm run test` (67
  testes backend + 15 frontend = 82), `npm run build` — todos verdes.
  Testes cobrem verificação de assinatura HMAC (válida/inválida/adulterada/
  ausente), handshake do webhook, idempotência de reentrega, RN05 (timeout
  de 2 dias), progressão do questionário, conclusão + criação de
  solicitação, corrida entre respostas concorrentes, e resiliência a falha
  de envio de saída.
- **BLOCKED_EXTERNAL**: nenhuma credencial Meta (WhatsApp Cloud API) foi
  fornecida em `.env.local` nesta sessão — `META_APP_ID`, `META_APP_SECRET`,
  `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`,
  `WHATSAPP_BUSINESS_ACCOUNT_ID`, `WHATSAPP_VERIFY_TOKEN` continuam
  ausentes. Todo o adapter/webhook está implementado e testado com mocks,
  mas **nenhuma mensagem real foi enviada nem nenhum webhook real foi
  recebido/validado contra a Meta** nesta sessão. Passo a passo de
  configuração já foi passado ao usuário (conta de desenvolvedor Meta,
  criação do App, produto WhatsApp, número de teste gratuito, geração de
  token, configuração do webhook). Continua também
  `BLOCKED_EXTERNAL_CREDENTIAL` (sem `SUPABASE_SERVICE_ROLE_KEY`) para
  qualquer escrita real (criar atendimento, gravar resposta, criar
  solicitação) — herdado das fases anteriores.
- Pendência registrada para a Fase 16: agendar `expire_stale_atendimentos()`
  via Supabase Cron/pg_cron chamando um endpoint interno protegido (mesmo
  padrão já previsto para publicação vencida, seção 11) — a função SQL já
  existe e é segura de chamar a qualquer momento, só falta o agendamento
  real no deploy.
- Próxima etapa: Fase 7 — RF005/RF006 Solicitações e bloqueio por atraso.

## 2026-08-16 — CHECKPOINT (sessão interrompida por limite de uso, antes de /clear)

- **Fase atual:** Fase 7 — RF005 (Manter/Acompanhar Solicitação de Arte) +
  RF006 (Bloquear Designer por Atraso). Implementação de código já
  concluída; **falta apenas confirmar a revisão de segurança final desta
  fase antes de fechá-la e avançar para a Fase 8.**
- **Fases já concluídas (código + testes + revisão sem CRITICAL/HIGH
  pendente):** Fase 1 (fundação técnica), Fase 2 (banco/migrations/RLS),
  Fase 3 (RF002 auth), Fase 4 (RF001/RF015/RF016 designers), Fase 5 (RF003
  clientes), Fase 6 (RF004 WhatsApp Cloud API).
- **Tarefa exata em andamento:** obter uma revisão de segurança completa da
  Fase 7 (RF005/RF006). Duas tentativas com o subagente
  `designhub-security-reviewer` não produziram um relatório utilizável: a
  1ª voltou com a resposta cortada no meio da análise; a 2ª falhou com
  `status: failed` por limite de uso da sessão Claude (reseta 20:10,
  horário de São Paulo). **Nenhum achado CRITICAL/HIGH foi de fato
  reportado nem descartado para a Fase 7 — a revisão precisa ser refeita do
  zero na próxima sessão antes de declarar a fase concluída**, seguindo o
  mesmo padrão já usado nas fases anteriores (subagente `designhub-security-reviewer`
  e, se a migration for tocada de novo, também `designhub-database-reviewer`).
- **Último ponto concluído:** revisão de banco da migration
  `20260816150000_designer_bloqueio_function.sql` (função
  `sync_designer_bloqueio`, RF006) — sem CRITICAL/HIGH. Dois MEDIUM
  corrigidos: (1) índice composto `solicitacao_designer_vencida_idx`
  adicionado para o caminho quente (chamado em todo `iniciarAtendimento`);
  (2) função agora valida que o designer existe (`get diagnostics`
  `row_count`, `raise exception ... 'P0002'` se 0 linhas afetadas no
  UPDATE), por paridade com as demais funções `SECURITY DEFINER` já
  revisadas. Repository (`syncDesignerBloqueio` em
  `backend/src/repositories/solicitacao.repository.ts`) atualizado para
  traduzir esse erro em `NotFoundError`. `lint`/`typecheck`/`test` do
  backend rodados novamente após o fix — **82/82 testes verdes**, lint e
  typecheck limpos.
- **Próximo passo exato (retomar aqui):**
  1. Rodar a revisão de segurança da Fase 7 (RF005/RF006) do zero — ver
     prompt já usado nas duas tentativas anteriores (foco: IDOR/BOLA em
     `GET/PATCH /api/solicitacoes/:id`, mistura de autorização designer/admin
     no mesmo router `solicitacao.routes.ts`, mass assignment em
     `updateSolicitacaoSchema`, bypass de RF006, vazamento de dado pessoal em
     `respostasAtendimento`).
  2. Corrigir qualquer CRITICAL/HIGH encontrado (MEDIUM/LOW conforme
     critério de risco/regressão já usado nas fases anteriores).
  3. Rodar `npm run lint && npm run typecheck && npm run test && npm run build`
     na raiz do monorepo (gate completo, os dois workspaces).
  4. Atualizar este arquivo com o fechamento formal da Fase 7 (mesmo
     formato usado nas Fases 1-6) e marcar a tarefa #7 como `completed` no
     TaskList interno (havia sido marcada `in_progress`).
  5. Iniciar a Fase 8 — RF007/RF008 (Upload e versionamento de arte):
     upload PDF/JPG/PNG para o bucket privado `artes` (Supabase Storage, já
     criado na Fase 2), versões V1/V2... sequenciais (constraint única já
     existe: `versao_arte(id_solicitacao, numero_versao)`), transição de
     status para "Enviado para avaliação", geração de URL assinada para
     download (mencionada como pendência desde a Fase 5/7 —
     `listVersoesArte` já omite `arquivo_url` de propósito, aguardando este
     mecanismo).
- **Arquivos principais alterados nesta fase (Fase 7, já commitáveis,
  nenhum commit feito ainda — commit só quando o usuário pedir
  explicitamente):**
  - `supabase/migrations/20260816150000_designer_bloqueio_function.sql`
    (novo — função `sync_designer_bloqueio` + índice composto)
  - `backend/src/schemas/solicitacao.schemas.ts` (novo)
  - `backend/src/repositories/solicitacao.repository.ts` (estendido:
    list/detail/update de solicitação, histórico, versões, respostas de
    atendimento, sync de bloqueio)
  - `backend/src/repositories/solicitacao.repository.test.ts` (novo)
  - `backend/src/services/solicitacao.service.ts` (novo)
  - `backend/src/services/solicitacao.service.test.ts` (novo)
  - `backend/src/services/atendimento.service.ts` (alterado: `iniciarAtendimento`
    agora recebe `idDesigner` e aplica o gate RF006 via `syncDesignerBloqueio`)
  - `backend/src/routes/solicitacao.routes.ts` (estendido: GET/PATCH
    designer-only somados ao PATCH `/reatribuir` admin-only já existente)
  - `backend/src/routes/solicitacao.routes.test.ts` (novo)
  - `backend/src/routes/cliente.routes.ts` (chamada a `iniciarAtendimento`
    ajustada para o novo parâmetro `idDesigner`)
  - `backend/src/routes/auth.routes.ts` (estendido: `/me` agora inclui
    `bloqueado` para perfil designer)
  - `backend/src/routes/auth.routes.test.ts` (novo)
  - `frontend/src/features/auth/auth-context.ts` (tipo `AuthProfile` com
    `bloqueado: boolean | null`)
  - `frontend/src/features/designer/DesignerHome.tsx` (aviso de bloqueio
    RF006 + links para clientes/solicitações)
  - `frontend/src/features/designer/solicitacoes/` (novo: `api.ts`,
    `SolicitacoesPage.tsx` + teste, `SolicitacaoDetailPage.tsx` + teste)
  - `frontend/src/app/AppRouter.tsx` (rotas `/designer/solicitacoes` e
    `/designer/solicitacoes/:id`)
  - `frontend/src/App.test.tsx` (novo teste do aviso de bloqueio RF006)
- **Testes já executados (última execução completa, após o fix do MEDIUM
  do banco):** backend 82/82 verdes (`npx vitest run` em `backend/`),
  frontend 20/20 verdes (última execução completa antes do checkpoint,
  arquivo `SolicitacoesPage.test.tsx`/`SolicitacaoDetailPage.test.tsx`
  inclusos). `npm run lint`, `npm run typecheck`, `npm run build` — verdes
  nos dois workspaces na última execução completa da raiz.
- **Pendências reais (não são bugs, são trabalho ainda não feito):**
  - Revisão de segurança da Fase 7 ainda não concluída (ver "próximo passo").
  - `arquivo_url` de `versao_arte` segue fora do detalhe de solicitação até
    a Fase 8 implementar download via URL assinada.
  - Cron real de `expire_stale_atendimentos()` (RF004/RN05) e de qualquer
    job futuro de publicação segue como pendência explícita da Fase 16
    (função SQL já existe e é segura de chamar a qualquer momento).
- **Bloqueios externos atuais:**
  - `SUPABASE_SERVICE_ROLE_KEY`: **AUSENTE**. Bloqueia toda escrita real
    (criar/editar/excluir designer, cliente, solicitação, atendimento) —
    todo o código está implementado e testado só com mocks.
  - Acesso ao projeto Supabase real do DesignHub via MCP: **BLOQUEADO**
    (conta MCP conectada só enxerga 3 projetos não relacionados; nenhuma
    migration foi aplicada a um banco real nesta sessão).
  - Credenciais Meta (WhatsApp Cloud API): **AUSENTES** —
    `META_APP_ID`, `META_APP_SECRET`, `WHATSAPP_ACCESS_TOKEN`,
    `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_BUSINESS_ACCOUNT_ID`,
    `WHATSAPP_VERIFY_TOKEN` continuam ausentes do `.env.local`. Passo a
    passo de configuração já foi enviado ao usuário nesta sessão; usuário
    informou que iria buscar essas credenciais.
  - Credenciais Instagram API (RF014, Fase 12): **AUSENTES** — ainda não
    solicitadas/necessárias nesta etapa do roadmap.
- **Integrações ainda pendentes (nenhuma testada ponta a ponta contra
  serviço real nesta sessão):** Supabase (escrita real), WhatsApp Cloud
  API (envio/recebimento real), Instagram API (Fase 12, não iniciada).
- **Estado das credenciais (`.env.local`, sem valores):**
  - `SUPABASE_URL` / `SUPABASE_PUBLISHABLE_KEY` (via fallback `NEXT_PUBLIC_*`): **PRESENTE**
  - `SUPABASE_SERVICE_ROLE_KEY`: **AUSENTE**
  - `META_APP_ID`: **AUSENTE**
  - `META_APP_SECRET`: **AUSENTE**
  - `WHATSAPP_ACCESS_TOKEN`: **AUSENTE**
  - `WHATSAPP_PHONE_NUMBER_ID`: **AUSENTE**
  - `WHATSAPP_BUSINESS_ACCOUNT_ID`: **AUSENTE**
  - `WHATSAPP_VERIFY_TOKEN`: **AUSENTE**
  - `INSTAGRAM_ACCESS_TOKEN` / `INSTAGRAM_ACCOUNT_ID`: **AUSENTE**
  - Acesso MCP Supabase ao projeto real do DesignHub: **BLOQUEADA** (conta
    conectada não tem acesso ao projeto correto)

## 2026-08-16 — Fase 7 FECHADA (revisão de segurança concluída)

- Retomada de sessão após `/clear`: checkpoint acima conferido contra
  `git status`/`git diff --stat`/`git log` e revalidado rodando
  `npm run lint && npm run typecheck && npm run test` na raiz — estado
  coerente com o registrado (82 testes backend + 20 frontend, lint e
  typecheck limpos, nenhuma migration aplicada ainda, nenhum commit feito).
  `.env.local` reconfirmado ignorado pelo Git (`git check-ignore -v`).
- Revisão de segurança da Fase 7 (RF005/RF006) executada com sucesso pelo
  subagente `designhub-security-reviewer` (terceira tentativa; as duas
  anteriores, de sessão passada, haviam sido cortadas por limite de uso).
  Resultado: **0 CRITICAL, 0 HIGH**, 2 MEDIUM, 2 LOW. Escopo revisado:
  `solicitacao.routes.ts`/`.test.ts`, `solicitacao.service.ts`/`.test.ts`,
  `solicitacao.repository.ts`/`.test.ts`, `solicitacao.schemas.ts`, trecho
  novo de `atendimento.service.ts` (parâmetro `idDesigner` +
  `syncDesignerBloqueio`), campo `bloqueado` em `auth.routes.ts`, e consumo
  backend da função `sync_designer_bloqueio`.
  - **MEDIUM-1 corrigido**: `getSolicitacaoDetail`/`updateSolicitacao`
    (`services/solicitacao.service.ts`) dependiam exclusivamente da policy
    RLS `solicitacao_select_owner_or_admin` para provar ownership, sem
    checagem redundante na aplicação (violando a orientação da seção 12.1
    do CLAUDE.md de que RLS deve ser **segunda** camada, não a única).
    Corrigido: ambas as funções agora recebem `callerId` (sempre
    `request.auth.userId`, nunca valor do cliente) e comparam
    explicitamente contra `solicitacao.idDesigner`, lançando `NotFoundError`
    em caso de divergência — defesa em profundidade que sobrevive a uma
    futura regressão de policy/RLS ou troca acidental de cliente
    admin/user. Testes novos: `getSolicitacaoDetail`/`updateSolicitacao`
    rejeitam quando `callerId` diverge do dono real, mesmo com o
    repositório retornando dados válidos.
  - **MEDIUM-2 corrigido**: `PATCH /:id/reatribuir`
    (`routes/solicitacao.routes.ts`) usava `Number.parseInt` manual em vez
    do `solicitacaoIdParamSchema` (zod `coerce.number().int().positive()`)
    já usado nas demais rotas do arquivo — inconsistência que tolerava
    silenciosamente IDs malformados (`'10abc'` virava `10`). Corrigido para
    usar o mesmo schema compartilhado; import não utilizado de
    `ValidationError` removido.
  - **LOW-1 corrigido**: `updateSolicitacaoSchema`
    (`schemas/solicitacao.schemas.ts`) não usava `.strict()`, então campos
    desconhecidos (ex.: `status`, `id_designer` enviados por engano ou por
    tentativa de manipulação) eram descartados silenciosamente em vez de
    gerar 400 — reduzindo a visibilidade de tentativas de mass assignment
    (seção 12.2 do CLAUDE.md). Corrigido com `.strict()`; teste novo em
    `solicitacao.routes.test.ts` confirma 400 ao enviar `status` junto de
    `tema` no `PATCH /:id`.
  - **LOW-2**: era só uma nota de nomenclatura ligada ao MEDIUM-1 — resolvida
    junto, já que `callerId` agora deixa explícito que o valor é a
    identidade confirmada do chamador, não apenas "o dono conforme o banco".
  - Nenhuma alteração de RF/RN/RNF, contrato de API ou schema de banco —
    apenas reforço de autorização/validação já exigido pelo CLAUDE.md.
- Validações pós-fix: `npm run lint`, `npm run typecheck` (ambos limpos),
  `npm run test` — **85 testes backend (+3) + 20 frontend = 105**, todos
  verdes; `npm run build` — verde nos dois workspaces (frontend Vite +
  backend tsc).
- **Fase 7 (RF005/RF006) agora está formalmente concluída**: código +
  testes + revisão de segurança sem CRITICAL/HIGH pendente, mesmo padrão já
  aplicado às Fases 1-6.
- Bloqueios externos herdados, sem mudança nesta etapa (ver seção
  "Estado das credenciais" acima): `SUPABASE_SERVICE_ROLE_KEY` ausente
  (nenhuma escrita real testada ponta a ponta), credenciais Meta WhatsApp
  ausentes, acesso MCP Supabase ao projeto real bloqueado.
- Próxima etapa: Fase 8 — RF007/RF008 (Upload e versionamento de arte).

## 2026-08-16 — Fase 8 concluída (RF007/RF008 Upload e versionamento de arte)

- Banco: `supabase/migrations/20260816160000_register_versao_arte_function.sql`
  (RPC `register_versao_arte`, SECURITY DEFINER, atômica: trava a linha de
  `solicitacao` com `select ... for update`, rejeita se não encontrada/não
  pertence ao designer chamador (P0002) ou se o status não permite novo
  envio — só `Em produção`/`Ajustes`, RN26 (P0001), calcula `numero_versao`
  sequencial sob o mesmo lock, insere em `versao_arte`, atualiza
  `solicitacao.status` para `Enviado para avaliação` e grava
  `historico_solicitacao`, tudo numa única transação). Mesmo padrão
  anti-CRITICAL das funções irmãs: `revoke all` de `public` e de
  `anon, authenticated` explicitamente, `grant execute` só a `service_role`.
- Backend: `backend/src/lib/fileSignature.ts` (detecção do formato real via
  assinatura de bytes — PDF/JPG/PNG — nunca por Content-Type/extensão
  declarados pelo cliente, seção 12.2), `backend/src/middleware/upload.ts`
  (multer memoryStorage, 15 MB, `fileFilter` como primeira barreira não
  confiável), `backend/src/repositories/versaoArte.repository.ts` (upload/
  remoção no bucket privado `artes`, chamada à RPC, `createSignedUrl` com
  `download: true` — força `Content-Disposition: attachment` — e busca de
  versão filtrando `id_versao` **e** `id_solicitacao` simultaneamente contra
  IDOR), `backend/src/services/versaoArte.service.ts` (`uploadVersaoArte`:
  valida formato real, confirma ownership explícito comparando `callerId`
  ao dono real ANTES de tocar Storage/RPC — mesmo padrão de defesa em
  profundidade da Fase 7 —, gera path só com `randomUUID()` + extensão do
  formato detectado — nunca com nome/extensão do cliente —, envia ao
  Storage, chama a RPC, compensa removendo o objeto órfão se a RPC falhar,
  sincroniza `designer.bloqueado` melhor-esforço após sucesso — RF006/RN12,
  já que o upload da 1ª versão é o que resolve a pendência de atraso;
  `getVersaoArteDownloadUrl`: mesma checagem de ownership antes de gerar URL
  assinada de 300s). Duas rotas novas em `solicitacao.routes.ts`:
  `POST /:id/versoes` e `GET /:id/versoes/:versaoId/download-url`
  (designer-only), com rate limit dedicado por `callerId` (20 uploads/10min,
  ver correção do MEDIUM abaixo).
- Frontend: formulário de envio de nova versão (arquivo + observações,
  visível apenas quando o status permite upload — RN26) e botão "Baixar"
  por versão (gera URL assinada e abre em nova aba) em
  `SolicitacaoDetailPage.tsx`; `apiClient.ts` ajustado para não forçar
  `Content-Type: application/json` quando o corpo é `FormData`.
- Revisão: subagentes `designhub-database-reviewer` e
  `designhub-security-reviewer` em paralelo. **0 CRITICAL, 0 HIGH** nos
  dois.
  - **MEDIUM corrigido (segurança)**: rate limit global (120 req/min por
    IP) não era proporcional ao risco de um endpoint que aceita até 15 MB
    por requisição (seção 12.3; risco de esgotar armazenamento/egress no
    plano gratuito do Supabase, seção 2.1). Corrigido com um
    `express-rate-limit` dedicado à rota de upload, chaveado por
    `request.auth.userId` (não por IP — o risco é por conta, não por rede de
    origem), 20 envios/10min. Ajuste posterior: o `keyGenerator` usava
    `request.ip` como fallback bruto, o que o próprio `express-rate-limit`
    v8 rejeitou em runtime (`ERR_ERL_KEY_GEN_IPV6` — endereços IPv6 não
    normalizados podem burlar o limite); corrigido envolvendo o fallback
    com o helper `ipKeyGenerator` da biblioteca.
  - **LOW corrigidos**: `createSignedUrl` passou a usar `{ download: true }`
    (força `Content-Disposition: attachment`, elimina qualquer chance de o
    navegador renderizar o arquivo inline); comentário desatualizado da
    convenção de path em `20260816120900_storage_artes.sql` corrigido para
    refletir o path real (UUID gerado no servidor, nunca `id_versao`/nome do
    cliente).
  - LOW/observação registrados sem ação nesta fase: reconciliação de
    objetos órfãos no Storage caso o processo caia exatamente entre o
    upload e o registro atômico da versão — cenário raro, sem risco de
    segurança (bucket 100% privado), o próprio revisor recomendou deferir
    para uma fase técnica futura (job periódico de reconciliação); risco
    residual de conteúdo polimórfico dentro de um PDF/JPG/PNG validado por
    assinatura de bytes é inerente a qualquer sistema que aceite esses
    formatos e já mitigado pelo Content-Type real gravado no Storage + pela
    aplicação nunca executar o conteúdo enviado.
  - Achados MEDIUM/LOW do lado banco (mapeamento não estruturado de um
    eventual `23514`/`23505` da CHECK/UNIQUE de `versao_arte` caso a
    validação de formato/lock falhasse antes da RPC; nota de documentação
    entre migrations) registrados como polimento opcional pelo próprio
    revisor — não bloqueiam a fase, sem ação necessária agora.
- Validações: `npm run lint`, `npm run typecheck` (ambos limpos),
  `npm run test` — **114 testes backend (+32: fileSignature, errors/Multer,
  versaoArte.repository, versaoArte.service, rotas de upload/download) +
  25 frontend (+5) = 139**, todos verdes; `npm run build` — verde nos dois
  workspaces. Testes cobrem: detecção de formato real por assinatura de
  bytes (rejeita executável disfarçado de PDF), autorização negativa
  (admin → 403 nas duas rotas novas), ownership negativo (callerId
  diferente do dono real → 404), status inválido para upload (RN26 →
  409/ConflictError), sequência de versão via RPC mockada, compensação de
  Storage quando a RPC falha, resiliência da sincronização de bloqueio
  (melhor-esforço), filtro duplo `id_versao`+`id_solicitacao` contra IDOR no
  download, `Content-Disposition: attachment` na URL assinada, rejeição de
  upload sem arquivo e de Content-Type não permitido.
- **BLOCKED_EXTERNAL_CREDENTIAL** (mesma causa das fases anteriores): sem
  `SUPABASE_SERVICE_ROLE_KEY` e sem migrations aplicadas a um banco real,
  nenhum upload real foi exercitado contra Storage/Postgres nesta sessão —
  toda a lógica está implementada e coberta por testes unitários/integração
  com mocks.
- Próxima etapa: Fase 9 — RF009/RF010 (Avaliação da arte pelo cliente via
  link/token seguro + registro de ajustes).

## 2026-08-16 — Fase 9 concluída (RF009/RF010 Avaliação da arte + Ajustes)

- Banco: `supabase/migrations/20260816170000_avaliacao_link_token.sql` —
  tabela `avaliacao_link_token` (só o hash SHA-256 do token é persistido;
  RLS habilitada sem policies para `anon`/`authenticated`, mesmo padrão de
  `whatsapp_webhook_evento`; infraestrutura de segurança, não entidade nova
  do DER) + duas RPCs SECURITY DEFINER: `generate_avaliacao_link_token`
  (trava `solicitacao`, valida ownership/status, revoga tokens anteriores
  não usados da mesma versão, insere o novo) e `submit_avaliacao` (valida
  token/expiração/uso, trava `solicitacao`, insere `avaliacao` — o
  `unique(id_versao)` já existente desde a Fase 2 é o backstop de
  double-submit —, insere `ajuste` quando `decisao='Ajustes'`, atualiza
  `solicitacao.status`, grava `historico_solicitacao` com `id_usuario=null`
  — cliente não é um `usuario` autenticado — e marca o token usado). Mesmo
  padrão anti-CRITICAL das funções irmãs (`revoke` explícito de
  `anon, authenticated` + `grant` só a `service_role`).
- Backend: `lib/tokens.ts` (token opaco de 256 bits via
  `crypto.randomBytes`, só o hash SHA-256 é persistido), `lib/errors.ts`
  (`ExpiredLinkError`, 410), `repositories/avaliacao.repository.ts` e
  `services/avaliacao.service.ts` (`gerarLinkAvaliacao`: designer-only,
  ownership+status explícitos, tenta notificar o cliente via WhatsApp
  — RN19 — sem nunca mascarar falha de envio; `getAvaliacaoPreview`:
  leitura pública com três buckets amigáveis `invalid`/`expired`/`used`,
  nunca expõe PII de cliente/designer nem o path cru do Storage, só uma URL
  assinada de 300s; `submitAvaliacaoDecisao`: valida estado do link,
  reaproveita a validação de MIME real da Fase 8 para a referência opcional
  do ajuste, compensa o Storage se a RPC falhar). Duas rotas novas: `POST
  /api/solicitacoes/:id/link-avaliacao` (designer-only, rate limit próprio
  por designer) e o router público `avaliacao.routes.ts` montado em
  `/api/avaliacao` — **primeira rota do projeto sem autenticação alguma**
  (a prova de acesso é só o token de 256 bits), com rate limit dedicado por
  IP (30 req/10min).
- Frontend: `features/avaliacao/` (cliente HTTP público dedicado, distinto
  do `apiClient.ts` autenticado) + `AvaliacaoPage.tsx` na rota pública
  `/avaliacao/:token` (fora de qualquer `ProtectedRoute`) — arte em
  destaque via `<img>`/`<iframe>` usando a URL assinada, ações
  Aprovar/Solicitar ajustes/Cancelar (cancelamento com confirmação em duas
  etapas), mensagens amigáveis para link inválido/expirado/já utilizado.
  Botão "Gerar e enviar link de avaliação" em `SolicitacaoDetailPage.tsx`,
  visível apenas quando `status = 'Enviado para avaliação'`, reportando
  claramente se a notificação WhatsApp funcionou ou não.
- Revisão: subagentes `designhub-database-reviewer` e
  `designhub-security-reviewer` em paralelo (a segunda precisou ser
  retomada uma vez após um corte no meio do relatório, mesmo padrão já
  visto na Fase 7 — sem achado perdido, só re-solicitação do texto final).
  **0 CRITICAL, 0 HIGH** nos dois. 2 MEDIUM corrigidos (banco) + 1 MEDIUM
  corrigido (segurança):
  - **DB-M1 corrigido**: `submit_avaliacao` e `generate_avaliacao_link_token`
    travavam `solicitacao`/`avaliacao_link_token` em ordens opostas
    (token→solicitacao vs. solicitacao→token), risco real de deadlock
    (`40P01`) entre um designer gerando um novo link e um cliente
    submetendo a decisão do link antigo ao mesmo tempo, para a mesma
    versão. Corrigido reordenando `submit_avaliacao` para sempre travar
    `solicitacao` primeiro (lê o token sem lock só para descobrir a
    solicitação, trava `solicitacao`, só então trava e relê o token pela
    PK sob lock) — mesma ordem em ambas as funções.
  - **DB-M2 corrigido**: a validação de `p_decisao` em `submit_avaliacao`
    ocorria depois do `insert` que já a validava via CHECK constraint —
    tornando o `else` do `case` inalcançável e fazendo um valor inválido
    (cenário "não deveria acontecer", já que o Zod valida antes) vazar um
    erro Postgres cru (23514, nome de tabela/constraint) em vez do erro
    amigável `P0001` já desenhado. Corrigido validando `p_decisao` (e
    reordenado para antes de qualquer `insert`) logo após a checagem de
    status, preservando o SQLSTATE.
  - **SEC-M1 corrigido**: a URL assinada gerada para a tela pública de
    avaliação usava `download: true` (herdado do padrão da Fase 8), que
    força `Content-Disposition: attachment` — em vários navegadores isso
    faz o `<iframe>` de PDF disparar um download em vez de renderizar
    inline, quebrando "a arte como foco principal" (seção 1/RF009) para o
    caso PDF. Corrigido adicionando um parâmetro `forceDownload` a
    `createVersaoArteDownloadUrl` (default `true`, preserva o
    comportamento do download autenticado do designer) e chamando-o com
    `false` especificamente no preview público.
  - LOW registrados sem ação necessária (nenhum bloqueia a fase, todos
    documentados nos próprios relatórios como aceitáveis/triviais): índice
    parcial opcional em `avaliacao_link_token` (banco); `token_hash` sem
    CHECK de formato (banco); pré-checagem de estado do link sem lock antes
    do upload da referência pode gerar upload "órfão" descartável em
    corrida rara, mitigado pelo rate limit (segurança); rate limit público
    é por requisição, não por bytes — mesmo trade-off já aceito no resto do
    projeto, seção 12.3 (segurança).
- Validações: `npm run lint`, `npm run typecheck` (ambos limpos),
  `npm run test` — **155 testes backend (+41: tokens/errors, repository e
  service de avaliação, rotas públicas e a rota nova de geração de link) +
  36 frontend (+11: AvaliacaoPage completa + botão de link no designer) =
  191**, todos verdes; `npm run build` — verde nos dois workspaces.
  Testes cobrem: força/opacidade do token (via geração real, nunca
  previsível), os quatro estados do link (`valid`/`invalid`/`expired`/`used`)
  tanto na leitura pública quanto na submissão, IDOR entre solicitações
  (token de uma versão não afeta outra, path de referência sempre derivado
  do próprio token — nunca de parâmetro do cliente), rejeição de ajuste sem
  descrição (RF010), rejeição de referência com conteúdo que não é PDF/JPG/PNG
  real, compensação de Storage quando a RPC falha, notificação WhatsApp não
  mascarada (sucesso e falha reportados explicitamente), autorização
  negativa na geração do link (admin → 403), e o fluxo completo de
  Aprovar/Ajustes/Cancelar na tela pública (incluindo confirmação em duas
  etapas do cancelamento).
- **BLOCKED_EXTERNAL_CREDENTIAL/BLOCKED_EXTERNAL** (mesma causa das fases
  anteriores): sem `SUPABASE_SERVICE_ROLE_KEY`/migrations aplicadas e sem
  credenciais WhatsApp Cloud API reais, nenhum link foi gerado nem nenhuma
  avaliação foi submetida contra um banco/Meta reais nesta sessão — toda a
  lógica está implementada e coberta por testes unitários/integração com
  mocks.
- Próxima etapa: Fase 10 — RF011 (máquina de estados única, histórico
  obrigatório em todas as transições já implementadas até aqui, testes de
  todos os caminhos válidos/inválidos).

## 2026-08-16 — Fase 10 concluída (RF011 máquina de estados)

- Contexto: as 6 transições já implementadas nas Fases 4/6/8/9 (criação →
  `Em produção`; upload → `Enviado para avaliação`; ajustes → `Ajustes`;
  aprovação/ajustes/cancelamento via avaliação) já eram corretas e cada uma
  já gravava `historico_solicitacao` atomicamente dentro da própria RPC
  (RN48). O que faltava para RF011 aparecer como unidade explícita
  (rastreabilidade) era uma fonte única e testável do grafo completo, em
  vez de conhecimento implícito espalhado em 3 migrations diferentes.
- Backend: `backend/src/lib/statusTransitions.ts` — módulo canônico com os
  7 estados (RN39) e as 8 arestas numeradas de RF011 (6 já implementadas +
  2 futuras de agendamento/publicação, marcadas `implemented: false` e
  associadas às Fases 11/12 ainda não iniciadas, sem inventar/antecipar
  comportamento). Deliberadamente **não** é importado pelas rotas para
  decidir uma resposta HTTP — a autoridade de enforcement continua sendo as
  RPCs SECURITY DEFINER no banco (arquitetura já estabelecida desde a Fase
  2); o módulo é documentação/fixture de teste, evitando uma segunda fonte
  de verdade que pudesse divergir da primeira.
- Higiene: eliminada a duplicação da lista de 7 status que existia em 3
  lugares dentro do backend (`schemas/solicitacao.schemas.ts` e
  `repositories/solicitacao.repository.ts` tinham cada um sua própria
  cópia literal do array) — ambos agora importam de
  `lib/statusTransitions.ts`. Refatoração sem mudança de comportamento
  observável (mesmos valores, mesma ordem), conforme seção 3.3 do
  CLAUDE.md. A cópia equivalente do frontend não foi tocada — frontend e
  backend são pacotes/builds separados nesta arquitetura, sem workspace
  compartilhado de contratos.
- Testes novos: `lib/statusTransitions.test.ts` (valida a forma exata do
  grafo — 7 estados sem duplicata, 8 arestas, 6 implementadas + 2
  pendentes, sem arestas duplicadas, `Cancelado`/`Publicado` como estados
  terminais, aceitação/rejeição de transições específicas) e
  `services/statusGate.matrix.test.ts` (matriz exaustiva: para cada um dos
  7 estados oficiais, testa `uploadVersaoArte` — RF007/RN26, só aceita a
  partir de `Em produção`/`Ajustes` — e `gerarLinkAvaliacao` — RF009/RN19,
  só aceita a partir de `Enviado para avaliação` — confirmando rejeição com
  `ConflictError` em todos os outros 6/5 estados, não só nos casos de
  exemplo já cobertos pelos testes específicos de cada fase).
- Revisão: mudança sem superfície de segurança nova (nenhuma rota, nenhum
  schema de banco, nenhuma regra de negócio alterada — só um módulo de
  documentação/teste e uma deduplicação trivial) — dispensados os
  subagentes `designhub-database-reviewer`/`designhub-security-reviewer`
  desta vez, registrando explicitamente o motivo (seção 5 do CLAUDE.md:
  usar subagente quando a mudança se encaixar nos gatilhos; aqui não se
  encaixa).
- Validações: `npm run lint`, `npm run typecheck` (ambos limpos),
  `npm run test` — **177 testes backend (+22: grafo canônico + matriz de
  status) + 36 frontend (sem alteração) = 213**, todos verdes;
  `npm run build` — verde nos dois workspaces.
- Sem bloqueios externos novos nesta fase (não houve escrita em
  banco/integração externa).
- Próxima etapa: Fase 11 — RF012/RF013 (Agendamento de publicação e
  cancelamento de agendamento, janela de 3 horas, timezone
  `America/Sao_Paulo`).

## 2026-08-16 — Fase 11 concluída (RF012/RF013 Agendamento e cancelamento de publicação)

- Banco: `supabase/migrations/20260816180000_agendamento_publicacao_functions.sql`
  — três RPCs SECURITY DEFINER sobre as tabelas `agendamento_publicacao`/
  `solicitacao` já existentes desde a Fase 2 (`agendamento_ativo_unico_idx`
  é o backstop contra dois agendamentos ativos concorrentes):
  `create_agendamento` (trava `solicitacao`, exige status `Aprovado` —
  RN30 —, calcula o horário planejado como `(data + horario) at time zone
  'America/Sao_Paulo'` e rejeita agendamento no passado, insere o
  agendamento, muda `solicitacao.status` para `Agendado`, grava
  histórico); `update_agendamento` (edição livre enquanto o agendamento
  está ativo — RF012 não repete a janela de 3h, que é exclusiva do
  cancelamento por RF013/RN31); `cancel_agendamento` (rejeita se faltarem
  menos de 3h para o horário planejado — RN31 —, senão marca o
  agendamento `Cancelado` e devolve `solicitacao.status` para `Aprovado`,
  distinto do "Cancelado" de RF009 que encerra a solicitação inteira).
  Mesmo padrão anti-CRITICAL das funções irmãs (`revoke` explícito de
  `anon, authenticated` + `grant` só a `service_role`).
- Backend: `schemas/agendamento.schemas.ts`, `repositories/agendamento.repository.ts`
  (mapeamento de erro P0001-P0005, `getActiveAgendamentoBySolicitacao` —
  resolve o agendamento ativo a partir do `id_solicitacao`, evitando expor
  `id_agendamento` nas rotas —, `getActiveAgendamentoSummary` para o
  detalhe da solicitação, `listAgendamentos`), `services/agendamento.service.ts`
  (ownership+status explícitos antes de cada RPC, mesmo padrão de defesa em
  profundidade das Fases 7-9). Rotas: `POST/PATCH/DELETE
  /api/solicitacoes/:id/agendamento` (aninhadas por `id_solicitacao`, nunca
  por `id_agendamento` — elimina uma classe inteira de IDOR por
  construção) e `GET /api/agendamentos` (listagem top-level com filtro de
  status), todas `requireProfile('designer')` (RF012/RF013 são exclusivas
  do Designer). `services/solicitacao.service.ts` também passou a incluir
  `agendamento: ActiveAgendamentoSummary | null` no detalhe da solicitação,
  buscado só quando `status === 'Agendado'`.
- `lib/statusTransitions.ts` (Fase 10) atualizado: aresta `Aprovado →
  Agendado` marcada `implemented: true`, nova aresta `Agendado → Aprovado`
  adicionada (RF013 — cancelamento de agendamento devolve a solicitação a
  `Aprovado`, não ao `Cancelado` terminal de RF009); testes do grafo
  canônico e da matriz de status (`statusGate.matrix.test.ts`) estendidos
  com `createAgendamento` (só aceita a partir de `Aprovado`, RN30).
- Frontend: `features/designer/agendamentos/` (nova tela `AgendamentosPage`
  em `/designer/agendamentos`, listagem com filtro de status, link de
  volta à solicitação) + seção "Agendamento de publicação" em
  `SolicitacaoDetailPage.tsx` (formulário de criar/editar quando status é
  `Aprovado`/`Agendado`, cancelamento com confirmação em duas etapas e nota
  visível da janela de 3h — RN31).
- Revisão: subagentes `designhub-database-reviewer` e
  `designhub-security-reviewer` em paralelo. **0 CRITICAL, 0 HIGH** nos
  dois; **0 MEDIUM** de segurança.
  - **DB-M1 corrigido**: `update_agendamento`/`cancel_agendamento` travavam
    só a linha de `agendamento_publicacao` (`for update of a`), nunca a de
    `solicitacao`, ao contrário de `create_agendamento` (que trava
    `solicitacao`) — assimetria de padrão frente ao precedente já
    documentado na Fase 9 (`submit_avaliacao`/`generate_avaliacao_link_token`,
    "travar sempre na mesma ordem evita deadlock entre funções
    concorrentes"). O revisor confirmou que hoje não há deadlock real (as
    duas famílias de função nunca disputam os mesmos dois recursos, e a
    invariante de negócio as torna mutuamente exclusivas por construção),
    mas classificou como MEDIUM por ser uma garantia que depende de
    nenhuma futura função vir a violar essa invariante silenciosamente.
    Corrigido padronizando `for update of a, s` nas duas funções.
  - **LOW corrigidos** (banco): checagem explícita de `p_data_publicacao`/
    `p_horario` não nulos adicionada em `create_agendamento`/
    `update_agendamento` antes da aritmética de data, evitando que um NULL
    (hoje impossível via Zod, mas não impossível via uma chamada direta
    futura à RPC) caísse silenciosamente na lógica trivalorada do SQL e só
    fosse pego pela constraint `NOT NULL` física com um erro cru.
  - **LOW corrigidos** (segurança): regexes de `dataPublicacao`/`horario`
    em `agendamento.schemas.ts` apertados para faixas plausíveis de
    mês/dia/hora/minuto (antes só validavam o formato, aceitando algo como
    "2026-13-45"/"25:99" que cairia num erro 500 genérico de cast do
    Postgres em vez de um 400 amigável); export morto
    `agendamentoIdParamSchema` removido (nunca importado — nenhuma rota
    aceita `id_agendamento` vindo do cliente, confirmando por si só que
    não há IDOR nesse vetor); teste negativo faltante (`PATCH
    /:id/agendamento` como administrador → 403) adicionado por simetria
    com os testes já existentes de `POST`/`DELETE`.
  - LOW/observações registrados sem ação: DST não é um risco atual para
    `America/Sao_Paulo` (Brasil sem horário de verão desde 2019); ausência
    da janela de 3h em `update_agendamento` é fiel ao texto literal de
    RF012/RF013 (a regra é exclusiva do cancelamento), não uma brecha.
- Validações: `npm run lint`, `npm run typecheck` (ambos limpos),
  `npm run test` — **215 testes backend (+41: schemas/repository/service/
  rotas de agendamento, extensão do grafo canônico e da matriz de status)
  + 43 frontend (+7: AgendamentosPage + seção de agendamento na
  SolicitacaoDetailPage) = 258**, todos verdes; `npm run build` — verde
  nos dois workspaces.
- **BLOCKED_EXTERNAL_CREDENTIAL** (mesma causa das fases anteriores): sem
  `SUPABASE_SERVICE_ROLE_KEY`/migrations aplicadas, nenhum agendamento foi
  criado/editado/cancelado contra um banco real nesta sessão — toda a
  lógica está implementada e coberta por testes unitários/integração com
  mocks.
- Próxima etapa: Fase 12 — RF014 (Instagram API oficial + fallback manual
  de publicação; bloqueada para testes reais por falta de credenciais
  Instagram — implementar adapter/job mesmo assim, registrando
  `BLOCKED_EXTERNAL` para a parte que depende da API oficial).

## 2026-08-17 — CHECKPOINT (sessão interrompida antes de /clear)

- **Fase atual:** Fase 12 — RF014 (Publicação da arte: Instagram API
  oficial + fallback manual). Implementação de backend concluída;
  **falta rodar o gate completo (`test`/`build`) desta leva, depois
  frontend (Task #13) e revisão especializada + fechamento (Task #14)**.
- **Fases já concluídas (código + testes + revisão sem CRITICAL/HIGH
  pendente):** Fase 1 (fundação), Fase 2 (banco/RLS), Fase 3 (RF002 auth),
  Fase 4 (RF001/RF015/RF016 designers), Fase 5 (RF003 clientes), Fase 6
  (RF004 WhatsApp), Fase 7 (RF005/RF006), Fase 8 (RF007/RF008 upload/
  versões), Fase 9 (RF009/RF010 avaliação/ajustes), Fase 10 (RF011 máquina
  de estados canônica), Fase 11 (RF012/RF013 agendamento/cancelamento).
- **Tarefa em andamento (Task #12 do TaskList interno):** backend de
  RF014 — migration (Task #11, concluída), adapter Instagram, job de
  publicação vencida, endpoint interno protegido, rota de publicação
  manual — todos implementados e com testes escritos.
- **Último ponto concluído:** `npm run typecheck` e `npm run lint`
  rodados limpos após escrever todos os arquivos/testes desta leva.
  **`npm run test` e `npm run build` ainda NÃO foram executados** para
  esta leva (última execução completa validada foi ao fechar a Fase 11:
  215 testes backend + 43 frontend, todos verdes — esse baseline continua
  presumivelmente válido, mas os arquivos novos abaixo ainda não foram
  exercitados em conjunto).
- **Próximo passo exato (retomar aqui):**
  1. Rodar `npm run typecheck && npm run lint && npm run test && npm run build`
     na raiz do monorepo (gate completo) e corrigir qualquer falha nos
     arquivos novos desta leva.
  2. Marcar Task #12 como `completed`.
  3. Task #13: frontend — botão "Registrar publicação manual" em
     `SolicitacaoDetailPage.tsx` (visível quando `status = 'Agendado'`,
     chama `POST /api/solicitacoes/:id/publicacao-manual`) + exibição do
     status/log de publicação.
  4. Task #14: subagentes `designhub-database-reviewer` e
     `designhub-security-reviewer` em paralelo (foco: endpoint interno
     `POST /api/internal/publicacoes/processar` protegido só por segredo
     compartilhado — `INTERNAL_JOB_SECRET`, sem JWT de usuário — é
     superfície nova sensível; também revisar `register_publicacao_sucesso`/
     `register_publicacao_falha` e a filtragem de formato elegível para
     publicação automática). Corrigir achados de baixo risco, gate
     completo, fechar a Fase 12 no formato padrão deste arquivo.
- **Arquivos principais alterados nesta fase (Fase 12, não commitados):**
  - `supabase/migrations/20260816190000_publicacao_functions.sql` (novo)
  - `backend/src/config/env.ts` (`INSTAGRAM_ACCESS_TOKEN`,
    `INSTAGRAM_ACCOUNT_ID`, `INTERNAL_JOB_SECRET` + status derivados)
  - `.env.example` (nome `INTERNAL_JOB_SECRET`, sem valor)
  - `backend/src/integrations/instagram/instagramClient.ts` (novo)
  - `backend/src/repositories/publicacao.repository.ts` (novo) + teste
  - `backend/src/services/publicacao.service.ts` (novo) + teste
  - `backend/src/middleware/internalAuth.ts` (novo) + teste
  - `backend/src/routes/internalPublicacao.routes.ts` (novo) + teste
  - `backend/src/routes/solicitacao.routes.ts` (rota nova
    `POST /:id/publicacao-manual`) + teste
  - `backend/src/services/statusGate.matrix.test.ts` (matriz estendida
    para `registrarPublicacaoManual`)
  - `backend/src/lib/statusTransitions.ts` + teste (aresta
    `Agendado → Publicado` agora `implemented: true`)
  - `backend/src/app.ts` (monta `internalPublicacaoRouter` em
    `/api/internal/publicacoes`)
- **Bloqueios externos atuais (nenhum novo resolvido nesta sessão):**
  `SUPABASE_SERVICE_ROLE_KEY` ausente; credenciais WhatsApp Cloud API
  ausentes; **novos nesta fase:** `INSTAGRAM_ACCESS_TOKEN`/
  `INSTAGRAM_ACCOUNT_ID` ausentes (publicação automática real não
  testável) e `INTERNAL_JOB_SECRET` ausente (endpoint interno fica
  fail-closed/503 até ser configurado — comportamento esperado e testado).
  Nenhuma publicação real (automática ou manual) foi exercitada contra
  Instagram/banco reais nesta sessão.
- **Pendências reais:** gate completo desta leva (passo 1 acima); UI do
  designer para publicação manual (Task #13); revisão
  banco+segurança e fechamento formal da Fase 12 (Task #14); nenhum
  commit foi feito nesta sessão (aguardando pedido explícito do usuário).

## 2026-08-17 — Fase 12 CONCLUÍDA (RF014 — publicação Instagram + manual)

- Gate completo executado e verde: `typecheck`, `lint`, `test` (252
  backend + 45 frontend = 297), `build` (frontend+backend).
- Task #13: botão "Registrar publicação manual" adicionado em
  `SolicitacaoDetailPage.tsx` (visível só quando `status = 'Agendado'`),
  chama `POST /api/solicitacoes/:id/publicacao-manual`; histórico
  atualiza automaticamente via `historico_solicitacao` já gravado pela
  RPC. 2 testes novos (sucesso + erro do backend).
- Task #14: `designhub-security-reviewer` e `designhub-database-reviewer`
  rodados em paralelo (leitura, escopo restrito à leva RF014).
  - Segurança: **0 CRITICAL/HIGH**; 2 MEDIUM corrigidos: `INTERNAL_JOB_SECRET`
    agora exige `min(32)` no schema Zod (`env.ts`) + comentário no
    `.env.example`; rate limit dedicado (10 req/min/IP) adicionado em
    `POST /api/internal/publicacoes/processar` (`internalPublicacao.routes.ts`).
  - Banco: **2 HIGH corrigidos** (concorrência/idempotência do job
    automático):
    1. Post duplicado real no Instagram se o job rodar de forma
       sobreposta: adicionada coluna técnica
       `agendamento_publicacao.processamento_iniciado_em` + função
       `claim_agendamento_publicacao` (reserva atômica via `UPDATE ...
       WHERE status='Agendado' AND (...)`, com timeout de 300s para
       reservas travadas). Chamada em `publicacao.service.ts` ANTES de
       `publishImage`; `register_publicacao_falha` limpa a reserva para
       permitir nova tentativa no próximo tick.
    2. Erro em um agendamento interrompia o lote inteiro (demais
       agendamentos vencidos ficavam sem processar naquela execução):
       `for` de `processarAgendamentosVencidos` agora isola cada item em
       `try/catch` próprio.
  - 4 testes novos cobrindo os fixes (repository: 3 casos de
    `claimAgendamentoParaPublicacao`; service: reserva já tomada → não
    publica de novo; erro isolado não impede os demais itens do lote).
- **BLOCKED_EXTERNAL_CREDENTIAL** (mesma causa das fases anteriores):
  `SUPABASE_SERVICE_ROLE_KEY` ausente — nenhuma migration aplicada,
  nenhuma publicação real (automática ou manual) exercitada contra
  banco/Instagram reais. `INSTAGRAM_ACCESS_TOKEN`/`INSTAGRAM_ACCOUNT_ID`
  ausentes (publicação automática real não testável). Toda a lógica está
  coberta por testes unitários/integração com mocks.
- Nenhum commit foi feito nesta sessão (aguardando pedido explícito).
- **Fases concluídas:** 1–12 (código + testes + revisão sem CRITICAL/HIGH
  pendente).
- **Próxima etapa:** Fase 13 — Dashboard e experiência completa
  (indicadores derivados de dados reais, avisos de atraso/bloqueio,
  pendências de avaliação/agendamento/publicação, estados vazios/erros).

## 2026-08-17 — Fase 13 EM ANDAMENTO (Dashboard e experiência — lado designer)

- Escopo desta leva: painel "Pendências" na home do designer
  (`DesignerHome.tsx`), com contagens reais por status (`Ajustes`,
  `Enviado para avaliação`, `Aprovado`, `Agendado`) via
  `GET /api/solicitacoes?status=X` (endpoint RF005 já existente — nenhuma
  rota nova criada). Cada contagem linka para
  `/designer/solicitacoes?status=X`; `SolicitacoesPage.tsx` passou a ler/
  escrever o filtro de status na URL (`useSearchParams`) para permitir o
  deep-link. Aviso de bloqueio (RF006) mantido como já existia.
- Testes novos: `DesignerHome.test.tsx` (3 casos: pendências reais +
  link filtrado, estado vazio, erro não mascarado) e 1 caso novo em
  `SolicitacoesPage.test.tsx` (inicialização do filtro via URL).
- Gate completo: `typecheck`, `lint`, `test` (252 backend + 49 frontend =
  301), `build` — todos verdes.
- `designhub-frontend-reviewer` (background, leitura, escopo restrito à
  leva): **PASS** — nenhum CRITICAL/HIGH.
- Lado Administrador: nenhum painel novo criado — `DesignersPage.tsx` já
  lista o indicador de bloqueio por designer (RF006/RN12), suficiente
  para RF001/RF015/RF016 sem exigir um dashboard adicional (evita
  scope creep de "novo módulo" não documentado).
- **Fase 13 CONCLUÍDA.** Nenhum commit feito nesta sessão.
- **Fases concluídas:** 1–13.
- **Próxima etapa:** Fase 14 — LGPD, hardening e auditoria (minimização
  de dados, aviso/termo de tratamento necessário ao fluxo, retenção,
  segurança de arquivos/tokens, auditoria de permissões/IDOR, testes de
  autorização negativos).

## 2026-08-17 — Fase 14 CONCLUÍDA (LGPD, hardening, auditoria)

- **Informação ao titular (RNF010):** aviso de finalidade/base legal
  (LGPD, Lei nº 13.709/2018) adicionado nos dois únicos pontos de
  contato direto com o cliente: (1) primeira mensagem do questionário
  WhatsApp (`atendimentoQuestions.ts`, pergunta `confirmacao`), (2)
  rodapé da tela pública de avaliação (`AvaliacaoPage.tsx`, RF009) —
  texto estático, sem novo campo/estado/fluxo. 2 testes novos (backend:
  suíte de atendimento já cobria a pergunta via referência dinâmica, sem
  quebra; frontend: 1 caso novo em `AvaliacaoPage.test.tsx`).
- **Retenção/minimização/segurança de arquivos e tokens:** documentado em
  `docs/seguranca/BASELINE_SEGURANCA.md` (nova seção "LGPD — minimização,
  finalidade, informação e retenção") — confirma que nenhum dado além do
  DER é coletado, mapeia finalidade por fluxo, e registra que prazo de
  retenção específico é decisão documental (ADR) fora do escopo do
  agente, não implementação espontânea.
- **Auditoria de permissões/IDOR:** não repetida como sweep completo
  nesta fase — já coberta cumulativamente pelas revisões
  `designhub-security-reviewer`/`designhub-database-reviewer` rodadas ao
  fechar cada fase anterior (7 menções a IDOR já registradas neste
  arquivo nas Fases 1–12), conforme modo econômico ("não peça análise
  completa do projeto a um subagente" quando já há evidência
  equivalente). Testes de autorização negativa já existem nas suítes de
  rotas (`403`/ownership) para os principais endpoints sensíveis.
- Gate completo: `typecheck`, `lint`, `test` (252 backend + 50 frontend =
  302), `build` — todos verdes.
- Nenhum CRITICAL/HIGH pendente. Nenhum commit feito nesta sessão.
- **Fases concluídas:** 1–14.
- **Próxima etapa:** Fase 15 — teste ponta a ponta obrigatório (20
  cenários do roadmap, seção 14). Depende de ambiente com
  `SUPABASE_SERVICE_ROLE_KEY`/migrations aplicadas e credenciais
  WhatsApp/Instagram para os trechos não simuláveis — permanece
  `BLOCKED_EXTERNAL_CREDENTIAL` até essas credenciais serem fornecidas
  (usuário indicou que está providenciando a configuração Meta
  separadamente). Trabalho independente possível nesta fase antes das
  credenciais: revisão/organização de testes E2E automatizáveis
  localmente (mocks) e checklist dos 20 cenários mapeados por fase já
  concluída.

## 2026-08-17 — CHECKPOINT (antes de /clear)

- **Fase atual:** Fase 15 — teste ponta a ponta obrigatório (ainda não
  iniciada).
- **Fases concluídas (código + testes + revisão sem CRITICAL/HIGH
  pendente):** 1–14 (fundação, banco/RLS, RF002 auth, RF001/RF015/RF016
  designers, RF003 clientes, RF004 WhatsApp, RF005/RF006, RF007/RF008
  upload/versões, RF009/RF010 avaliação/ajustes, RF011 máquina de
  estados, RF012/RF013 agendamento, RF014 publicação Instagram+manual,
  dashboard de pendências do designer, LGPD/hardening).
- **Tarefa em andamento:** nenhuma — sessão em espera, sem trabalho
  iniciado na Fase 15.
- **Último ponto concluído:** commit de checkpoint `721eec7`
  ("Checkpoint: Fases 1-14 do DesignHub") criado e working tree
  confirmado limpo (`git status` sem alterações pendentes).
- **Próximo passo exato:** aguardar o usuário fornecer
  `SUPABASE_SERVICE_ROLE_KEY` (aplicar as 19 migrations em
  `supabase/migrations/`) e credenciais WhatsApp Cloud API/Instagram API;
  então executar os 20 cenários E2E da Fase 15 (seção 14 do
  `CLAUDE.md`). Sem credenciais, não iniciar Fase 15 de forma
  especulativa.
- **Testes verdes ainda válidos (nenhum arquivo de código alterado desde
  então):** gate completo do commit `721eec7` — `typecheck`, `lint`,
  `test` (252 backend + 50 frontend = 302 testes), `build`, todos
  verdes.
- **Arquivos principais alterados na última leva (já commitados):**
  `backend/src/services/publicacao.service.ts` +
  `backend/src/repositories/publicacao.repository.ts` (reserva atômica
  do job de publicação), `supabase/migrations/20260816190000_publicacao_functions.sql`,
  `frontend/src/features/designer/DesignerHome.tsx` (painel de
  pendências), `frontend/src/features/designer/solicitacoes/SolicitacoesPage.tsx`
  (filtro via URL), `backend/src/services/atendimentoQuestions.ts` +
  `frontend/src/features/avaliacao/AvaliacaoPage.tsx` (aviso LGPD),
  `docs/seguranca/BASELINE_SEGURANCA.md`.
- **Bloqueios externos:** `BLOCKED_EXTERNAL_CREDENTIAL` —
  `SUPABASE_SERVICE_ROLE_KEY` ausente (nenhuma migration aplicada em
  ambiente real); credenciais WhatsApp Cloud API ausentes; credenciais
  Instagram API (`INSTAGRAM_ACCESS_TOKEN`/`INSTAGRAM_ACCOUNT_ID`)
  ausentes; `INTERNAL_JOB_SECRET` ausente. Nenhuma funcionalidade foi
  exercitada contra banco/Meta reais nesta sessão — toda a lógica está
  coberta por testes unitários/integração com mocks.
- **Pendências reais:** Fase 15 (E2E real) e Fase 16 (deploy) bloqueadas
  por credenciais + exigem autorização explícita para ações de
  produção/deploy (seção 13 do `CLAUDE.md`). Matriz de rastreabilidade
  (`docs/rastreabilidade/MATRIZ_RASTREABILIDADE_DESIGNHUB.csv`) ainda
  mostra `PENDENTE` para todos os RFs — decisão de como atualizá-la
  (semântica da coluna `Status_Inicial`) pendente de confirmação do
  usuário antes de qualquer edição. Nenhum segredo registrado neste
  arquivo.

## 2026-08-17 — Fase 15 EM ANDAMENTO: Supabase real validado, migrations aplicadas, core do fluxo E2E validado

- **Achado sobre `.env.local`:** o usuário informou que as credenciais reais
  do Supabase já estavam preenchidas. Na prática, o arquivo continha só o
  par público (`NEXT_PUBLIC_SUPABASE_URL`/`..._PUBLISHABLE_KEY`, já
  validado desde a Fase 1) mais notas em texto livre copiadas do painel
  Supabase (login do dashboard, `DATABASE PASSWORD`, connection string com
  placeholder `[YOUR-PASSWORD]`, e uma "Secret key" no formato novo
  `sb_secret_...`) — nenhuma dessas linhas estava no formato `KEY=VALUE`
  que o `dotenv` da aplicação ou o Supabase CLI conseguem interpretar.
  Corrigido sem nunca exibir os valores em texto: (1) todas as linhas que
  não são `KEY=VALUE` foram comentadas com `#` (o CLI da Supabase também
  tenta fazer parse estrito do `.env.local` e falhava com
  `LegacyDbConfigLoadError` antes dessa limpeza); (2) `SUPABASE_SECRET_KEY`
  e `SUPABASE_DB_URL` (com o placeholder de senha substituído pelo valor
  real de `DATABASE PASSWORD`) foram adicionados como variáveis próprias;
  (3) `.gitignore` ganhou uma regra dedicada para nunca versionar
  credenciais sintéticas de teste (`*.local.json`, `**/.e2e-credentials*`).
  Credenciais WhatsApp Cloud API (`WHATSAPP_ACCESS_TOKEN`,
  `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_BUSINESS_ACCOUNT_ID`, `META_APP_ID`,
  `META_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN`) também já estavam presentes e
  aparentemente válidas, mas **não foram exercitadas nesta sessão**, por
  instrução explícita do usuário de aguardar o aviso de que WhatsApp/
  Instagram estão prontos — registrado como `BLOCKED_EXTERNAL_META` por
  decisão do usuário, não por ausência técnica de credencial.
- **Código (não-funcional, seção 10 do CLAUDE.md):** `backend/src/config/env.ts`
  e `backend/src/config/supabase.ts` passaram a aceitar `SUPABASE_SECRET_KEY`
  (formato novo de API key do Supabase) como preferencial, com
  `SUPABASE_SERVICE_ROLE_KEY` mantida como fallback legado — sem alterar
  nenhum contrato de API/RF/RN.
- **Migrations aplicadas pela primeira vez a um banco real** (projeto
  `hfwgodzvitinubarwrjm`, via `npx supabase db push --db-url`, já que não
  havia `psql`/`supabase` CLI local nem acesso MCP ao projeto — resolvido
  com `npx --yes supabase`). As 18 migrations das Fases 2–12 foram
  aplicadas com sucesso. Três classes de bug real só detectáveis contra
  Postgres real (nenhum mock as capturava) foram encontradas e corrigidas:
  1. **`solicitacao.prazo_primeira_versao`** e **`agendamento_publicacao.data_hora_publicacao`**
     eram `generated always as (...) stored` usando `timestamptz + interval`
     e `AT TIME ZONE`, respectivamente — ambos operadores são `STABLE`, não
     `IMMUTABLE`, e PostgreSQL rejeita expressão não-imutável em coluna
     gerada (SQLSTATE 42P17). Corrigido nas próprias migrations originais
     (ainda não haviam sido aplicadas com sucesso) convertendo as duas para
     colunas normais mantidas por trigger `BEFORE INSERT`/`BEFORE UPDATE`
     — mesmo valor, mesma regra de negócio (RN11), só troca de mecanismo.
  2. **Faltavam `GRANT` de base nas tabelas de negócio** para
     `service_role`/`authenticated` — RLS (Fase 2) é a segunda camada de
     defesa, mas sem `GRANT` o Postgres nega a query antes mesmo de avaliar
     RLS (mesmo `service_role`, que ignora RLS mas não ignora `GRANT`,
     recebia `42501 permission denied`). Este projeto Supabase não tinha os
     privilégios padrão pré-configurados. Corrigido com nova migration
     `20260817200000_grant_base_table_privileges.sql` (GRANT explícito +
     `ALTER DEFAULT PRIVILEGES` para que futuras tabelas herdem
     automaticamente) — modelo de privilégio idêntico ao já documentado em
     `20260816120800_rls_policies.sql` (service_role: CRUD completo;
     authenticated: só SELECT; RLS decide as linhas).
  3. **Três funções `SECURITY DEFINER` com `returns table (...)` tinham
     coluna ambígua em runtime** (SQLSTATE 42702 — OUT parameter da
     cláusula `returns table` colidindo com o nome de uma coluna real
     referenciada sem qualificador em `SELECT`/`UPDATE ... WHERE`):
     `register_versao_arte` (`numero_versao`), `generate_avaliacao_link_token`
     (`id_versao`) e `submit_avaliacao` (`id_solicitacao`). `CREATE FUNCTION`
     não valida isso em tempo de criação (plpgsql só valida a query no
     primeiro `EXECUTE`), por isso as migrations originais foram aplicadas
     sem erro aparente e o bug só apareceu ao chamar as funções de verdade.
     Corrigido qualificando as colunas com o nome da tabela; migrations de
     hotfix `20260817200100`/`20260817200200` redefinem as funções (as
     migrations originais também foram editadas para refletir a correção,
     já que ainda não tinham sido aplicadas com sucesso quando corrigidas).
     Varredura proativa confirmou que as demais funções `returns table`
     (`create_agendamento`) e as sem `returns table` não têm o mesmo padrão.
- **Validação real pós-fix (leitura/escrita contra o banco real, chave
  anon vs. `service_role`):** anon corretamente barrado (`401`) em tabela
  de negócio; `service_role` lê todas as 14 tabelas de negócio (`200`);
  bucket privado `artes` acessível e configurado (`application/pdf`,
  `image/jpeg`, `image/png`, 15 MB).
- **Bootstrap de dados sintéticos de teste (RNF010/seção 12.5 — dado
  sintético, identificado, nunca leva à produção):** `scripts/bootstrap-e2e-admin.mjs`
  (novo, criação do primeiro administrador — RF001-016 não cobrem "criar o
  1º admin", é bootstrap de operação, não funcionalidade de produto) +
  bootstrap equivalente ad hoc para dois designers de teste. Credenciais
  gravadas só em `docs/evidencias/.e2e-credentials.local.json`
  (gitignored, nunca impresso em texto legível na conversa).
- **Cenários E2E executados contra o Supabase/backend reais nesta sessão**
  (subset dos 20 da seção 14 do CLAUDE.md que não depende de WhatsApp/
  Instagram, conforme instrução do usuário):
  - Admin autentica (`/api/auth/me`) → cria designer real via `POST
    /api/designers` **bloqueado por rate limit de e-mail do Supabase
    Free tier** (`over_email_send_rate_limit`, confirmado com chamada
    direta ao `auth/v1/invite` — real, não é bug de código; RF001/RF004
    via convite por e-mail ficam pendentes de nova tentativa quando a
    cota resetar). Designers de teste seguintes foram semeados via
    `admin.createUser` (mesmo mecanismo administrativo, sem e-mail) para
    não consumir mais cota e permitir continuar a validação.
  - Designer autentica → cria cliente real (RF003) → OK.
  - Solicitação semeada diretamente (bypass do atendimento WhatsApp,
    RF004, por instrução do usuário) → `prazo_primeira_versao` calculado
    corretamente pelo trigger (fix #1 confirmado em produção).
  - RF007/RF008 upload V1 real (Storage + RPC) → status "Enviado para
    avaliação" (fix #3 confirmado).
  - RF009 preview público com URL assinada real + decisão "Ajustes" via
    token real (fix #3 confirmado) → status "Ajustes".
  - RF007/RF008 upload V2 → "Enviado para avaliação"; RF011 histórico com
    as 3 transições corretas confirmado via `GET /api/solicitacoes/1`.
  - RF009 decisão "Aprovado" com V2 → status "Aprovado".
  - RF012 criar agendamento → RF013 cancelar com >3h de antecedência
    (permitido, `204`) → RF013 cancelar com <3h de antecedência
    (corretamente **rejeitado**, `409`, RN31) — primeira tentativa deu
    falso positivo por erro de fuso horário no dado de teste (UTC passado
    como se fosse horário de parede America/Sao_Paulo), corrigido no
    próprio teste, não no produto; segunda tentativa confirmou a regra.
  - RF014 publicação manual → status final "Publicado".
  - RN44/RN49 isolamento: designer2 recebe `404` ao tentar ver solicitação
    de designer1 (sem vazar existência).
  - RF016 reatribuição pelo admin (`PATCH /:id/reatribuir`, campo correto
    é `novoDesignerId`) → histórico com 11 entradas preservado, 2 versões
    preservadas, designer2 passa a ver, designer1 perde acesso (`404`).
  - RF006 bloqueio: `sync_designer_bloqueio` chamada diretamente (o
    gatilho real é `iniciarAtendimento`, também dependente de WhatsApp) com
    uma solicitação com `prazo_primeira_versao` genuinamente vencido →
    `designer.bloqueado = true`; após cancelar a pendência e resincronizar
    → `false`. Confirma RN11/RN12 corretamente implementados.
- **Gate completo pós-fix:** `npm run lint`, `npm run typecheck` (ambos
  limpos nos dois workspaces), `npm run test` — **302 testes (252 backend +
  50 frontend), todos verdes, sem alteração de contagem** (os fixes foram
  em SQL/migrations e em `env.ts`/`supabase.ts`, sem exigir novo teste
  unitário — a cobertura real veio da validação E2E contra o banco de
  verdade acima), `npm run build` — verde nos dois workspaces.
- **BLOCKED_EXTERNAL_META** (por decisão do usuário, não por falta de
  credencial técnica): RF004 (atendimento WhatsApp) e RF014 automático
  (Instagram) não foram exercitados nesta sessão. Retomar quando o usuário
  confirmar que WhatsApp/Instagram estão prontos.
- **BLOCKED_EXTERNAL (quota, não credencial):** criação de designer via
  convite por e-mail real (RF001) esbarrou no limite de envio de e-mail do
  Supabase Free tier depois de poucas tentativas nesta sessão. Não é um
  bug — é o limite documentado do provedor de e-mail embutido gratuito.
  Retestar quando a cota resetar (ou, se o usuário quiser testar RF001 via
  convite de forma mais ampla, configurar um provedor SMTP próprio no
  projeto Supabase — decisão de infraestrutura, não implementada
  espontaneamente).
- **Pendências reais para fechar a Fase 15 (no momento deste registro,
  ver entrada seguinte para o que foi resolvido depois):** RF004
  (WhatsApp real) e RF014 automático (Instagram real), RF001 via convite
  real (rate limit), cenários de concorrência (upload simultâneo,
  agendamento simultâneo) e os testes negativos de autenticação/
  autorização adicionais listados na seção 14 — os já cobertos pela suíte
  de testes unitários/integração (mocks) não foram repetidos ao vivo por
  não serem necessários (mesmo comportamento, já provado). Matriz de
  rastreabilidade ainda não atualizada (pendência antiga, já registrada).
- **Próxima etapa:** aguardar sinal do usuário para WhatsApp/Instagram;
  enquanto isso, considerar testar novamente a criação de designer via
  convite real quando a cota de e-mail resetar, e revisar concorrência
  (upload duplo simultâneo, agendamento duplo simultâneo) contra o banco
  real.

## 2026-08-17 — Fase 15: concorrência real + cenários restantes (não-Meta) concluídos

- Escopo desta leva: cenários de concorrência real contra o Supabase de
  verdade (não simulados/mock) e o restante dos 20 cenários da seção 14
  que não dependem de WhatsApp/Instagram, a pedido do usuário. Nenhuma
  alteração de código/schema nesta leva — só uso do sistema já corrigido
  na leva anterior. Solicitações de teste sintéticas 3–9 semeadas
  diretamente (mesma justificativa RNF010/12.5 já registrada).
- **Concorrência real (4 corridas, requisições HTTP simultâneas via
  `curl ... & / wait`):**
  1. **Upload duplo simultâneo (RF007/RF008, RN17):** duas requisições
     `POST /:id/versoes` para a mesma solicitação ao mesmo tempo — o lock
     `for update` de `register_versao_arte` serializou corretamente: uma
     venceu (V1, transição de status), a outra recebeu `409` limpo ("não
     está em um status que permite envio") em vez de duplicar `numero_versao`
     ou corromper o status.
  2. **Agendamento duplo simultâneo (RF012, RN30):** duas
     `POST /:id/agendamento` simultâneas para a mesma solicitação
     `Aprovado` — só uma criou o agendamento (`201`), a outra recebeu
     `409` limpo; confirmado por query direta que existe exatamente 1
     agendamento ativo (backstop `agendamento_ativo_unico_idx` + lock da
     RPC funcionando em conjunto).
  3. **Double-submit de avaliação com o mesmo token (RF009, unique(id_versao)):**
     duas submissões simultâneas do mesmo token — só uma decisão foi
     persistida (`avaliacao` com 1 linha), a outra rejeitada. Na primeira
     tentativa a perdedora recebeu um `500` genérico (mas seguro, sem
     stack/segredo) com causa "JWT issued at future" nos logs; investigado
     como possível instabilidade transitória de borda do Supabase (não
     reproduzido) — relógio local conferido e correto (sem *skew* contra
     referência externa). Repetição imediata do mesmo cenário com um novo
     token produziu o resultado correto e esperado: vencedora `200`,
     perdedora `409` "Link de avaliação já utilizado". Registrado como
     **LOW/observação** (falha transitória externa, sem violação de
     integridade em nenhuma das duas execuções, sem ação de código
     necessária — não reproduzido em nova tentativa).
  4. **Publicação manual duplicada simultânea (RF014, idempotência):**
     duas `POST /:id/publicacao-manual` simultâneas para o mesmo
     agendamento — só uma teve sucesso (`204`, `publicacao.status='sucesso'`
     única linha), a outra recebeu `409` limpo ("agendamento não está
     ativo"); confirma `claim_agendamento_publicacao`/
     `publicacao_unica_sucesso_idx` também protegem o caminho manual, não
     só o automático (Fase 12 havia corrigido isso só pensando no job
     automático).
- **Cenários restantes cobertos nesta leva (não-Meta, contra o backend/
  Supabase reais):**
  - RF009 decisão "Cancelado" → status "Cancelado"; reuso do mesmo token
    depois de usado → `409` limpo.
  - RF012 edição de agendamento ativo (`PATCH`, corpo completo — o schema
    de update reaproveita o mesmo schema de criação, não é `PATCH`
    parcial) → legenda/data/horário atualizados corretamente.
  - Negativos: requisição sem token → `401`; token corrompido → `401`;
    designer chamando rota admin-only (`GET /api/designers`) → `403`;
    designer2 tentando baixar versão de solicitação de designer1 → `404`
    uniforme (sem vazar existência); upload em solicitação `Cancelado`
    (estado terminal) → `409`; arquivo com assinatura de bytes de
    executável disfarçado de PDF → `400` rejeitado pela checagem de
    assinatura real (Fase 8), nunca pela extensão/Content-Type declarado.
- Com isso, **19 dos 20 cenários da seção 14 estão cobertos** (ao vivo
  contra Supabase real ou, quando genuinamente impossível sem Meta, via a
  RPC/lógica de negócio real chamada diretamente) — só restam RF004
  (atendimento WhatsApp real) e RF014 automático (Instagram real), ambos
  aguardando o sinal do usuário. RF001 via convite por e-mail real
  continua pendente da liberação da cota do Supabase Free tier.
- Nenhuma alteração de código nesta leva → gate completo (`lint`,
  `typecheck`, `test` 302/302, `build`) não precisou ser re-executado
  (nenhum arquivo versionado mudou desde a última execução verde
  registrada na entrada anterior).
- **Pendências reais remanescentes:** RF004/RF014-automático/RF001-convite
  (bloqueios externos, ver acima), matriz de rastreabilidade (pendência
  antiga), decidir se as 9 solicitações de teste sintéticas semeadas nesta
  fase (IDs 1–9, cliente 1, designers de teste) devem ser limpas do banco
  antes do Fase 16 (deploy) ou mantidas como evidência — decisão do
  usuário, não assumida unilateralmente.
- **Próxima etapa:** aguardar sinal do usuário sobre WhatsApp/Instagram
  para fechar RF004/RF014 automático; ou avançar para Fase 16 (deploy) —
  também exige autorização explícita do usuário (seção 13 do CLAUDE.md).

## 2026-08-17 — Limpeza dos dados de teste (a pedido do usuário)

- Removidas do Supabase real, em ordem segura de FK (`on delete restrict`
  exigiu ordem: `publicacao` → `agendamento_publicacao` → `ajuste` →
  `avaliacao` → `avaliacao_link_token` → `versao_arte` → `historico_solicitacao`
  → `solicitacao` → `cliente`): as 9 solicitações sintéticas de teste
  (IDs 1–9) e todo o encadeamento gerado durante a Fase 15 (2 publicações,
  5 agendamentos, 1 ajuste, 7 avaliações, 7 tokens de avaliação, 8 versões
  de arte, 26 entradas de histórico, 1 cliente de teste). Os 8 arquivos
  reais correspondentes no bucket privado `artes` (Storage) também foram
  removidos.
- **Preservados intencionalmente** (não são "solicitações de teste", são
  contas administrativas de teste ainda necessárias para os cenários
  RF004/RF014 pendentes de WhatsApp/Instagram): os 3 usuários de teste
  (`e2e.admin@designhub.adm`, `e2e.designer1@designhub.adm`,
  `e2e.designer2@designhub.adm`) em `usuario`/`designer`/`administrador`
  — credenciais seguem só em `docs/evidencias/.e2e-credentials.local.json`
  (gitignored).
- Verificado após a limpeza: contagem 0 em todas as 9 tabelas de negócio
  tocadas pela Fase 15, bucket `artes` sem nenhum objeto residual sob
  `solicitacoes/`, banco pronto para uma nova rodada de testes ou para
  avançar de fase sem dado sintético misturado.
- Nenhuma alteração de código/migration nesta operação — só limpeza de
  dados via `service_role`.

## 2026-08-17 — Matriz de rastreabilidade resolvida

- Pendência antiga (semântica de `Status_Inicial`) resolvida sem reescrever
  a coluna original: ela permanece como baseline histórico (`PENDENTE`).
  Adicionadas 3 colunas novas em
  `docs/rastreabilidade/MATRIZ_RASTREABILIDADE_DESIGNHUB.csv`:
  `Status_Atual`, `Evidencia_Real`, `Bloqueio_Externo`. Legenda completa em
  `docs/rastreabilidade/README.md` (novo).
- Preenchidos os 16 RFs com o estado real desta sessão (Fase 15):
  **10 `IMPLEMENTADO_E2E_REAL`** (RF002, RF005–RF013, RF016),
  **2 `IMPLEMENTADO_E2E_PARCIAL`** (RF003 — só criação testada ao vivo;
  RF014 — só o caminho manual), **2 `IMPLEMENTADO_TESTES_UNITARIOS`**
  (RF001, RF015 — convite real bloqueado por rate limit de e-mail, não
  Meta) e **1 `BLOQUEADO_EXTERNO_META`** (RF004). `Bloqueio_Externo`
  preenchido nos RFs afetados por Meta (RF004, RF006 parcial, RF011
  parcial, RF014 parcial) e no único bloqueado por cota de e-mail (RF001).
- Nenhuma alteração de código nesta operação — só documentação/
  rastreabilidade.

## 2026-08-18 — CHECKPOINT (antes de /clear)

- **Fase atual:** Fase 15 (E2E), corrigindo achado da auditoria RF004
  (itens 6/12: verificação de solicitação em andamento).
- **Fases concluídas:** 1–14 completas; Fase 15 com 19/20 cenários da
  seção 14 validados ao vivo, concorrência real testada, matriz de
  rastreabilidade preenchida. Só faltam RF004/RF014-automático (Meta).
- **Tarefa em andamento:** auditoria comparativa RF004 (fluxo
  Designer→Cliente→WhatsApp/chatbot) contra o TFC encontrou 4 divergências
  reais; a pedido do usuário, corrigidos agora só os itens 6/12
  (verificação de solicitação em andamento antes de iniciar atendimento/
  criar solicitação). Itens 14 (imagem de referência via Media API), 17
  (log de mensagens enviadas) e 20 (template Meta) **não foram tocados**
  por decisão explícita do usuário — aguardando ambiente WhatsApp/
  Instagram pronto.
- **Último ponto concluído:** código do fix (RF004) implementado em duas
  camadas (aplicação + RPC), testado (4 testes novos) e com gate completo
  100% verde. Migration nova escrita e validada, mas **NÃO aplicada** ao
  Supabase real nesta sessão — `.env.local` estava sendo editado pelo
  usuário no meio da sessão (voltou ao formato de notas cruas, sem
  `SUPABASE_SECRET_KEY`/`SUPABASE_DB_URL`); não foi mexido para não
  colidir com a preparação de ambiente em andamento.
- **Próximo passo exato:** quando `.env.local` estiver estável (WhatsApp/
  Instagram prontos), (1) reconfirmar `SUPABASE_SECRET_KEY`/
  `SUPABASE_DB_URL` no formato `KEY=VALUE` (mesmo procedimento já usado
  antes: extrair da "Secret key"/"Database URL — Session pooler" das
  notas, sem nunca imprimir o valor), (2) aplicar
  `supabase/migrations/20260818100000_atendimento_checa_solicitacao_em_andamento.sql`
  via `npx supabase db push --db-url`, (3) reexecutar ao vivo o cenário
  "designer inicia 2º atendimento com solicitação ainda aberta" para
  confirmar o `409` esperado contra o banco real, (4) então avaliar com o
  usuário se implementa os itens 14/17/20 do RF004 (dependem de Meta) ou
  segue para Fase 16.
- **Testes verdes ainda válidos:** `lint`, `typecheck` limpos;
  `test` — **256 backend (+4) + 50 frontend = 306**, todos verdes;
  `build` verde nos dois workspaces. Executados após o fix desta leva,
  nenhum arquivo mudou depois.
- **Arquivos principais alterados (não commitados):**
  - `backend/src/repositories/atendimento.repository.ts` (nova
    `findSolicitacaoEmAndamentoByClienteId`)
  - `backend/src/repositories/atendimento.repository.test.ts` (+3 testes)
  - `backend/src/services/atendimento.service.ts` (`iniciarAtendimento`
    chama a nova checagem antes de criar o atendimento)
  - `backend/src/services/atendimento.service.test.ts` (+1 teste)
  - `supabase/migrations/20260818100000_atendimento_checa_solicitacao_em_andamento.sql`
    (novo — mesma checagem na RPC `complete_atendimento_and_create_solicitacao`,
    defesa em profundidade; **não aplicado ao banco real ainda**)
- **Bloqueios externos:** `BLOCKED_EXTERNAL_META` (RF004 real, RF014
  automático) — usuário está preparando o ambiente WhatsApp/Instagram,
  não deve ser tocado agora. `.env.local` sem `SUPABASE_SECRET_KEY`/
  `SUPABASE_DB_URL` no momento (formato de notas cruas) — bloqueia
  aplicar a nova migration até ser reconfigurado.
- **Pendências reais:**
  - Aplicar a migration `20260818100000` ao Supabase real (bloqueada por
    `.env.local`, ver acima).
  - Itens 14/17/20 da auditoria RF004 (imagem de referência via Media
    API; log de mensagens enviadas pelo sistema; `type:'template'` para
    mensagem business-initiated) — não implementados, aguardando decisão/
    ambiente do usuário.
  - RF001 via convite real (rate limit de e-mail do Supabase Free).
  - Nenhum commit foi feito nesta sessão.

## 2026-08-19 — CHECKPOINT: itens 14/17/20 do RF004 implementados (modo econômico)

- A pedido do usuário (modo econômico ativado + "implemente tudo
  independente das credenciais"), os 3 itens da auditoria RF004 antes
  deferidos foram implementados nesta leva, com 3 decisões de design
  confirmadas via pergunta ao usuário (nenhuma inventada):
  1. **Item 20 (template Meta):** `sendTemplateMessage()` novo em
     `backend/src/integrations/whatsapp/whatsappClient.ts`; `iniciarAtendimento`
     (`atendimento.service.ts`) agora abre a conversa com `type:'template'`
     em vez de texto livre (exigência da Cloud API para mensagem
     business-initiated fora da janela de 24h). Nome/idioma configuráveis
     via `WHATSAPP_TEMPLATE_NAME`/`WHATSAPP_TEMPLATE_LANGUAGE` (novas envs
     opcionais, `env.ts`). Usuário ainda não tem template aprovado no
     Business Manager → `BLOCKED_EXTERNAL_META` para o teste real; código
     pronto e testado com mocks.
  2. **Item 17 (log de saída):** sem tabela nova (DER congelado) — log
     técnico `console.info` (`kind`+`wamid`+timestamp, sem PII) após cada
     envio bem-sucedido.
  3. **Item 14 (mídia de referência):** `downloadMediaFromWhatsApp()` novo
     — fluxo oficial de 2 etapas da Meta Media API. Formato validado por
     assinatura de bytes real (reusa `lib/fileSignature.ts` do RF007,
     nunca o `mime_type` declarado); upload no bucket privado `artes` já
     existente, path `atendimentos/{idAtendimento}/referencias/{uuid}.{ext}`.
     Falha de download/validação vira texto de erro registrado na resposta
     em vez de travar o atendimento (Gate G — idempotência do webhook já
     marcou o evento, então não há reentrega da Meta para tentar de novo).
- `whatsapp.schemas.ts`: schema de mensagem inbound ganhou `image`/`document`
  opcionais (`id`, `mime_type`) para o payload real da Meta.
- Revisão de segurança focada (`designhub-security-reviewer`, escopo
  limitado ao diff) rodou depois da implementação: 0 CRITICAL/HIGH. 1
  MEDIUM (SSRF hardening — validar host/protocolo da URL de mídia antes de
  reenviar o Bearer token nela) **corrigido nesta mesma leva**
  (`isTrustedMetaMediaUrl`, allowlist de domínios Meta). 2 LOW registrados
  como pendência de polimento (não corrigidos, risco baixo, seção 3.5
  permite adiar LOW): (a) `sendTextMessageBestEffort` loga `error.message`
  que pode ecoar o corpo bruto de erro da Graph API; (b) `extractAnswerText`
  loga `error.message` de falhas de rede não tipadas — trocar por strings
  fixas quando a Fase 14 (hardening) ou uma etapa de polimento for revisada.
- **Frontend não tocado**: a resposta da pergunta 'referencia' agora grava
  o *path* do Storage (não uma URL assinada) no campo `resposta` — o
  detalhe de solicitação (RF005) hoje só exibe esse campo como texto cru,
  sem link clicável. Ficou fora do escopo desta leva (o usuário só pediu
  o download/upload no backend); se quiser exibir a imagem, precisa de um
  endpoint que gere URL assinada a partir do path antes de renderizar.
- Testes: `backend/src/integrations/whatsapp/whatsappClient.test.ts` (novo,
  8 testes) + `atendimento.service.test.ts` (+4 testes, total 16) cobrindo
  os 3 itens e o hardening de SSRF. **Backend: 256 → 267 testes, todos
  verdes** (`npm run verify` completo na raiz: lint+typecheck+test+build
  dos dois workspaces, incluindo o frontend — 50 testes, sem regressão).
- Nenhuma migration nesta leva (nenhuma mudança de schema — reusa
  `resposta_cliente.resposta` (`text`) e o bucket `artes` já existentes).
## 2026-08-19 — CHECKPOINT: SUPABASE_SECRET_KEY/DB_URL configuradas + migration aplicada; iniciando Fase 16 (deploy)

- Usuário liberou `.env.local` completo (formato de notas — chaves com
  rótulos diferentes dos nomes canônicos). Extração feita por script
  local (lido o arquivo, `SUPABASE_SECRET_KEY` e `SUPABASE_DB_URL`
  derivados e gravados de volta em `.env.local` em formato `KEY=VALUE`)
  — nenhum valor apareceu na conversa/resposta em nenhum momento.
- Migration `20260818100000_atendimento_checa_solicitacao_em_andamento.sql`
  aplicada com sucesso ao Supabase remoto real via `supabase db push
  --db-url` (saída: `"upToDate":false,...,"message":"Finished supabase db
  push."`). Pendência antiga fechada.
- Nota operacional: a CLI da Supabase tenta auto-carregar `.env.local` do
  cwd (feature própria dela) e falha ao parsear porque o arquivo tem
  notas em texto livre — contornado renomeando o arquivo só durante o
  comando e restaurando logo depois (confirmado presente após).
- Descoberta importante: o Supabase MCP conectado a este Claude Code
  aponta para outra conta/projetos (`appcontroledevidaxen`, `Divertex`,
  `DocesMeM`) — **não** o projeto real do TFC (`hfwgodzvitinubarwrjm`,
  conta `tfc01e02@gmail.com`). Por isso a migration foi aplicada via CLI
  (`--db-url`), não via MCP. Mesma divergência de conta observada no
  Git: as notas do usuário citam `github.com/tfc01e02/DesignHub.git`,
  mas o remote `origin` configurado localmente é
  `github.com/MatheuHen/DesignHub.git` (para onde o push de Fase 15/RF004
  já foi feito, autorizado). Não alterado — só registrado para o usuário
  confirmar se é intencional.
- Usuário autorizou Fase 16 (deploy acadêmico R$0) usando a integração
  Vercel já conectada a este Claude Code (conta "Matheus Henrique's
  projects" — confirmada com o usuário antes de criar qualquer recurso;
  a outra conta vista, "VaidaCerto", não será usada). Nada criado no
  Vercel ainda nesta entrada — próximo passo.
- **Pendências reais mantidas:** teste real contra a Meta de todos os
  itens de RF004 (template aprovado, envio, download de mídia) — só
  possível quando o usuário confirmar WhatsApp/Instagram prontos; RF001
  via convite real (cota de e-mail); os 2 LOW de log registrados
  anteriormente; confirmar com o usuário a divergência de conta
  GitHub/Supabase notada acima.
- **Próxima etapa:** continuar o roadmap autonomamente (Fase 16 — deploy
  Vercel) enquanto o ambiente Meta não fica pronto; não há necessidade de
  recheck de credenciais Meta até o usuário
  avisar.

## 2026-08-19 — CHECKPOINT: Fase 16 (deploy acadêmico Vercel) — frontend e backend em produção

- Usuário autorizou a Fase 16 e confirmou a conta Vercel a usar
  ("Matheus Henrique's projects", `team_BvT4K3D5b4ia7nJTdf7kuGNk` — a
  outra conta vista, "VaidaCerto", não foi tocada).
- **Backend em produção:** `https://designhub-backend.vercel.app`.
  Projeto `designhub-backend` criado via `vercel link` (não git-linked —
  ver bloqueio abaixo) e deployado via `vercel build` + `vercel deploy
  --prebuilt`.
  - **Problema real encontrado e corrigido:** `backend/tsconfig.json` e
    o `tsconfig.app.json`/`tsconfig.node.json` do frontend usavam
    `extends: "../tsconfig.base.json"` — path fora do `rootDirectory`
    de cada projeto Vercel, inacessível no sandbox de build isolado por
    projeto. As 5 opções do base foram inlined em cada tsconfig
    (comportamento idêntico, sem `extends`); `tsconfig.base.json`
    removido do repo (sem mais nenhuma referência).
  - **Segundo problema:** com `moduleResolution: "NodeNext"`, o
    type-checker interno da função Node da Vercel (independente do
    nosso `npm run build`) falhava em `helmet`/`express-rate-limit`
    ("This expression is not callable") — não reproduzível localmente
    com `tsc` puro, só dentro do pipeline da própria Vercel
    (`vercel build` local reproduziu o mesmo erro, permitindo iteração
    rápida sem gastar deploys reais). Resolvido trocando
    `module`/`moduleResolution` de `NodeNext`/`NodeNext` para
    `ESNext`/`Bundler` em `backend/tsconfig.json` — mesmo comportamento
    de emissão/runtime (confirmado: `node dist/server.js` local
    continua funcionando), só mudou como o compilador resolve tipos.
  - **Terceiro problema:** mesmo corrigido o type-check, o runtime
    falhava com `Cannot find package 'cors'` — a função Node da Vercel
    não estava empacotando `node_modules` (nem via detecção
    zero-config nem via `builds` legado no `vercel.json`; ambos
    testados e comprovadamente sem dependências no bundle final,
    `du -sh` ~700KB). Resolvido gerando o **próprio bundle** com
    esbuild (`backend/scripts/build-vercel-function.mjs`, novo
    devDependency `esbuild`), empacotando `src/vercelHandler.ts` →
    `backend/api/index.js` num único arquivo autocontido (~3.1MB, zero
    imports externos além de builtins do Node). `api/index.js`/`.map`
    são gerados (gitignorados); o `.ts` fonte fica em `src/` (parte do
    tsconfig/lint/typecheck normal do workspace).
  - **Quarto problema:** bundle ESM quebrava em runtime
    (`Dynamic require of "tty" is not supported`, dependência
    transitiva `debug` fazendo `require()` condicional de módulo nativo
    do Node) — trocado para bundle **CJS**. Como `backend/package.json`
    tem `"type":"module"` (copiado para dentro da função pela Vercel),
    um `.js` CJS ali seria interpretado como ESM; resolvido com
    `backend/api/package.json` (committed, só `{"type":"commonjs"}`),
    que tem precedência de resolução do Node para qualquer arquivo
    dentro de `api/`.
  - **Quinto problema:** a Vercel também detecta `src/app.ts` como uma
    "Express framework" zero-config e cria uma função fantasma paralela
    (`functions/index.func`, sem bundling, mesma falha de
    `node_modules`) que competia pelo roteamento com a nossa função
    real. Suprimido com `"framework": null` + `"outputDirectory":
    "public"` (novo `backend/public/index.html`, placeholder estático
    mínimo, committed — exigido pela Vercel quando `framework` é nulo)
    + `"functions": {"api/**/*.js": {...}}` explícito no
    `backend/vercel.json`.
  - Variáveis de ambiente de produção configuradas via `vercel env add`
    (CLI, valor sempre por stdin — nunca na linha de comando nem na
    resposta): `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`,
    `SUPABASE_SECRET_KEY`, `WHATSAPP_ACCESS_TOKEN`,
    `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_BUSINESS_ACCOUNT_ID`,
    `WHATSAPP_VERIFY_TOKEN`, `META_APP_ID`, `META_APP_SECRET`,
    `INTERNAL_JOB_SECRET` (gerado nesta sessão — 32 bytes aleatórios,
    não existia antes), `FRONTEND_URL`.
  - Smoke test real contra produção: `GET /api/health` → 200 com
    `supabasePublicClient`/`supabaseAdminClient`/`whatsappSendingClient`/
    `whatsappWebhookSecurity` todos `"configured"`; `GET /api/designers`
    sem token → 401; `GET /api/webhooks/whatsapp` com verify_token
    errado → 403; rota inexistente → 404; headers do `helmet` presentes;
    `Access-Control-Allow-Origin` respondendo corretamente à origin real
    do frontend deployado.
- **Frontend em produção:** `https://designhub-frontend-ten.vercel.app`
  (o subdomínio `designhub-frontend.vercel.app` sem sufixo já estava em
  uso por outra conta Vercel — namespace `.vercel.app` é global, não
  por conta; a Vercel escolheu automaticamente o sufixo `-ten`).
  Deploy via `vercel deploy --prod` padrão (Vite zero-config, sem
  necessidade de bundling manual). `VITE_API_URL`/`VITE_SUPABASE_URL`/
  `VITE_SUPABASE_PUBLISHABLE_KEY` confirmados embutidos no bundle
  final via grep no JS servido. Após descobrir a URL real do frontend,
  `FRONTEND_URL` do backend foi corrigida e o backend redeployado (CORS
  confirmado ao vivo contra a origin real).
- **Credenciais Supabase resolvidas nesta leva:** usuário liberou o
  `.env.local` completo (notas cruas, rótulos diferentes dos nomes
  canônicos) e pediu para eu mesmo extrair. `SUPABASE_SECRET_KEY` e
  `SUPABASE_DB_URL` derivados por script local e gravados de volta em
  `.env.local` em formato `KEY=VALUE` — nenhum valor apareceu na
  conversa em nenhum momento. Migration pendente
  `20260818100000_atendimento_checa_solicitacao_em_andamento.sql`
  aplicada ao Supabase remoto real via `supabase db push --db-url`
  (CLI da Supabase tenta auto-carregar `.env.local` do cwd e falha por
  causa das notas em texto livre — contornado renomeando o arquivo só
  durante o comando, restaurado logo depois).
- **BLOQUEIO/observação não resolvida — divergência de conta:** as
  notas do usuário citam GitHub `github.com/tfc01e02/DesignHub.git` e
  Supabase na conta `tfc01e02@gmail.com`, mas o `origin` git local
  aponta para `github.com/MatheuHen/DesignHub.git` (onde o push desta
  sessão já foi feito, autorizado) e o Supabase MCP conectado a este
  Claude Code enxerga outra conta ainda diferente (projetos
  `appcontroledevidaxen`/`Divertex`/`DocesMeM`, não o projeto real do
  TFC). A migration foi aplicada via CLI direta ao projeto correto
  (`hfwgodzvitinubarwrjm`), então não há impacto funcional — só uma
  inconsistência de qual conta é "a oficial do TFC" que vale confirmar
  com o usuário antes da entrega final (Fase 17), para não commitar
  screenshots/URLs da conta errada na documentação do TFC II.
- Nenhum commit feito ainda nesta leva (Fase 16) — aguardando
  autorização explícita de push, mesmo padrão da leva anterior.
- Testes: `npm run verify` completo (lint+typecheck+test+build, dois
  workspaces) verde após todas as mudanças de tsconfig/build; nenhuma
  regressão de teste (contagens inalteradas: 267 backend + 50
  frontend).
- **Pendências reais:** confirmar com o usuário a divergência de conta
  GitHub/Supabase acima; RF004/RF014 automático e RF001-convite
  continuam bloqueados externamente (Meta/cota, sem mudança nesta
  leva); domínio custom do frontend não configurado (usando o
  `*.vercel.app` padrão, dentro do escopo "domínio padrão gratuito do
  provedor" da Fase 16); cron do Supabase (pg_cron → endpoint interno
  de publicação) ainda não configurado — depende de decidir se isso
  acontece antes ou depois do teste real do Instagram (RF014
  automático), já que sem Instagram configurado o job não teria o que
  publicar de qualquer forma.
- **Próxima etapa:** aguardar autorização de commit/push desta leva;
  depois, com o usuário, decidir se avança para configurar o cron do
  Supabase (RF014, mesmo sem Instagram pronto — só a infraestrutura) ou
  se passa para a Fase 17 (documentação/rastreabilidade) enquanto Meta
  não fica pronto.

## 2026-08-19 — CHECKPOINT: RF014 completo (cron pg_cron ligado, Instagram configurado)

- Verificação focada do RF014 contra os documentos oficiais (CLAUDE.md
  seção 5 RF014, RN27-RN35/RN41, seção 11): toda a regra de negócio já
  estava implementada e testada (Fase 12/15) — `processarAgendamentosVencidos`,
  publicação manual, não marcar como publicado em falha, log/RN34-35,
  status `Publicado`. **Único item realmente faltando**: o gatilho de
  horário em si ("No horário programado, validar...") — a seção 11 já
  documenta a solução técnica congelada (pg_cron chamando o endpoint
  interno), então implementado exatamente isso, nada além.
- Usuário atualizou `.env.local` com credenciais reais do Instagram
  (`INSTAGRAM_ACCESS_TOKEN`/`INSTAGRAM_USER_ID`→`INSTAGRAM_ACCOUNT_ID`)
  durante esta leva — configuradas no backend (Vercel) e no `.env.local`.
  Descoberto que `INTERNAL_JOB_SECRET` setado antes na Vercel é
  "sensitive" por padrão (`vercel env add`) e não pode ser lido de volta
  via `vercel env pull` — rotacionado (novo valor gerado, setado na
  Vercel e no Supabase Vault, backend redeployado).
- Migration `20260819110000_publicacao_cron_job.sql` aplicada ao
  Supabase real: `pg_cron`/`pg_net` habilitados, job
  `rf014-processar-publicacoes-vencidas` a cada 5 min chamando
  `POST /api/internal/publicacoes/processar` via `net.http_post`, com o
  segredo lido do Supabase Vault (`internal_job_secret`) — nunca em
  texto na migration.
- **Achado real durante a validação ao vivo (não relacionado à lógica de
  negócio, infraestrutura pré-existente):** primeira execução do cron
  revelou que o Express não tinha `trust proxy` configurado — sob
  tráfego real da Vercel (atrás de um proxy de borda),
  `express-rate-limit` não conseguia validar `X-Forwarded-For`
  (`ERR_ERL_UNEXPECTED_X_FORWARDED_FOR`, ainda respondia 200 mas com
  erro logado). Corrigido com `app.set('trust proxy', 1)` em
  `backend/src/app.ts` (seção 12.3) — não é requisito novo, é correção
  de infraestrutura de segurança pré-existente, agora só visível porque
  há tráfego periódico real.
- Validado ao vivo: cron rodou automaticamente (`cron.job_run_details`:
  `succeeded`) e o backend respondeu 200 sem erros; teste manual direto
  do endpoint também 200 (`processados:0` — sem agendamentos pendentes
  no momento, esperado após a limpeza de dados da Fase 15).
- `npm run verify` completo (lint+typecheck+test+build, dois workspaces)
  verde; 267 testes backend + 50 frontend, nenhuma regressão.
## 2026-08-19 — Teste real de ponta a ponta do RF014 (autorizado pelo usuário)

- Usuário autorizou publicar de verdade no Instagram para validar o
  RF014 fim a fim. Cenário sintético semeado pela API real (designer
  provisionado via Admin API sem e-mail, cliente criado via
  `POST /api/clientes`, solicitação semeada direto na tabela — mesmo
  padrão da Fase 15 —, versão PNG 1x1 real enviada via
  `POST /:id/versoes`, link de avaliação gerado e aprovado via
  `POST /api/avaliacao/:token`, agendamento criado via
  `POST /:id/agendamento` para +90s em horário de parede
  America/Sao_Paulo — mesma regra de timezone do RPC).
- **Resultado:** o job (chamado manualmente para não esperar o ciclo de
  5 min, mesmo código do cron) processou o agendamento e **falhou
  corretamente sem marcar como publicado** — exatamente o comportamento
  exigido pelo RF014 ("Falha automática não pode marcar como
  publicado"). Causa real: `INSTAGRAM_ACCESS_TOKEN` **inválido**
  ("Invalid OAuth access token - Cannot parse access token", erro 190
  da Graph API) — confirmado testando o mesmo token direto contra a
  Graph API a partir da minha máquina (mesmo erro), então não é
  corrupção do meu pipeline (Vercel/env), é o token que o usuário colou
  que não é válido/expirou. `BLOCKED_EXTERNAL_META`.
- Dado de teste limpo após o resultado (agendamento e solicitação
  sintéticos marcados `Cancelado` direto via admin — evita o cron
  reter tentando publicar repetidamente com um token que já se sabe
  inválido). Conta de teste `e2e.rf014.designer@designhub.test`
  preservada para reuso quando o usuário fornecer um token válido
  (mesmo critério da Fase 15 para as contas e2e de admin/designer).
- **Pendências reais:** nenhuma pendência de código/infra para RF014 —
  a máquina de publicação automática, o gatilho de horário e o
  tratamento de falha estão implementados e comprovadamente corretos.
  Falta só um `INSTAGRAM_ACCESS_TOKEN` válido do usuário para o teste
  de publicação bem-sucedida acontecer (o cenário de teste pode ser
  re-semeado a qualquer momento — script usado nesta leva não foi
  commitado, era só validação pontual). RF004 (WhatsApp) segue sem
  template Meta aprovado — `BLOCKED_EXTERNAL_META`; RF001-convite segue
  por cota de e-mail.
