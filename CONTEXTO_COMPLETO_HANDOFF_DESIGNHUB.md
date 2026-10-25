# Contexto Completo — Handoff DesignHub (para migração de chat)

> Gerado em 30/09/2026 a partir de uma auditoria read-only completa do repositório (nenhum código/banco/commit foi alterado). Objetivo: permitir que uma nova conversa retome o projeto sem perder nenhum achado desta sessão. Cole este arquivo (ou peça para o Claude ler o caminho) no início do novo chat.
>
> Observação: o `CLAUDE.md` da raiz (contrato mestre completo com RF001–RF016, RN01–RN51, RNF001–RNF010) já é carregado automaticamente em qualquer nova sessão neste repositório — por isso **não foi duplicado aqui**. Este documento cobre apenas o que foi **descoberto/confirmado por auditoria** nesta conversa.

---

## 1. O que é o DesignHub (resumo)

Sistema web para gerenciar o fluxo de solicitação, produção externa, versionamento, avaliação, ajustes, aprovação, agendamento e publicação/registro de artes digitais no Instagram, com integração ao WhatsApp para coleta estruturada das informações iniciais do cliente. **A arte não é criada nem editada no sistema** — é produzida externamente pelo designer e enviada pronta.

Atores: Administrador, Designer, Cliente, Serviço Automático.
Estados oficiais da solicitação: `Em produção`, `Enviado para avaliação`, `Ajustes`, `Aprovado`, `Cancelado`, `Agendado`, `Publicado`.

---

## 2. Estrutura real do repositório (raiz)

```
DesignHub/
├─ CLAUDE.md                                  # contrato mestre (62KB) — fonte de verdade
├─ README.md
├─ RESUMO_SEMINARIO_10_SEMANA_TFC2.md          # gerado nesta sessão (ver seção 9)
├─ EVIDENCIAS_TESTES_FINAIS.md                 # evidência de 27/09 (parcialmente desatualizada, ver seção 6)
├─ DESIGNHUB_CORRECOES_MELHORIAS_PROGRESS.md
├─ Apresentacao_Seminario_2_DesignHub_FINAL.pptx
├─ k6-health-test.js                           # script do teste de carga k6 (só /api/health)
├─ package.json / package-lock.json
├─ .env.example (só nomes, sem valores) / .env.local (ignorado pelo Git, não lido/exposto nesta auditoria)
├─ .claude/ (agents/ e skills/ do projeto)
├─ backend/        → Node.js + Express 5 + TypeScript
├─ frontend/        → React 19 + TypeScript + Vite
├─ supabase/
│  └─ migrations/   → 49 arquivos .sql (20260816120000 → 20260925200000)
├─ scripts/
└─ docs/
   ├─ decisions/     → 6 ADRs + 1 doc de templates Meta (ver seção 8)
   ├─ evidencias/     → CONTROLE_EXECUCAO.md (218KB), DOSSIE_CAPITULOS_3_4_TFC.md, FASE-17_RESULTADO.md
   ├─ test-evidence/  → checklist-manual-2026-09-15.md
   ├─ traceability/   → matriz-rastreabilidade.md
   ├─ rastreabilidade/, seguranca/, testes/, tfc-oficial/, arquitetura/ (não auditados em detalhe nesta sessão)
```

---

## 3. Backend — achados confirmados por auditoria

**Stack confirmada** (`backend/package.json`): Node.js + Express **5** + TypeScript, zod, Supabase JS, helmet, cors, express-rate-limit, multer, web-push.

**Rotas** (`backend/src/routes/*.ts`, 12 arquivos): `auth`, `designer`, `cliente`, `solicitacao`, `agendamento`, `avaliacao`, `push`, `whatsapp` (webhook), `instagramOAuth`, `internalAtendimento`, `internalPublicacao`, `internalNotificacao`, `health`. Cobrem RF002/RF001/RF015/RF003/RF005/RF012/RF013/RF009/RF004/RF014/RF011.

