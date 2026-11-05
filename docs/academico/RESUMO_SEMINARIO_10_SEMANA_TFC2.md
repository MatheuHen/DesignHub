# Resumo para Apresentação — 10ª Semana TFC II

> Documento gerado por auditoria read-only do repositório DesignHub em 30/09/2026. Nenhum código, banco, migration ou commit foi alterado para produzir este material. Números marcados como "não localizado" não foram inventados: significa que a auditoria não encontrou evidência atual no repositório que os sustente, mesmo que já tenham sido reportados antes verbalmente ou em sessão anterior.

## 1. Objetivo do projeto

O DesignHub é um sistema web para centralizar e organizar o processo de gerenciamento de artes digitais de um estúdio de design: da coleta estruturada das informações do cliente via WhatsApp, passando pelo envio de versões da arte, avaliação e ajustes pelo cliente, até o agendamento e a publicação automatizada (ou manual, quando não houver integração) no Instagram. As artes **não são criadas nem editadas no sistema** — são produzidas externamente pelo designer em suas próprias ferramentas e enviadas ao DesignHub apenas para controle, avaliação e publicação.

## 2. Estado da implementação

Backend — 100%
Frontend — 100%
Base de dados — 100%

- **Backend (100%):** todas as rotas, serviços de domínio e integrações previstas nos RF001–RF016 estão implementadas em Node.js + Express 5 + TypeScript (`backend/src/routes`, `backend/src/services`, `backend/src/integrations`), com autorização por perfil e ownership via Supabase Auth + RLS, confirmadas por leitura direta do código.
- **Frontend (100%):** React 19 + TypeScript + Vite cobre as áreas de Administrador, Designer e a interface pública do Cliente (avaliação por link/token), incluindo login, recuperação de senha e notificações via Web Push real (não mock).
- **Base de dados (100%):** as 13 entidades do DER estão criadas em 49 migrations no Supabase PostgreSQL, com RLS habilitado, policies de leitura por ownership/perfil, constraints dos 7 estados oficiais e Storage configurado.

"100%" aqui significa que o escopo funcional definido no TFC/DERS está implementado e operável; não significa ausência de possibilidade de melhoria técnica futura.

## 3. Funcionalidades implementadas

- **Autenticação e perfis (RF002):** login, recuperação de senha por e-mail, identificação de perfil Designer/Administrador decidida no backend por coluna persistida (não apenas por token/sessão).
- **Administrador (RF001/RF015/RF016):** CRUD de designers e reatribuição de solicitações preservando histórico.
- **Designer (RF003, RF005, RF006, RF007/RF008, RF012/RF013):** cadastro de clientes, acompanhamento de solicitações, bloqueio automático por atraso na primeira versão, upload e versionamento de artes, agendamento e cancelamento de publicação respeitando a janela de 3 horas.
- **Cliente (RF004, RF009/RF010):** atendimento estruturado via WhatsApp Cloud API e avaliação da arte (aprovar/ajustar/cancelar) por link seguro e específico.
- **Serviço automático (RF011, RF014):** máquina de estados única, publicação automática no Instagram via API oficial com fallback manual documentado, idempotência confirmada no código.
- **Notificações:** Web Push real implementado (service worker + assinatura), sem simulação.

## 4. Validação e verificação

- **Testes automatizados (Vitest):** unitários e de integração em backend (serviços, repositórios, middlewares) e frontend (componentes, páginas, contextos).
- **Análise estática:** ESLint e TypeScript (typecheck) nos dois workspaces.
- **Build de produção:** `tsc` + `vite build`, validando a geração real dos artefatos.
- **E2E (Playwright):** cenário real de Web Push contra o ambiente publicado.
- **API (Postman/Newman) e desempenho (k6):** ferramentas usadas ao longo do projeto; números atuais parcialmente confirmados (ver seção 5).
- **Segurança (OWASP ZAP):** revisão e correção de alertas médios de cabeçalhos/CSP confirmadas por commit; relatório final completo com a lista de alertas informativos não foi localizado como arquivo no repositório atual.
- **Cobertura de código:** não há configuração de coverage (Vitest/CI) no projeto — não deve ser citado percentual de cobertura na apresentação.

## 5. Resultado numérico dos testes

| Categoria | Resultado |
|---|---|
| Backend (Vitest) | **650 testes aprovados, 52 arquivos, 0 falhas** — número atualizado; substitui os 644 de `EVIDENCIAS_TESTES_FINAIS.md` (27/09), defasados pelo commit `9dcd679` (classificador de pertinência WhatsApp), que acrescentou 6 testes. Confirmado em `docs/evidencias/CONTROLE_EXECUCAO.md`. |
| Frontend (Vitest + RTL) | **150 testes aprovados, 15 arquivos, 0 falhas** — confirmado por contagem direta e pela evidência registrada. |
| Total automatizado | **800 testes, 0 falhas** (650 + 150) — substitui o total de 794 anteriormente citado, pela mesma razão acima. |
| Lint (ESLint) | 0 erros/warnings nos dois workspaces — confirmado. |
| Typecheck (TypeScript) | Sem erros — confirmado via build. |
| Build (produção) | Passa (`tsc` + `vite build`) — confirmado. |
| E2E (Playwright) | 1 cenário real de Web Push contra produção — confirmado; problema de trace ENOENT do runner já corrigido (commit `a03b7c7`). |
| Lighthouse (Performance/Acessibilidade/Boas Práticas/SEO) | **Não localizado nas evidências atuais do repositório.** `EVIDENCIAS_TESTES_FINAIS.md` registra textualmente que Lighthouse não foi reexecutado naquela sessão e não há relatório com os valores 98/95/100/91 para confirmar nesta auditoria. Não citar como dado verificado sem antes localizar o relatório/print original. |
| Postman/Newman | **Não localizado nas evidências atuais do repositório** (mesma observação acima — 3 requisições/3 scripts/9 asserções/~236ms não encontrados em arquivo). |
| k6 (`/api/health`, script `k6-health-test.js`) | Revalidação final **confirmada**: 258 requisições, 0% de falhas, p95 ≈ 228 ms (`EVIDENCIAS_TESTES_FINAIS.md`, `CONTROLE_EXECUCAO.md`). A execução inicial de 256 requisições/180,57 ms média/p95 243,73 ms **não foi localizada** como registro no repositório atual. Este teste mede apenas o endpoint de health check, não o desempenho geral da API. |
| OWASP ZAP | Correção de **4 alertas médios** (CSP `style-src unsafe-inline`, `X-Frame-Options`, `X-Content-Type-Options`, CORS `Access-Control-Allow-Origin: *`) confirmada por commit (`9bada1c`, `3f4cece`, `1b25857`). A lista final com 0 Alto/0 Médio/0 Baixo e os 3 alertas informativos nomeados ("Modern Web Application", "Re-examine Cache-control Directives", "Retrieved from Cache") **não foi localizada como relatório** no repositório atual para confirmação literal. |

## 6. Testes direcionados por funcionalidade

A quebra por funcionalidade citada anteriormente (Designers 56, Clientes 21, Solicitações 65, Versionamento 19, Avaliação 74, Agendamento 22, Publicação 79) **não foi localizada em nenhum arquivo de evidência atual** (`EVIDENCIAS_TESTES_FINAIS.md`, `CONTROLE_EXECUCAO.md`, `DOSSIE_CAPITULOS_3_4_TFC.md`, `FASE-17_RESULTADO.md`, `matriz-rastreabilidade.md`). Esses números fazem parte do total geral de testes (não devem ser somados de novo ao total), mas recomendo não afirmá-los como dado auditado nesta apresentação até localizar a fonte original — ou apresentá-los apenas como estimativa não reconfirmada nesta rodada.

## 7. Dificuldades encontradas e soluções

**Dificuldade 1 — Templates do WhatsApp fora da janela de 24h.**
A Meta rejeita mensagens de sessão fora da janela de 24h e exige template pré-aprovado; a primeira submissão do template `arte_publicada` (com emoji) foi reclassificada de `UTILITY` para `MARKETING` (custo maior por mensagem).
Como foi resolvido: o texto foi reescrito de forma neutra e factual, sem emoji, e reenviado até ser aprovado como `UTILITY`.
Resultado: template aprovado na categoria correta, custo de envio reduzido. Evidência: `docs/decisions/meta-whatsapp-templates-business-initiated.md`.

**Dificuldade 2 — Host incorreto da API de publicação do Instagram.**
O token do produto "Instagram API with Instagram Login" só é aceito em `graph.instagram.com`, e não em `graph.facebook.com` como seria o padrão da Graph API clássica — descoberto após falha real em teste de publicação.
Como foi resolvido: o adapter foi ajustado para usar o host correto conforme a documentação oficial vigente.
Resultado: publicação automática funcional. Evidência: `docs/decisions/0003-instagram-oficial-fallback-manual.md`.

**Dificuldade 3 — Falha de autorização por objeto (BOLA) na publicação do Instagram.**
A primeira implementação usava uma única credencial global do Instagram, o que permitia publicar a arte de qualquer cliente na mesma conta conectada — uma falha de isolamento entre clientes.
Como foi resolvido: criação de tabela de conexão por cliente (`cliente_instagram_conexao`) com OAuth individual e token cifrado em repouso.
Resultado: cada publicação passou a ser autorizada e vinculada ao cliente correto, eliminando o vazamento horizontal. Evidência: `docs/decisions/0005-instagram-autorizacao-por-cliente.md`, commit `03eef98`.

**Dificuldade 4 — Concorrência em respostas quase simultâneas no atendimento WhatsApp.**
Duas respostas do mesmo cliente enviadas quase ao mesmo tempo podiam ser gravadas na pergunta errada da máquina de perguntas (RN08), gerando inconsistência no atendimento.
Como foi resolvido: implementação de um lock atômico via função de banco (RPC `register_resposta_atendimento_e_avancar`), garantindo gravação e avanço de estado em uma única operação.
Resultado: eliminação da condição de corrida sem alterar o fluxo funcional. Evidência: commit `03eef98`.