**Autenticação/autorização** (`backend/src/middleware/auth.ts`):
- `requireAuth` valida token Supabase Auth (Bearer) sem confiar em id/perfil enviado pelo cliente.
- `attachProfile` lê `perfil`/`status` da tabela `public.usuario` via cliente escopado ao token (RLS aplicada).
- `requireProfile(...)` restringe acesso por perfil.
- Ownership de solicitação é garantida por RLS (policy `solicitacao_select_owner_or_admin`), não por checagem manual de id no código.
- **Divergência a notar com cuidado (não é falha, é adaptação mais segura):** a RN50 do CLAUDE.md descreve identificação de administrador por sufixo de e-mail `.adm`. No backend real, o perfil é decidido por **coluna persistida** (`usuario.perfil`), com comentário explícito no código: *"nunca por convenção de e-mail no lado do servidor"*. RN51 (validar credenciais → identificar perfil → aplicar permissões) é cumprida integralmente; só não há checagem literal de sufixo `.adm` no servidor.

**Serviços de domínio confirmados:**
- `agendamento.service.ts` linha 24: só permite agendar solicitação "Aprovado" (RF012/RN27/RN30).
- `agendamento.service.ts` linhas 65–77: cancelamento só permitido se faltarem ≥3h (RF013/RN31), via RPC `cancelAgendamentoRpc`.
- `publicacao.service.ts` linhas 335/429: checam `status !== 'Publicado'` antes de publicar (idempotência); comentário linha 95: *"Idempotente por construção"*.
- Bloqueio por atraso (RF006/RN11/RN12, prazo de 5 dias): termo "prazo" encontrado em `designer.service.ts`, `solicitacao.repository.ts`, `atendimento.service.ts` — valor exato "5 dias" não foi conferido linha a linha nesta auditoria (recomenda-se checagem pontual se necessário citar o número).

**Integrações confirmadas no código:**
- `backend/src/integrations/whatsapp/{whatsappClient,webhookSignature}.ts`
- `backend/src/integrations/instagram/{instagramClient,instagramOAuth,instagramSignedRequest}.ts`
- `backend/src/integrations/webpush/webPushClient.ts`
- Também existe `backend/src/integrations/ai/geminiClient.ts` (classificador de pertinência do atendimento WhatsApp — fora do escopo desta auditoria, apenas registrado como existente).

**Segurança:** `express-rate-limit` usado em 9 arquivos de rotas + `app.ts`; `helmet` também em `app.ts`.

**Testes:** **52 arquivos** `*.test.ts` confirmados por contagem direta (Glob).

---

## 4. Frontend — achados confirmados por auditoria

**Stack confirmada** (`frontend/package.json`): React **19.1.1** + TypeScript **5.9.2** + Vite **7.1.2**.

**Estrutura:** `frontend/src/features/{auth,admin,designer,avaliacao,instagram}`, com subpastas `admin/designers`, `admin/solicitacoes`, `designer/clientes`, `designer/solicitacoes`, `designer/agendamentos`, `designer/notifications`.

**Autenticação (RF002):** `LoginPage.tsx`, `ForgotPasswordPage.tsx`, `ResetPasswordPage.tsx` (+ teste), `AuthContext.tsx`, `ProtectedRoute.tsx`. Recuperação de senha por e-mail confirmada.

**Administrador (RF001/RF015/RF016):** `DesignersPage.tsx` + `DesignerFormPanel.tsx` (gestão de designers). Reatribuição de solicitações confirmada em `AdminSolicitacaoDetailPage.tsx` (lógica de "reatribui").

**Designer (RF003/RF005/RF007-008/RF012-013):**
- `ClientesPage.tsx` / `ClienteFormPanel.tsx` (RF003).
- `SolicitacoesPage.tsx` + `SolicitacaoDetailPage.tsx` (RF005). Upload/versões está **embutido na tela de detalhe**, não há página dedicada separada — classificado como PARCIAL quanto a "tela exclusiva", mas o fluxo funcional existe e está completo.
- `AgendamentosPage.tsx` (RF012/RF013).

**Cliente público (RF009/RF010):** `AvaliacaoPage.tsx` (link/token), com teste associado.

**Bloqueio por atraso (RF006) / notificações:** termos "bloquead"/"atraso" encontrados em `DesignerHome.tsx`, `DesignersPage.tsx`, `ClientesPage.tsx`, `NotificationsCta.tsx` — aviso propagado pela UI, não isolado em uma única tela.

**Web Push / Service Worker:** `public/sw.js` **real** + `features/designer/notifications/webPush.ts` e `NotificationsCta.tsx`, com teste. Confirmado como implementação real, **não é mock**.