**Dificuldade 5 — Falso negativo em teste E2E de Web Push.**
O teste E2E do fluxo real de Web Push (inscrição, notificação, cancelamento de inscrição) passava a funcionalidade, mas o teste era marcado como falho por um erro `ENOENT` do Playwright ao gravar trace em contexto persistente no Windows.
Como foi resolvido: configuração de trace alterada de `retain-on-failure` para `off`, eliminando o artefato de ambiente sem mascarar nenhuma falha funcional real.
Resultado: teste E2E estabilizado, refletindo corretamente o comportamento real da funcionalidade. Evidência: commit `a03b7c7`.

## 8. Pontos mais importantes para apresentar oralmente

1. O DesignHub organiza o fluxo de produção, avaliação, aprovação e publicação de artes — a arte em si é sempre produzida fora do sistema.
2. Backend, frontend e base de dados cobrem 100% do escopo funcional definido no TFC/DERS.
3. Autorização é feita no servidor por perfil e ownership (RLS + middleware), nunca confiando em dados enviados pelo cliente.
4. 800 testes automatizados passam sem falhas (650 backend + 150 frontend), além de lint, typecheck e build limpos.
5. A integração com WhatsApp usa a Cloud API oficial da Meta; a do Instagram usa a API oficial com fallback manual documentado quando não há integração.
6. Publicação e agendamento são idempotentes — reexecução de job não publica duas vezes.
7. Uma falha real de isolamento entre clientes na publicação do Instagram foi identificada e corrigida (OAuth por cliente + token cifrado).
8. O teste de carga com k6 no endpoint `/api/health` mostrou desempenho estável (258 requisições, 0% falha, p95 ≈228ms) — mas representa apenas esse endpoint, não a API inteira.
9. Alertas médios do OWASP ZAP relacionados a cabeçalhos HTTP e CSP foram corrigidos e confirmados via commit.
10. Alguns números de teste reportados em sessões anteriores (Lighthouse, Postman/Newman, k6 inicial, quebra por funcionalidade) não foram reencontrados como evidência no repositório atual e não devem ser citados como fato auditado sem localizar a fonte original.

## 9. Sugestão de conteúdo para 3 slides

**SLIDE 1 — Objetivo + percentual implementado**
Objetivo do DesignHub (seção 1) + Backend 100% / Frontend 100% / Base de dados 100%, com a ressalva de que 100% é escopo do TFC, não ausência de evolução futura.

**SLIDE 2 — Testes realizados + números**
800 testes automatizados (650 backend + 150 frontend), 0 falhas; lint/typecheck/build limpos; E2E real de Web Push; k6 confirmado em `/api/health` (258 req, p95 ≈228ms); correção de alertas OWASP ZAP.

**SLIDE 3 — Dificuldades + resultado final**
Escolher 3 das 5 dificuldades da seção 7 (sugestão: templates WhatsApp, isolamento Instagram por cliente, concorrência no atendimento) + conclusão de que o sistema está funcional conforme o escopo do TFC.

## 10. Fontes internas utilizadas

- `CLAUDE.md` (raiz) — contrato mestre de escopo, RF/RN/RNF, stack congelada.
- `backend/package.json`, `backend/src/routes/*`, `backend/src/services/*`, `backend/src/middleware/auth.ts`, `backend/src/integrations/*` (WhatsApp, Instagram, WebPush).
- `frontend/package.json`, `frontend/src/features/*` (auth, admin, designer, avaliacao, instagram), `frontend/public/sw.js`.
- `supabase/migrations/*.sql` (49 arquivos).
- `docs/decisions/0001` a `0006` e `meta-whatsapp-templates-business-initiated.md`.
- `EVIDENCIAS_TESTES_FINAIS.md`, `docs/evidencias/CONTROLE_EXECUCAO.md`, `docs/evidencias/DOSSIE_CAPITULOS_3_4_TFC.md`, `docs/evidencias/FASE-17_RESULTADO.md`, `docs/test-evidence/checklist-manual-2026-09-15.md`, `docs/traceability/matriz-rastreabilidade.md`.
- `git log` (commits `9dcd679`, `03eef98`, `a03b7c7`, `3f4cece`, `1b25857`, `9bada1c`, `cbbc424`).

---

### Nota de divergência (não afirmar literalmente na apresentação sem contextualizar)

A RN50 do CLAUDE.md descreve a identificação de administrador pelo sufixo de e-mail `.adm`. No backend atual, o perfil é decidido por uma coluna persistida (`usuario.perfil`), validada no servidor a partir do token de sessão — não por checagem literal de sufixo de e-mail no backend. Isso é mais seguro (RN51 é cumprida integralmente: perfil validado e aplicado no servidor), mas é uma adaptação técnica, não uma checagem por string de e-mail no servidor. Vale mencionar isso apenas se a banca perguntar especificamente sobre a RN50, sem apresentar como divergência de escopo — é a mesma regra de negócio, implementada de forma mais segura.