**Testes:** **15 arquivos** de teste unitário/integração (`*.test.tsx` em `src/`) + **1 arquivo** E2E Playwright (`e2e/web-push.spec.ts`, com suporte em `e2e/support/`).

**Responsividade/acessibilidade:** checagem rápida (não exaustiva) encontrou apenas 1 arquivo CSS com `@media` via grep simples (provavelmente há mais via Tailwind/CSS-in-JS não capturado por esse método) e 14 arquivos `.tsx` usando atributos `aria-`. Não recomendo afirmar "100% coberto" em responsividade sem checagem visual adicional (fora do escopo do fork read-only).

---

## 5. Banco de dados / Supabase — achados confirmados por auditoria

**Migrations:** **49 arquivos `.sql`** em `supabase/migrations/`, de `20260816120000` a `20260925200000`. Cobrem: schema inicial (extensions/helpers, usuario/designer/administrador, cliente, solicitacao, atendimento/resposta_cliente, versao_arte/avaliacao/ajuste, agendamento_publicacao, historico_solicitacao, storage, RLS), funções de negócio (reatribuição, bloqueio de designer, publicação, cron jobs) e uma cauda extensa de patches incrementais (idempotência de webhook, criptografia de token Instagram, índice trgm, push notifications, etc. — não avaliados individualmente).

**Entidades do DER:** CONFIRMADAS todas as 13 tabelas, com nomes exatos em português: `usuario`, `designer`, `administrador`, `cliente`, `solicitacao`, `atendimento`, `resposta_cliente`, `versao_arte`, `avaliacao`, `ajuste`, `agendamento_publicacao`, `publicacao`, `historico_solicitacao`. Lidos diretamente: `20260816120100_usuario_designer_administrador.sql` e `20260816120300_solicitacao.sql`.

**RLS e policies:** CONFIRMADO — `20260816120800_rls_policies.sql` habilita RLS nas 13 tabelas de negócio e cria 13 policies de `SELECT` (owner-or-admin, via `auth.uid()` e função `is_admin()`). Modelo: escrita só via backend com service role (RLS é ignorada por design nesse caminho); RLS é a segunda camada — leitura direta via `authenticated` é owner-or-admin.

**Storage:** CONFIRMADO — `20260816120900_storage_artes.sql` referencia `storage.buckets`/`storage.objects`.

**Supabase Auth:** CONFIRMADO — `usuario.id_usuario` é `uuid references auth.users(id) on delete cascade`; comentário na migration confirma que `senha_hash` **não existe como coluna física**, delegado ao Auth (resolve a divergência documental DER x Supabase Auth do item 10 do CLAUDE.md).

**Constraints:** CONFIRMADO — `solicitacao.status` tem `CHECK` com os 7 estados oficiais exatos; índices por cliente/designer/status/prazo; `usuario.email` é `UNIQUE` (tipo `citext`, case-insensitive); FKs confirmadas designer→usuario, solicitacao→cliente/designer.

**ADR Auth x DER:** CONFIRMADO que existe `docs/decisions/0001-supabase-auth-vs-der.md`, coerente com o comentário da migration.

---

## 6. Testes — números confirmados e DIVERGÊNCIAS encontradas (importante)

> A auditoria encontrou que alguns números citados em sessões anteriores estão **desatualizados** ou **não foram localizados** como evidência no repositório atual. Isso não significa que sejam falsos — pode ser que existam apenas fora do repositório (prints, sessões externas) — mas não devem ser citados como "confirmados por auditoria" sem localizar a fonte original.

| Item | Valor antigo citado | Situação confirmada nesta auditoria |
|---|---|---|
| Testes backend | 644 testes, 52 arquivos | **DIVERGENTE — atualizado para 650 testes**, 52 arquivos, 0 falhas. Motivo: commit `9dcd679` (classificador de pertinência WhatsApp com histórico) adicionou 6 testes em `geminiClient.test.ts`/`atendimento.service.test.ts`. Confirmado em `docs/evidencias/CONTROLE_EXECUCAO.md` linhas 3230-3236, que registra textualmente: "backend 650/650 testes (52 suítes, +6 em relação aos 644 de EVIDENCIAS_TESTES_FINAIS.md...)". `EVIDENCIAS_TESTES_FINAIS.md` é de 27/09, **anterior** a esse commit. |
| Testes frontend | 150 testes, 15 arquivos | **CONFIRMADO sem alteração** — contagem estática (incluindo expansão de `it.each` em `AvaliacaoPage.test.tsx` e `SolicitacaoDetailPage.test.tsx`) = exatamente 150. |
| Total | 794 testes | **DIVERGENTE — correto é 800** (650 + 150), não 794. |
| Quebra por funcionalidade (Designers 56, Clientes 21, Solicitações 65, Versionamento 19, Avaliação 74, Agendamento 22, Publicação 79) | — | **NÃO LOCALIZADO** em nenhum arquivo de evidência atual (`EVIDENCIAS_TESTES_FINAIS.md`, `CONTROLE_EXECUCAO.md`, `DOSSIE_CAPITULOS_3_4_TFC.md`, `FASE-17_RESULTADO.md`, `matriz-rastreabilidade.md`). |
| Lighthouse (Performance 98 / Accessibility 95 / Best Practices 100 / SEO 91) | — | **NÃO LOCALIZADO.** `EVIDENCIAS_TESTES_FINAIS.md:114` diz textualmente que Lighthouse/Postman/Newman/ZAP **não foram reexecutados** naquela sessão e "não há relatório novo... para citar aqui". |
| Postman/Newman (3 req / 3 scripts / 9 asserções / ~236ms) | — | **NÃO LOCALIZADO**, mesma razão acima. |
| k6 — execução inicial (256 req, 0% falha, média ~180,57ms, p95 ~243,73ms) | — | **NÃO LOCALIZADO** no repositório atual. |
| k6 — revalidação final (258 req, 0% falha, p95 ~228ms) | — | **CONFIRMADO** — `EVIDENCIAS_TESTES_FINAIS.md:113` ("258 requisições, 0% de falha... p95=228.15ms... média 184.24ms") e `CONTROLE_EXECUCAO.md:3213-3215`. Script: `k6-health-test.js`, contra `GET /api/health` (10 VUs/30s). **Representa só esse endpoint, não a API inteira.** |
| OWASP ZAP (0 Alto/0 Médio/0 Baixo + 3 informativos nomeados) | — | **PARCIALMENTE CONFIRMADO.** `CONTROLE_EXECUCAO.md:3191` confirma correção de 4 alertas médios (CSP `style-src unsafe-inline`, `X-Frame-Options`, `X-Content-Type-Options`, CORS `Access-Control-Allow-Origin: *`) via commit `9bada1c`. A lista final exata com os 3 alertas informativos nomeados **não foi localizada** como relatório no repositório atual. |

**Tipos de teste confirmados no repositório:**
- Unitário/integração: Vitest (backend + frontend).
- E2E: Playwright (1 cenário real de Web Push).
- Análise estática: ESLint + TypeScript (0 erros/warnings nos dois workspaces).
- Build: `tsc` + `vite build` (PASS).
- Desempenho/carga: k6 (só `/api/health`).
- Segurança (ZAP) e API (Postman): há menção textual de correções, mas sem relatório numérico atual completo no repositório.

**Observação relevante:** `EVIDENCIAS_TESTES_FINAIS.md:134` registra que **cobertura de código automatizada não está configurada** (nem Vitest nem CI) — não citar percentual de cobertura como se existisse.

---

## 7. Dificuldades reais encontradas (7 candidatas com evidência; 5 foram escolhidas para o resumo de apresentação)

1. **Templates do WhatsApp fora da janela de 24h.** Meta rejeita mensagem de sessão fora de 24h (erro `131047`) e exige template pré-aprovado; a primeira submissão (`arte_publicada`, com emoji) foi reclassificada de `UTILITY` para `MARKETING` (custo maior). Resolvido reescrevendo o texto de forma neutra/factual sem emoji até aprovação como `UTILITY`. Evidência: `docs/decisions/meta-whatsapp-templates-business-initiated.md`.
2. **Host incorreto da API de publicação do Instagram.** Token do produto "Instagram API with Instagram Login" só é aceito em `graph.instagram.com`, não em `graph.facebook.com`. Descoberto após falha real em produção. Evidência: ADR `0003-instagram-oficial-fallback-manual.md`.
3. **Falha de autorização por objeto (BOLA) na publicação do Instagram.** Implementação original usava credencial global do Instagram, permitindo publicar arte de qualquer cliente na mesma conta. Corrigido com tabela `cliente_instagram_conexao` + OAuth por cliente + token cifrado em repouso. Evidência: ADR `0005-instagram-autorizacao-por-cliente.md`, commit `03eef98`.
4. **Corrida de concorrência em mensagens quase simultâneas do WhatsApp.** Duas respostas do mesmo cliente quase ao mesmo tempo podiam gravar a resposta na pergunta errada. Corrigido com lock atômico via RPC `register_resposta_atendimento_e_avancar`. Evidência: commit `03eef98`.
5. **Descontinuação inesperada de modelo Gemini em produção (404).** `gemini-2.5-flash-lite` parou de responder para chaves novas; trocado para `gemini-3.5-flash-lite` só por variável de ambiente. Evidência: commit `dea49ae`, ADR `0006-ia-classificadora-confirmacao-whatsapp.md`. *(Não incluída nas 5 escolhidas para o RESUMO_SEMINARIO; disponível como alternativa.)*
6. **Último alerta médio do OWASP ZAP (CSP `style-src unsafe-inline`).** Encontrados 3 estilos inline estáticos em 2 componentes React; removidos/convertidos em classes CSS sem alterar layout. Evidência: commits `3f4cece`/`1b25857`. *(Não incluída nas 5 escolhidas; disponível como alternativa.)*
7. **Falso negativo em teste E2E de Web Push.** `trace: 'retain-on-failure'` quebrava o teardown do contexto persistente no Playwright no Windows (ENOENT), mesmo com a funcionalidade real funcionando. Corrigido trocando para `trace: 'off'`. Evidência: commit `a03b7c7`.

*(As 5 escolhidas no RESUMO_SEMINARIO_10_SEMANA_TFC2.md foram: 1, 2, 3, 4 e 7.)*

---

## 8. ADRs existentes em `docs/decisions/`

- `0001-supabase-auth-vs-der.md` — delega gestão de credencial ao Supabase Auth; `senha_hash` não duplicado em tabela pública.
- `0002-whatsapp-cloud-api.md` — adoção da WhatsApp Cloud API oficial da Meta em vez de WhatsApp Web.
- `0003-instagram-oficial-fallback-manual.md` — Instagram API oficial + fallback manual documental; inclui descoberta do host correto (`graph.instagram.com`).
- `0004-preferencia-agendamento-cliente.md` — regra de preferência de agendamento do cliente.
- `0005-instagram-autorizacao-por-cliente.md` — correção da falha BOLA; OAuth por cliente + token cifrado.
- `0006-ia-classificadora-confirmacao-whatsapp.md` — classificador de pertinência do atendimento WhatsApp usando histórico da conversa.
- `meta-whatsapp-templates-business-initiated.md` — categorização de templates WhatsApp (UTILITY vs MARKETING).

---

## 9. Documento já entregue nesta sessão

`RESUMO_SEMINARIO_10_SEMANA_TFC2.md` (raiz do projeto) — versão condensada para apresentação de até 3 minutos na 10ª semana do TFC II, com: objetivo, percentuais (Backend/Frontend/Banco = 100%), funcionalidades, validação, tabela de resultados de teste (com as mesmas divergências da seção 6 deste documento), testes direcionados (sinalizado como não localizado), 5 dificuldades escolhidas, 10 pontos para falar oralmente, sugestão de conteúdo para 3 slides, fontes internas e uma nota de divergência sobre a RN50 (`.adm`).

---

## 10. Pendências / recomendações para a próxima sessão

- Se for necessário citar Lighthouse, Postman/Newman, k6 inicial (256 req) ou a quebra de testes por funcionalidade com números exatos, **localizar a fonte original** (prints, sessão externa, ou re-executar as ferramentas) antes de apresentar como fato auditado.
- Se quiser, re-executar a suíte completa (`vitest run` backend + frontend) para confirmar o 650/150/800 com uma rodada ao vivo, em vez de apenas análise estática de arquivos.
- O número exato do prazo de 5 dias (RF006/RN11) não foi conferido literalmente no código nesta auditoria — só a presença do termo "prazo". Confirmar se necessário.
- Responsividade/acessibilidade do frontend foi checada de forma superficial (grep simples) — se a banca perguntar detalhes, recomenda-se inspeção visual real em mobile/tablet/desktop antes de afirmar cobertura completa.
- Nenhuma alteração de código, banco, commit ou deploy foi feita nesta sessão — é seguro continuar a partir daqui sem risco de estado inconsistente.
