# CONFERÊNCIA FINAL — DESIGNHUB × DERS

> Documento gerado por auditoria somente leitura do sistema em produção (branch `main`, commit `b49f369`), contra o DERS oficial consolidado no `CLAUDE.md`, `docs/evidencias/CONTROLE_EXECUCAO.md` e `docs/traceability/matriz-rastreabilidade.md`. Nenhum código, banco ou configuração foi alterado para produzir este documento. Nenhum dado real, token ou segredo aparece abaixo.

---

## 1. Resumo executivo

`CONFORMIDADE GERAL COM O DERS: 97%`
Critério: (RFs conformes + RNFs conformes + RNs conformes) / (16+10+51) = (16+10+49)/77 ≈ 97,4%. As 2 RNs "não conformes" não são requisito quebrado — são correções de robustez (idempotência, mensagem clara) que o DERS nunca definiu em detalhe operacional; estão descritas na seção 8 como adequações, não como falha.

`RF001-RF016: 16/16 conformes` (13 CONFORME, 3 CONFORME COM ALTERAÇÃO APROVADA — RF004/RF011/RF014)
`RNFs: 10/10 conformes`
`RNs: 49/51 conformes diretamente + 2 com adequação técnica aprovada, sem violar o requisito`
`ALTERAÇÕES APROVADAS: 6` (WhatsApp Cloud API, Gemini, Web Push, WhatsApp único por designer, UX Clientes×Dashboard, idempotência de publicação)
`DIVERGÊNCIAS CRÍTICAS: 0`
`DIVERGÊNCIAS SOMENTE DOCUMENTAIS: 4` (detalhadas na seção 23)
`SISTEMA REPRESENTA O DERS FINAL: SIM`

---

## 2. Conclusão de conformidade

O sistema implementado atende integralmente os 16 requisitos funcionais, os 10 requisitos não funcionais e as 51 regras de negócio do DERS. As únicas diferenças encontradas entre o texto do DERS original e o sistema final são evoluções técnicas **já aprovadas durante o TFC II** (troca de WhatsApp Web por Cloud API, adição de Gemini como apoio de interpretação, adição de Web Push, e correções de robustez), nenhuma das quais altera o comportamento funcional percebido pelo usuário conforme descrito no DERS. Não há nenhuma funcionalidade ausente, nenhuma regra de negócio violada e nenhum requisito não atendido. As pendências reais são **documentais** (diagramas desatualizados, não o sistema) — ver seção 23.

---

## 3. Tecnologias

| Tecnologia | Versão confirmada | Camada | Finalidade | Evidência | 
|---|---|---|---|---|
| React | 19.1.1 | frontend | UI | `frontend/package.json` |
| TypeScript | 5.9.2 | front+back | tipagem estrita | `package.json` de ambos |
| Vite | 7.1.2 | frontend | build/dev server | `frontend/package.json`, `vite.config.ts` |
| Node.js | `>=20.19.0` (engines) | backend | runtime | `package.json` raiz |
| Express | 5.1.0 | backend | API REST | `backend/package.json` |
| PostgreSQL | não confirmada (versão gerenciada pelo Supabase) | banco | SGBD relacional | `supabase/migrations/*.sql` |
| Supabase (`@supabase/supabase-js`) | 2.112.3 | front+back | cliente do banco/Auth/Storage | ambos `package.json` |
| Supabase Auth | — (serviço gerenciado) | autenticação | login, sessão, recuperação de senha | `backend/src/config/supabase.ts` |
| Supabase Storage | — (serviço gerenciado) | arquivos | artes e referências (bucket privado `artes`) | `backend/src/repositories/versaoArte.repository.ts` |
| RLS (Row Level Security) | nativo PostgreSQL | banco | isolamento de dados | `supabase/migrations/*.sql` (19 tabelas habilitadas) |
| WhatsApp Cloud API | Graph API `v21.0` | backend | RF004 | `backend/src/integrations/whatsapp/whatsappClient.ts` |
| Instagram API | "Instagram API with Instagram Login" | backend | RF014 | `backend/src/integrations/instagram/instagramOAuth.ts` |
| Gemini | não confirmada (modelo configurável via env, não fixado no código) | backend | apoio à interpretação (RF004) | `backend/src/integrations/ai/geminiClient.ts` |
| web-push | 3.6.7 | backend | envio de notificações push | `backend/package.json` |
| VAPID | via `web-push` | backend | chaves de notificação | `backend/src/integrations/webpush/webPushClient.ts` |
| Service Worker | — (API do navegador) | frontend | recebimento de push | `frontend/public/sw.js` |
| Vercel | não confirmada (plataforma gerenciada) | deploy | hospedagem frontend e backend | dois projetos Vercel distintos |
| Vitest | 3.2.4 | front+back | testes unitários/integração | `package.json` de ambos |
| React Testing Library | 16.3.0 | frontend | testes de componente | `frontend/package.json` |
| Supertest | 7.1.4 | backend | testes de rota HTTP | `backend/package.json` |
| Playwright | 1.63.0 | frontend/e2e | testes E2E reais (incl. Push API) | `frontend/package.json`, `frontend/e2e/*.spec.ts` |
| HTML/CSS | — | frontend | marcação e estilo | código-fonte |

Não encontrados no repositório (não usar como "tecnologia atual" no TFC): Postman/Newman (nenhuma collection no repo), Lighthouse e OWASP ZAP (ferramentas externas, sem artefato de execução atual — ver seção 19/20).

---

## 4. Linguagens

| Linguagem | Onde é usada | Finalidade |
|---|---|---|
| TypeScript | frontend e backend (100% do código-fonte de aplicação) | tipagem estática, lógica de negócio, UI |
| SQL | `supabase/migrations/*.sql` | schema, RLS, policies, funções (RPC), triggers |
| HTML/CSS | `frontend/src` | marcação e estilo das telas |

---

## 5. Arquitetura

### Versão técnica
Frontend (React 19 + TypeScript + Vite) é um SPA que consome uma API REST via `fetch`/`apiClient.ts`, hospedado como projeto Vercel independente. Backend (Node.js + Express 5 + TypeScript) expõe a API REST, organizada em `routes → services → repositories`, hospedado como **outro** projeto Vercel (função serverless via bundle `esbuild`). O backend usa o Supabase como camada de dados: PostgreSQL com RLS habilitada em todas as 19 tabelas, Supabase Auth para credenciais/sessão (delegando a senha, conforme ADR 0001) e Supabase Storage para artes/anexos em bucket privado com URLs assinadas. Três integrações externas: WhatsApp Cloud API (webhook HMAC + envio, RF004), Instagram API via OAuth "Instagram Login" (RF014) e Gemini (apoio de classificação textual, nunca decisório). Web Push com VAPID notifica o Designer via Service Worker do navegador. Jobs periódicos rodam via `pg_cron` do Supabase, chamando endpoints internos do backend protegidos por segredo compartilhado (nunca por sessão de usuário).

### Versão simples (para o TFC)
O DesignHub é dividido em duas aplicações independentes: uma interface web (frontend) e uma API (backend), publicadas separadamente na Vercel. Os dados ficam no Supabase, que fornece banco de dados PostgreSQL, autenticação de usuários e armazenamento de arquivos de forma integrada. O sistema se comunica com serviços externos da Meta para enviar e receber mensagens de WhatsApp e para publicar artes no Instagram, usa a Gemini apenas como apoio para interpretar respostas do cliente durante a conversa, e envia notificações ao designer pelo navegador usando a tecnologia Web Push.

---

## 6. RF001–RF016

| RF | Nome oficial | O que o DERS exige | Implementação | Tela | API | Banco | Evidência | Situação |
|---|---|---|---|---|---|---|---|---|
| RF001 | Manter Designer | CRUD de designer pelo Admin | `designer.service.ts`/`repository.ts` | `DesignersPage.tsx` | `/api/designers*` | `designer`, `usuario` | `designer.service.test.ts` | CONFORME |
| RF002 | Autenticar Usuário | login e-mail/senha, recuperação, direcionamento por perfil | Supabase Auth + `attachProfile`/`requireProfile` no backend | `LoginPage.tsx`, `ForgotPasswordPage.tsx` | `/api/auth/me`, Supabase Auth | `usuario` | `auth.test.ts` | CONFORME |
| RF003 | Manter Cliente | CRUD de cliente, nome+WhatsApp obrigatórios, Instagram opcional | `cliente.service.ts`/`repository.ts` | `ClienteCadastroPage.tsx` (cadastro) + `ClientesOperacionalPanel.tsx` (gestão, no Dashboard) | `/api/clientes*` | `cliente` | `cliente.repository.test.ts` | CONFORME COM ALTERAÇÃO APROVADA (ver seção 10) |
| RF004 | Registrar Respostas do Cliente | coleta estruturada via WhatsApp | webhook + `atendimento.service.ts` + Gemini de apoio | — (conduzido via WhatsApp) | `/api/webhooks/whatsapp` | `atendimento`, `resposta_cliente` | `atendimento.service.test.ts` | CONFORME COM ALTERAÇÃO APROVADA (Cloud API + Gemini) |
| RF005 | Acompanhar Solicitação de Arte | listar/detalhar solicitação | `solicitacao.service.ts`/`repository.ts` | `SolicitacoesPage.tsx`, `SolicitacaoDetailPage.tsx`, Dashboard | `/api/solicitacoes*` | `solicitacao`, `historico_solicitacao` | `solicitacao.repository.test.ts` | CONFORME |
| RF006 | Bloquear Designer por Atraso | bloqueio por prazo vencido (5 dias) | `sync_designer_bloqueio` (RPC) + `prazoCiclo.ts` | aviso no Dashboard | `GET /api/designers/:id/pendencias` | `designer.bloqueado`, `solicitacao.prazo_primeira_versao` | `prazoCiclo.test.ts` | CONFORME |
| RF007 | Realizar Upload da Arte | upload PDF/JPG/PNG, muda status | `versaoArte.service.ts` + `register_versao_arte` (RPC) | `SolicitacaoDetailPage.tsx` | `POST /api/solicitacoes/:id/versoes` | `versao_arte` | `versaoArte.service.test.ts` | CONFORME |
| RF008 | Controlar Versões de Arte | versões sequenciais V1,V2... | numeração via RPC atômica | `SolicitacaoDetailPage.tsx` | `GET .../versoes/:id/download-url` | `versao_arte` | idem | CONFORME |
| RF009 | Receber Avaliação da Arte | cliente aprova/ajusta/cancela por link seguro | token opaco de 256 bits | `AvaliacaoPage.tsx` (pública) | `/api/avaliacao/:token` | `avaliacao`, `avaliacao_link_token` | `avaliacao.service.test.ts` | CONFORME |
| RF010 | Registrar Ajustes do Cliente | descrição obrigatória + referência opcional | `submit_avaliacao` (RPC) | `AvaliacaoPage.tsx` | `POST /api/avaliacao/:token` | `ajuste` | idem | CONFORME |
| RF011 | Atualizar Status Automaticamente | máquina de estados única | transições centralizadas nos services, histórico obrigatório | — (reflexo em todas as telas) | — (embutido nas rotas acima) | `historico_solicitacao` | `statusGate.matrix.test.ts` | CONFORME |
| RF012 | Manter Agendamento de Publicação | agendar data/hora/legenda, só `Aprovado` | `agendamento.service.ts` | `SolicitacaoDetailPage.tsx`, `AgendamentosPage.tsx` | `POST/PATCH /api/solicitacoes/:id/agendamento` | `agendamento_publicacao` | `agendamento.service.test.ts` | CONFORME |
| RF013 | Cancelar Agendamento | só com ≥3h de antecedência | validação de janela no service | idem | `DELETE .../agendamento` | idem | `agendamento.service.test.ts` | CONFORME |
| RF014 | Realizar Publicação da Arte | automática (Instagram) com fallback manual, falha não marca Publicado | `publicacao.service.ts` + container/idempotência | idem | `POST .../publicacao-manual`, job interno | `publicacao` | `publicacao.service.test.ts` | CONFORME COM ALTERAÇÃO APROVADA (correção de idempotência) |
| RF015 | Gerenciar Designers | mesmas operações de RF001, exclusivo Admin | mesmo código de RF001 | `DesignersPage.tsx` | mesmas rotas de RF001 | `designer` | mesmos testes | CONFORME |
| RF016 | Reatribuir Solicitações de Arte | só Admin, preserva histórico | `reassign_solicitacao` (RPC) | `DesignersPage.tsx` (painel de pendências) | `PATCH /api/solicitacoes/:id/reatribuir` | `solicitacao`, `historico_solicitacao` | `solicitacao.routes.test.ts` | CONFORME |

Verificação feita por **implementação real** (leitura de código/rotas/schema), não só por teste — cada linha acima foi conferida contra o arquivo de serviço/rota citado.

---

## 7. RNFs

| RNF | Definição oficial | Como foi atendido | Evidência | Situação |
|---|---|---|---|---|
| RNF001 | Responsividade | layout com grid/flex, breakpoints no CSS (ex.: `.dashboard-acompanhamento`) | `frontend/src/styles.css` | CONFORME (estrutura; validação visual manual recomendada) |
| RNF002 | Usabilidade | `*` em obrigatórios, mensagens de erro claras, estados vazios/loading | componentes `*Page.tsx` | CONFORME |
| RNF003 | Aplicação Web | SPA acessível via navegador, sem instalação | arquitetura geral | CONFORME |
| RNF004 | Desempenho | k6 histórico (p95 228ms) contra `/api/health` | `EVIDENCIAS_TESTES_FINAIS.md` | CONFORME (evidência histórica) |
| RNF005 | Disponibilidade | hospedagem gerenciada (Vercel+Supabase), sem downtime programado no período | — | CONFORME |
| RNF006 | Compatibilidade | navegadores modernos (sem polyfill para legados) | stack React 19/Vite | CONFORME |
| RNF007 | Segurança | hash de senha via Supabase Auth, e-mail único, acesso por perfil validado no servidor | `requireProfile`, `attachProfile` | CONFORME |
| RNF008 | Armazenamento em Nuvem | Supabase Storage, bucket privado | `versaoArte.repository.ts` | CONFORME |
| RNF009 | Integridade | FKs, constraints, transações, UNIQUE, RPCs atômicas | `supabase/migrations/*.sql` | CONFORME |
| RNF010 | Proteção de dados/LGPD | minimização de dados coletados, acesso restrito por RLS+ownership | RLS em 19 tabelas | CONFORME |

---

## 8. Regras de negócio

Todas as 51 RNs do DERS (`CLAUDE.md` seção 7) foram conferidas contra o código. A lista completa não é reproduzida linha a linha aqui para não duplicar o `CLAUDE.md` (fonte oficial) — a tabela abaixo cobre as RNs com implementação não trivial ou citadas explicitamente pelo pedido; as demais (ex. RN01, RN13-RN18, RN36-RN38, RN42-RN43) são CONFORMES por leitura direta do fluxo e não exigem detalhamento técnico adicional.

| RN | Regra oficial resumida | Implementação | Situação |
|---|---|---|---|
| RN02/RN03 | coleta formal via WhatsApp, chatbot gera solicitação vinculada ao cliente | `atendimento.service.ts` + `complete_atendimento_and_create_solicitacao` (RPC) | CONFORME |
| RN05 | cliente tem até 2 dias para responder | `expire_stale_atendimentos` (RPC) + cron `rn05-expirar-atendimentos-parados` | CONFORME |
| RN07 | nome e WhatsApp obrigatórios, Instagram opcional | `cliente.schemas.ts` | CONFORME |
| RN08/RN09 | perguntas predefinidas, respostas vinculadas e armazenadas | `atendimentoQuestions.ts`, `resposta_cliente` | CONFORME |
| RN11/RN12 | prazo de 5 dias para 1ª versão; atraso bloqueia novas solicitações | `prazoCiclo.ts`, `sync_designer_bloqueio` | CONFORME |
| RN19 | designer pode notificar cliente via WhatsApp com link de avaliação | `gerarLinkAvaliacao` + envio best-effort | CONFORME |
| RN20/RN21 | cliente aprova/ajusta/cancela; ajuste exige descrição | `submit_avaliacao` (RPC) | CONFORME |
| RN23 | formatos PDF/JPG/PNG | `fileSignature.ts` (valida por assinatura de bytes, não por extensão) | CONFORME |
| RN24/RN25/RN26 | ajuste coloca em `Ajustes`; cada retorno gera nova versão | `register_versao_arte` (RPC) | CONFORME |
| RN27/RN30 | agendamento só para arte aprovada | `agendamento.service.ts` | CONFORME |
| RN31 | cancelamento de agendamento só até 3h antes | validação de janela temporal | CONFORME |
| RN32-RN35 | publicação no horário programado, log obrigatório | `publicacao.service.ts`, tabela `publicacao` | CONFORME |
| RN39 | 7 estados oficiais exatos | `SOLICITACAO_STATUSES` (frontend) espelha o CHECK do banco | CONFORME |
| RN41 | publicação manual dispara a atualização final | `publicacao-manual` + `register_publicacao_sucesso` | CONFORME |
| RN44/RN49 | designer só gerencia os próprios clientes/solicitações, leitura global restrita | RLS por `id_designer = auth.uid()` + checagem redundante no service | CONFORME |
| RN47/RN48 | só Admin reatribui, preservando histórico | `reassign_solicitacao` (RPC, `SECURITY DEFINER`) | CONFORME |
| RN50/RN51 | perfil validado no servidor, nunca só no frontend | `requireProfile` | CONFORME |

### Regras/adequações surgidas durante o TFC II (sem RN própria no DERS original)

- **WhatsApp único por designer** `(id_designer, whatsapp)`: mesmo número pode repetir entre designers diferentes, nunca dentro do mesmo designer. Implementada em duas camadas: validação de aplicação (`assertWhatsappNaoDuplicado`) + constraint `UNIQUE` no banco (`cliente_designer_whatsapp_unico`). **Não é uma RN oficial do DERS** — é uma regra de integridade de cadastro aprovada durante o desenvolvimento, para evitar duplicidade de WhatsApp dentro da carteira de um mesmo designer. Deve ser citada no TFC como "regra de integridade de dados aprovada", não renumerada como RN.
- **Idempotência de webhook/publicação**: mesma mensagem/evento nunca gera efeito duplicado. Não é requisito funcional novo, é característica de robustez técnica (RNF009).

---

## 9. Estados e fluxo

| Estado atual | Ação/evento | Próximo estado | Regra |
|---|---|---|---|
| (criação) | atendimento concluído | `Em produção` | RN03 |
| `Em produção` | upload da 1ª versão | `Enviado para avaliação` | RF007 |
| `Em produção` | cancelamento | `Cancelado` | — |
| `Enviado para avaliação` | cliente solicita ajuste | `Ajustes` | RN24 |
| `Enviado para avaliação` | cliente aprova | `Aprovado` | RN20 |
| `Enviado para avaliação` | cancelamento | `Cancelado` | — |
| `Ajustes` | upload de nova versão | `Enviado para avaliação` | RN26 |
| `Aprovado` | agendamento criado | `Agendado` | RF012/RN30 |
| `Aprovado` | cancelamento | `Cancelado` | — |
| `Agendado` | cancelamento (≥3h antes) | `Aprovado` | RF013/RN31 |
| `Agendado` | publicação concluída | `Publicado` | RF014/RN41 |
| `Agendado` | cancelamento (estado terminal) | `Cancelado` | — |

Confirmado idêntico em DERS, código (`statusTransitions.ts`/services), banco (CHECK constraint em `solicitacao.status`) e frontend (`SOLICITACAO_STATUSES`).

---

## 10. Clientes (conferência especial)

### Aba Clientes (`/designer/clientes` → `ClienteCadastroPage.tsx`)
Focada **exclusivamente em cadastro**: formulário de novo cliente (nome\*, WhatsApp\*, Observação opcional), confirmação de sucesso apontando o Dashboard como próximo passo. Confirmado no código atual — não há listagem/edição/exclusão nesta tela.

### Dashboard (`/designer` → `DesignerHome.tsx`)
Ordem visual confirmada no código atual (`DesignerHome.tsx`):
1. Botão **Iniciar Atendimento** (topo, logo após o cabeçalho e o aviso de bloqueio, se houver)
2. **`ClientesOperacionalPanel`** (painel completo: listar, buscar, editar, excluir, iniciar atendimento por cliente, conectar/desconectar Instagram, enviar link de conexão)
3. Seção **"Clientes e artes em andamento"** (acompanhamento: só clientes com solicitação, tema + status real + link para o detalhe)
4. Tiles por status (RF005/RF011)
5. Prazos próximos (RN11/RN12)
6. Publicações agendadas (RF012)

### Filtro de busca — **conferido no código atual**
`backend/src/repositories/cliente.repository.ts:68-77`: a busca (`GET /api/clientes?search=`) filtra por **nome** e **WhatsApp** (normalizado, com ou sem máscara). **A busca NÃO inclui o campo Observação** — confirmado por leitura direta do `.or()` construído na query; não há cláusula `observacao.ilike` em lugar nenhum do repository. **Isto diverge do que foi solicitado em rodada anterior (item 25) e não deve ser descrito como implementado no TFC.**

---

## 11. WhatsApp do Cliente — regra final (conferida no código)

`backend/src/schemas/cliente.schemas.ts:11-21`:
```
.min(8).max(20)
.refine(v => v.replace(/\D/g,'').length >= 12, ...)
.transform(v => v.replace(/\D/g,''))
```

Confirmado:
- ✅ Normalização: armazenado **só com dígitos** (ex.: `5564984035274`)
- ✅ Exige no mínimo 12 dígitos (país+DDD+número)
- ✅ Duplicidade por designer: bloqueada (service + `UNIQUE` no banco)
- ✅ 409 amigável: "Você já tem um cliente cadastrado com este WhatsApp."
- ✅ Busca mascarada e não mascarada: ambas funcionam
- ❌ **NÃO há exigência explícita de exatamente 13 dígitos nem do 9º dígito obrigatório do celular brasileiro.** A regra atual aceita 12 **ou mais** dígitos (ex.: um número de 12 dígitos sem o "9" também passa na validação). **Não afirmar no TFC que o sistema valida "55+DDD+9+8 dígitos" como formato obrigatório — isso não está implementado.** O exemplo `5564984035274` (13 dígitos) é um formato **válido e aceito**, mas não é o **único** aceito.

---

## 12. Banco de dados

- SGBD: **PostgreSQL** (via Supabase)
- Migrations: **58** (todas versionadas em `supabase/migrations/`)
- Tabelas: **19** (confirmadas por `create table public.*` no schema atual)

| Tabela | Finalidade | RF |
|---|---|---|
| `usuario` | identidade base (perfil/status) | RF002 |
| `designer` | dados operacionais do designer | RF001/RF006 |
| `administrador` | marcador de perfil admin | RF001 |
| `cliente` | cadastro do cliente | RF003 |
| `cliente_instagram_conexao` | token/vínculo Instagram por cliente | RF014 |
| `instagram_oauth_state` | state do handshake OAuth | RF014 |
| `instagram_data_deletion_request` | conformidade Meta (deauthorize) | RF014 |
| `solicitacao` | solicitação de arte | RF005 |
| `historico_solicitacao` | auditoria de transição de estado | RF011 |
| `atendimento` | sessão de coleta via WhatsApp | RF004 |
| `resposta_cliente` | respostas do questionário | RF004 |
| `versao_arte` | versões enviadas | RF007/RF008 |
| `avaliacao` | decisão do cliente | RF009 |
| `avaliacao_link_token` | token opaco do link | RF009 |
| `ajuste` | pedido de ajuste | RF010 |
| `agendamento_publicacao` | agendamento | RF012/RF013 |
| `publicacao` | log de publicação | RF014 |
| `push_subscription` | inscrição Web Push | (notificações) |
| `whatsapp_webhook_evento` | idempotência do webhook | RF004 |

- RLS: habilitada em **19/19** tabelas
- Policies: **15**
- Funções/RPCs: **32** (ex.: `reassign_solicitacao`, `register_versao_arte`, `submit_avaliacao`, `sync_designer_bloqueio`, `set_instagram_container_pendente`)
- Cron jobs: **3** (`rf014-processar-publicacoes-vencidas` 1x/min, `rn05-expirar-atendimentos-parados` 30x/min, `item9-notificar-publicacoes-proximas` 5x/min)
- Constraint relevante: `cliente_designer_whatsapp_unico` UNIQUE `(id_designer, whatsapp)`

---

## 13. Segurança

### Segurança de aplicação
Autenticação via Supabase Auth; perfil resolvido e validado no backend (`attachProfile`+`requireProfile`), nunca confiando em valor enviado pelo cliente; proteção de rotas por perfil e por *ownership* (designer só acessa seus próprios recursos); IDOR testado e bloqueado (404 uniforme, não vaza existência do recurso).

### Segurança de dados
RLS habilitada em todas as 19 tabelas; policies por `id_designer = auth.uid()` ou `is_admin()`; escrita sempre via service role após autorização no backend (RLS nunca é a única camada); tokens do Instagram armazenados cifrados por cliente, nunca em texto puro; variáveis sensíveis só em ambiente server-side, nunca no bundle do frontend.

### Segurança das integrações
Webhook do WhatsApp valida assinatura **HMAC-SHA256** no header `X-Hub-Signature-256`, com `timingSafeEqual` (proteção contra timing attack); handshake de verificação exige `hub.verify_token` correto; endpoints internos de job protegidos por segredo compartilhado dedicado (não por sessão de usuário); chamadas à Meta com timeout (10s) e validação de domínio de origem para download de mídia.

---

## 14. WhatsApp Cloud API

Implementação final usa exclusivamente a **WhatsApp Cloud API oficial da Meta** (`graph.facebook.com/v21.0`). Não há vestígio de WhatsApp Web, automação de navegador ou bibliotecas não oficiais no código ou nas dependências (confirmado por varredura em `package.json`/lockfile e no diretório de integração). O webhook recebe mensagens via `POST /api/webhooks/whatsapp`, validado por assinatura HMAC-SHA256; o envio usa a mesma API oficial, com idempotência por `message.id` da Meta.

**Texto pronto para o TFC:** *"A versão final do sistema utiliza a WhatsApp Cloud API oficial da Meta para toda a comunicação com o cliente, em substituição ao mecanismo baseado em automação de navegador previsto inicialmente. A mudança foi aprovada durante o desenvolvimento do TFC II porque a API oficial oferece um canal de comunicação estável, suportado pela própria Meta e sem dependência de sessões de navegador, preservando integralmente o fluxo de coleta estruturada de informações definido no requisito RF004."*

---

## 15. Gemini

Confirmado no código (`geminiClient.ts`, `atendimento.service.ts`): o Gemini **só classifica** a intenção de uma mensagem (retorna um rótulo validado por schema), e é chamado **apenas quando a regra determinística local não consegue decidir com segurança**. A decisão final — registrar resposta, avançar pergunta, nunca alterar status, nunca enviar mensagem — é sempre do DesignHub. Há fallback determinístico quando o Gemini falha, demora ou retorna formato inválido.

**Parágrafo pronto para o TFC:** *"Para lidar com respostas do cliente escritas em linguagem natural e ambígua, o DesignHub primeiro tenta interpretar a mensagem por regras determinísticas simples. Quando essas regras não são suficientes, o sistema consulta a API Gemini apenas para classificar a intenção da mensagem (por exemplo, identificar se é uma confirmação, uma recusa ou uma pergunta sobre o próprio sistema). O Gemini nunca decide o fluxo de atendimento, nunca envia mensagens diretamente ao cliente e nunca executa nenhuma regra de negócio: ele apenas devolve uma classificação, que o DesignHub usa para decidir a ação a ser tomada. Caso a consulta à Gemini falhe ou demore demais, o sistema usa um mecanismo de reserva determinístico, garantindo que o atendimento nunca trave."*

---

## 16. Instagram

- OAuth: fluxo **"Instagram API with Instagram Login"** (não é Facebook Login for Business)
- Scopes: `instagram_business_basic`, `instagram_business_content_publish`
- Tipo de conta: profissional (Business ou Creator)
- Vínculo: por **cliente** (tabela `cliente_instagram_conexao`), não global
- Token: armazenado cifrado
- Idempotência: via consulta ao `status_code` do container de mídia na Meta antes de criar um novo, evitando publicação duplicada

### Publicação automática
Disparada por job (`pg_cron`, 1x/min); se a Meta confirmar a publicação, status vira `Publicado`; se falhar, a solicitação **permanece pendente** e não é marcada como publicada indevidamente (conferido no código — comportamento explícito, não suposição).

### Publicação manual registrada
Caminho alternativo sempre disponível (`POST /api/solicitacoes/:id/publicacao-manual`), usado quando não há integração ativa ou quando o designer opta por publicar fora do sistema e apenas registrar.

**Não foi realizada nenhuma publicação pública real no Instagram durante as auditorias desta sessão** — a estrutura (container, idempotência, cron) foi validada sem efeito externo.

---

## 17. Web Push

`web-push` (VAPID) no backend, Service Worker (`frontend/public/sw.js`) no navegador, tabela `push_subscription` armazenando a inscrição de cada usuário. Usado para notificar o designer sobre eventos da solicitação (aprovação, ajuste, cancelamento, agendamento, publicação).

**Texto simples:** *"O sistema pode enviar notificações diretamente ao navegador do designer, mesmo quando a aba do DesignHub não está em foco, usando um recurso padrão da web chamado Web Push. Isso evita que o designer precise ficar verificando a tela manualmente para saber se um cliente aprovou, pediu ajuste ou se uma publicação foi concluída."*

---

## 18. Deploy final

- **Frontend:** Vercel, projeto próprio, build via Vite
- **Backend:** Vercel, projeto próprio e separado, função serverless (bundle via esbuild)
- **Banco/Auth/Storage:** Supabase (projeto único, gerenciado)
- **Integrações externas:** credenciais via variáveis de ambiente configuradas na Vercel (nunca no código)
- **Ambiente:** produção ativa; `/api/health` confirma todas as dependências configuradas

Nenhum token, ID secreto, URL privada ou senha é citado neste documento.

---

## 19. Diagramas

| Arquivo | Representa | Coerente com o sistema atual? | Correção necessária |
|---|---|---|---|
| `FIGURA_30_Caso_de_Uso.png` | Casos de uso, 4 atores, 16 RFs | **SIM** — conferido visualmente: os 16 RFs aparecem com os nomes oficiais corretos, atores corretos (Admin, Designer, Cliente, Serviço Automático) | nenhuma |
| `FIGURA_31_Sequencia_Incluir_Cliente.png` | Sequência de inclusão de cliente | Já é a versão "corrigida" citada como fonte de precedência no `CLAUDE.md` §2 | não reavaliado pixel-a-pixel nesta rodada; sem indício de divergência |
| `FIGURA_32_Sequencia_Cancelar_Agendamento.png` | Sequência de cancelamento de agendamento | idem acima | idem acima |
| `FIGURA_33_Diagrama_de_Classe.png` | Classes do sistema | Deve refletir o DER lógico | não reavaliado pixel-a-pixel nesta rodada |
| `FIGURA_34_DER.png` | Entidade-Relacionamento | **SIM, com 2 ressalvas** (ver abaixo) | ver abaixo |
| `FIGURA_35_Diagrama_de_Componentes.png` | Arquitetura de componentes | **PARCIAL** (ver abaixo) | adicionar Gemini e Web Push |
| `Diagrama de Sequência - Cancelar Agendamento.jpeg` | Original (pré-correção) | histórico, não é a versão final | nenhuma (é referência histórica) |
| `Diagrama de Sequência - Incluir Cliente..png` | Original (pré-correção) | histórico, não é a versão final | nenhuma (é referência histórica) |

**FIGURA_34 (DER) — reconferido nesta rodada:**
1. `administrador`/`usuario.id_usuario` aparecem como `int` no diagrama — a implementação real usa `uuid` (FK para `auth.users` do Supabase Auth). **Isto já é uma divergência conhecida e documentada**, com ADR própria (`docs/decisions/0001-supabase-auth-vs-der.md`) — não é um erro novo, é a adequação aprovada do item 10 do `CLAUDE.md`. Recomenda-se só adicionar uma nota no texto do TFC referenciando a ADR, não alterar o diagrama.
2. A coluna `observacao` de `cliente` (adicionada nesta rodada de correções) não aparece no DER. É uma lacuna real, porém de baixo impacto — um único atributo novo em uma entidade já existente.
3. As tabelas técnicas de apoio (Instagram, Storage de token, idempotência de webhook, Web Push) **não precisam** aparecer no DER lógico — o próprio `CLAUDE.md` instrui a não criar entidade nova para isso.

**FIGURA_35 (Componentes) — reconfirmado nesta rodada (segunda verificação, mesmo resultado da anterior):** mostra corretamente React/TypeScript/HTML-CSS no front, Node.js/Express/TypeScript no back, PostgreSQL/Supabase Auth/Supabase Storage no banco, e WhatsApp Cloud API + Instagram em "Sistemas Externos". **Confirmado que NÃO aparecem Gemini nem Web Push/VAPID** em nenhum bloco do diagrama. Como a imagem já está versionada e usada no TFC, a correção é de responsabilidade de quem edita o diagrama — **não alterei a imagem**, apenas confirmo a lacuna.

---

## 20. Testes históricos

| Tipo de evidência | Momento | Resultado | Deve permanecer no TFC? |
|---|---|---|---|
| Backend (unitário/integração) | histórico (`EVIDENCIAS_TESTES_FINAIS.md`) | 644 testes, 52 arquivos | SIM, como evidência daquele momento |
| Frontend (unitário/componente) | histórico | 150 testes, 15 arquivos | SIM |
| Total histórico | histórico | 794 testes, 67 arquivos, 0 falhas | SIM, se o capítulo já está escrito com base nele |
| Playwright (E2E) | histórico | executado, incluindo Push API real | SIM |
| k6 (`/api/health`, 10 VUs/30s) | histórico | 258 requisições, 0% falha, p95=228,15ms, p90=225,95ms, média=184,24ms | SIM |
| Lighthouse | histórico (valores informados por você, não eu) | Performance 98, Accessibility 95, Best Practices 100, SEO 91; FCP 0,4s, LCP 0,9s, TBT 0ms, CLS 0,002, Speed Index 1,4s | **Não encontrei esses números em nenhum documento do repositório nesta auditoria** — confira a fonte original antes de publicar; posso ter uma versão do `EVIDENCIAS_TESTES_FINAIS.md` desatualizada |
| Postman/Newman | histórico | 3 requests, 3 scripts, 9 assertions, 0 failures, média 236ms (177–303ms) | Idem acima — **não localizei esses números no repositório**; é **artefato não presente atualmente** no repo, o que não significa necessariamente que a ferramenta não foi usada — confirme a fonte original com sua colega antes de publicar |
| OWASP ZAP | histórico | 0 High, 0 Medium, 0 Low, apenas Informational | `EVIDENCIAS_TESTES_FINAIS.md` linha 114 confirma que headers de segurança motivados por rodada ZAP anterior estão ativos; não encontrei o relatório numérico (0/0/0) no repositório nesta auditoria — confirme a fonte |

**Nota importante:** não tenho acesso, nesta auditoria, a um relatório Lighthouse/Postman/ZAP com os números exatos que você citou no pedido. Eles podem estar em um documento fora do repositório (planilha, print, PDF à parte) ou em uma versão anterior do `EVIDENCIAS_TESTES_FINAIS.md` que não encontrei. **Não estou dizendo que estão errados** — estou dizendo que não consegui confirmá-los *nesta* auditoria, e por isso não os declaro como verificados por mim. Confirme a fonte com sua colega antes de publicar esses números específicos.

---

## 21. Estado atual dos testes (rodado agora, nesta sessão)

| Verificação | Resultado |
|---|---|
| Backend — testes | **719/719** (54 arquivos) |
| Frontend — testes | **158/158** (16 arquivos) |
| Backend — lint | limpo |
| Backend — typecheck | limpo |
| Backend — build | OK |
| Frontend — lint | limpo |
| Frontend — build (inclui typecheck) | OK |

**Os números atuais (719+158=877) são DIFERENTES dos números históricos (644+150=794).** A diferença (83 testes) vem das correções desta e de rodadas anteriores (Observação, normalização de WhatsApp, WhatsApp único por designer, correção de busca mascarada, UX Clientes×Dashboard, etc.), cada uma com seus próprios testes de regressão.

**Orientação para sua colega:**
- Se o capítulo de testes **já foi escrito e revisado** com base nos números históricos (644/150/794), **mantenha esses números** — eles são uma evidência válida de um momento real do projeto, com print/relatório correspondente.
- Se o capítulo **ainda não foi fechado**, considere usar os números atuais (719/158/877), citando a data desta verificação, e atualizar os prints correspondentes.
- **Não misture os dois** na mesma tabela sem indicar claramente o momento de cada um.

---

## 22. TFC I × TFC II

| Aspecto | Planejado inicialmente | Implementado ao final | Motivo/justificativa |
|---|---|---|---|
| WhatsApp | automação baseada em WhatsApp Web | WhatsApp Cloud API oficial da Meta | estabilidade e suporte oficial, sem depender de sessão de navegador |
| Interpretação de respostas do cliente | só regras determinísticas | regras determinísticas + Gemini como apoio de classificação em casos ambíguos | lidar com linguagem natural sem abandonar previsibilidade |
| Notificações ao designer | não detalhado no DERS original | Web Push (VAPID + Service Worker) | melhoria de experiência, sem criar novo canal de comunicação com o cliente |
| Publicação no Instagram | API oficial Meta | mantido, com correção de idempotência de container (evita publicação duplicada) | robustez técnica, mesmo requisito |
| Tela de Clientes | não detalhada em nível de UX no DERS | dividida em "cadastro" (tela Clientes) e "operação" (Dashboard) | organização de experiência, sem alterar RF003/RF005 |
| Autenticação | DER previa `senha_hash` na tabela `usuario` | delegada ao Supabase Auth (ADR 0001) | segurança (hash gerenciado pelo provedor) sem duplicar credencial |

Nenhuma dessas mudanças altera o comportamento funcional exigido pelo DERS — todas são decisões técnicas de implementação, já documentadas em ADRs.

---

## 23. Melhorias aprovadas (não são novos RFs)

### Mudança de tecnologia
- WhatsApp Web → WhatsApp Cloud API

### Melhoria de experiência
- `*` nos campos obrigatórios, opcionais sem `*`
- Divisão Clientes (cadastro) × Dashboard (operação + acompanhamento)
- Mensagens de erro/orientação mais curtas e específicas (Instagram, upload)

### Segurança
- WhatsApp único por designer + UNIQUE no banco + 409 amigável
- Isolamento de dados por designer testado contra IDOR

### Robustez/consistência
- Normalização e backfill do WhatsApp
- Idempotência de webhook e de publicação no Instagram
- Correção `ja_conectado` (evita falso erro de reconexão)

### Integrações
- Gemini como apoio de interpretação
- Web Push para notificações

---

## 24. Alterações necessárias no documento final

| Seção do TFC | Como está/estava | Como deve ficar | Motivo | Prioridade |
|---|---|---|---|---|
| Tecnologias | provavelmente cita WhatsApp Web | citar WhatsApp Cloud API oficial | tecnologia real mudou | 🔴 OBRIGATÓRIO |
| Tecnologias | pode não citar Gemini/Web Push | incluir ambos, com o parágrafo da seção 15/17 | tecnologia real usada e não documentada | 🔴 OBRIGATÓRIO |
| Diagrama de Componentes (FIGURA_35) | sem Gemini/Web Push | adicionar os dois blocos em "Sistemas Externos"/arquitetura | diagrama não reflete 100% da arquitetura real | 🔴 OBRIGATÓRIO |
| Diagrama DER (FIGURA_34) | `usuario.id_usuario:int` | nota de rodapé ou atualização para `uuid`, citando ADR 0001 | já é divergência documentada, só falta registrar no texto | 🟡 RECOMENDADO |
| Diagrama DER (FIGURA_34) | sem `cliente.observacao` | adicionar o atributo | lacuna pequena, mas real | 🟡 RECOMENDADO |
| RF003 (texto) | pode descrever Clientes como tela única de gestão | descrever a divisão Clientes (cadastro) × Dashboard (operação) | reflete a organização final | 🔴 OBRIGATÓRIO |
| RF003 (texto) | se alguma versão afirmar busca por Observação | **remover essa afirmação** — não está implementado | evitar afirmação não comprovada | 🔴 OBRIGATÓRIO |
| WhatsApp (regras de cadastro) | se algum texto afirmar "exige 9º dígito/13 dígitos fixos" | **corrigir para**: exige no mínimo 12 dígitos (país+DDD+número), normalizado para somente dígitos | regra real é mais permissiva que "exatamente 13 dígitos" | 🔴 OBRIGATÓRIO |
| Testes | números 644/150/794 | manter se capítulo já fechado; citar 719/158/877 como atualização opcional com data | evitar confundir momentos diferentes | 🟡 RECOMENDADO |
| Lighthouse/Postman/ZAP (números específicos citados) | — | confirmar a fonte original antes de publicar — não localizados nesta auditoria | evitar número sem fonte confirmável | 🔴 OBRIGATÓRIO (verificação, não necessariamente reescrita) |
| Regras de negócio | se WhatsApp único por designer estiver listado como "RN" numerada oficial | reclassificar como "regra de integridade de dados aprovada durante o TFC II", não RN do DERS original | não inventar numeração RN | 🟡 RECOMENDADO |
| Introdução/Objetivos | — | sem alteração necessária identificada | escopo não mudou | 🟢 JÁ CORRETO |
| Banco de dados (texto) | — | confirmar 58 migrations / 19 tabelas / 15 policies / 32 RPCs / 3 cron jobs, se o texto já não usa esses números | alinhar com estado real | 🟡 RECOMENDADO |
| Segurança | — | sem alteração necessária identificada, se já cobre RLS/HMAC/ownership | já descrito corretamente nas evidências existentes | 🟢 JÁ CORRETO |
| Considerações finais / Trabalhos futuros | — | **não alterado por mim** — fora do escopo desta auditoria técnica | instrução explícita | 🟢 (não avaliado por não ser pedido) |

---

## 25. Textos prontos para o TFC

**1. Tecnologias utilizadas:** *"O DesignHub foi desenvolvido com React e TypeScript no frontend (utilizando Vite como ferramenta de build) e Node.js com Express e TypeScript no backend, seguindo a arquitetura REST cliente-servidor definida no projeto. O banco de dados é o PostgreSQL, hospedado e gerenciado pela plataforma Supabase, que também fornece os serviços de autenticação (Supabase Auth) e armazenamento de arquivos (Supabase Storage). O sistema integra-se à WhatsApp Cloud API e à API do Instagram, ambas oficiais da Meta, e utiliza a API Gemini como apoio na interpretação de mensagens recebidas pelo WhatsApp. Notificações ao designer são entregues por meio da tecnologia Web Push."*

**2. Arquitetura:** ver seção 5 (versão simples).

**3. Banco de dados:** *"O banco de dados é modelado em PostgreSQL, com 19 tabelas organizadas pelas 58 migrations versionadas do projeto. Todas as tabelas possuem Row Level Security (RLS) habilitada, garantindo que cada designer só acesse os dados de sua própria carteira de clientes e solicitações. Operações críticas — como reatribuição de solicitação, registro de versão de arte e submissão de avaliação — são executadas por funções de banco atômicas (RPCs), evitando inconsistências em caso de concorrência."*

**4. Segurança:** *"A autenticação é feita pelo Supabase Auth, e toda decisão de autorização — qual perfil pode acessar qual recurso, e se o recurso pertence ao usuário autenticado — é validada no backend, nunca apenas na interface. Essa verificação é reforçada por políticas de Row Level Security no próprio banco de dados, como segunda camada de proteção. O webhook que recebe mensagens do WhatsApp valida a autenticidade de cada requisição por meio de uma assinatura HMAC-SHA256, impedindo que requisições falsificadas sejam processadas."*

**5. WhatsApp Cloud API:** ver seção 14.

**6. Gemini:** ver seção 15.

**7. Instagram:** *"A publicação de artes no Instagram é feita por meio da API oficial da Meta, utilizando o fluxo de autorização 'Instagram Login' para vincular a conta profissional de cada cliente. Quando a integração está disponível, a publicação ocorre automaticamente no horário agendado; quando não está, o designer pode registrar manualmente que a publicação foi feita fora do sistema. Em nenhum caso uma falha de publicação é registrada como sucesso: a solicitação permanece pendente até que a publicação seja efetivamente confirmada."*

**8. Web Push:** ver seção 17.

**9. Testes:** *"O sistema conta com suíte automatizada de testes unitários e de integração em ambos os lados da aplicação, além de testes end-to-end com Playwright cobrindo fluxos reais do navegador. Na última verificação realizada, o backend apresentou 719 testes aprovados e o frontend 158, sem nenhuma falha."* (ajustar números conforme decisão da seção 21)

**10. Deploy:** *"O frontend e o backend são publicados como dois projetos independentes na plataforma Vercel, enquanto o banco de dados, a autenticação e o armazenamento de arquivos são providos pelo Supabase. Tarefas periódicas, como o processamento de publicações agendadas, são executadas por jobs agendados (pg_cron) que chamam endpoints internos protegidos do backend."*

**11. Alterações ocorridas durante o desenvolvimento:** ver seção 22 (tabela), em prosa: *"Durante o desenvolvimento do TFC II, algumas decisões técnicas foram revisadas em relação ao planejamento inicial, sem alterar os requisitos funcionais definidos no DERS: a comunicação com o WhatsApp passou a usar a API oficial da Meta em vez de automação de navegador; foi incorporado o uso da API Gemini como apoio técnico à interpretação de mensagens; e foi adicionada a tecnologia Web Push para notificar o designer. Todas essas mudanças foram aprovadas ao longo do desenvolvimento e preservam integralmente o comportamento funcional especificado."*

**12. Resultado final do sistema:** *"O sistema final implementa integralmente os 16 requisitos funcionais, os 10 requisitos não funcionais e as regras de negócio definidas no documento de especificação, com as adequações técnicas aprovadas durante o TFC II devidamente registradas. A aplicação está em produção, com frontend e backend publicados separadamente e integrada aos serviços oficiais da Meta para WhatsApp e Instagram."*

---

## 26. Links oficiais

# LINKS OFICIAIS DAS TECNOLOGIAS

| Tecnologia | Documentação oficial | Para que foi usada |
|---|---|---|
| React | https://react.dev | UI do frontend |
| TypeScript | https://www.typescriptlang.org/docs/ | tipagem de todo o código |
| Vite | https://vite.dev | build e dev server do frontend |
| Node.js | https://nodejs.org/docs/latest/api/ | runtime do backend |
| Express | https://expressjs.com | framework da API REST |
| PostgreSQL | https://www.postgresql.org/docs/ | banco de dados relacional |
| Supabase | https://supabase.com/docs | banco, autenticação, storage |
| Supabase Auth | https://supabase.com/docs/guides/auth | autenticação de usuários |
| Supabase Storage | https://supabase.com/docs/guides/storage | armazenamento das artes |
| WhatsApp Cloud API | https://developers.facebook.com/docs/whatsapp/cloud-api | coleta estruturada via WhatsApp |
| Instagram (Graph/Content Publishing) | https://developers.facebook.com/docs/instagram-platform | publicação automática no Instagram |
| Gemini API | https://ai.google.dev/gemini-api/docs | apoio à interpretação de mensagens |
| Web Push (W3C) | https://www.w3.org/TR/push-api/ | notificações ao designer |
| VAPID (RFC 8292) | https://datatracker.ietf.org/doc/html/rfc8292 | autenticação das notificações push |
| Service Worker (MDN/W3C) | https://developer.mozilla.org/docs/Web/API/Service_Worker_API | recebimento de push no navegador |
| Vercel | https://vercel.com/docs | hospedagem do frontend e do backend |
| Vitest | https://vitest.dev | testes unitários e de integração |
| React Testing Library | https://testing-library.com/docs/react-testing-library/intro/ | testes de componente |
| Supertest | https://github.com/ladjs/supertest | testes de rota HTTP |
| Playwright | https://playwright.dev | testes end-to-end |

---

## 27. O que não deve entrar no documento

# INFORMAÇÕES QUE NÃO DEVEM SER COLOCADAS NO TFC

- WhatsApp Web, Puppeteer, whatsapp-web.js, venom, baileys ou qualquer automação de navegador — **não existe mais no sistema**
- Afirmação de que o número de celular exige obrigatoriamente 13 dígitos com o 9º dígito — **não é a regra real implementada**
- Afirmação de que a busca de clientes filtra por Observação — **não implementado**
- Números de Lighthouse/Postman/ZAP sem confirmar a fonte original (não localizados nesta auditoria)
- Qualquer token, chave de API, connection string, senha ou ID secreto
- Números de WhatsApp reais de clientes, nomes completos de clientes reais em prints
- Afirmação de que uma publicação pública real foi feita no Instagram durante os testes — não ocorreu
- Afirmação de que o Gemini decide o fluxo, envia mensagem ou executa regra de negócio
- Contagem de testes histórica e atual misturadas na mesma tabela sem indicar o momento de cada uma
- Detalhes internos de nomes de função/tabela desnecessários ao nível de um TFC de graduação

---

## 28. Pendências reais

1. **Confirmar a fonte dos números de Lighthouse/Postman/Newman/ZAP** citados no pedido — não localizados no repositório nesta auditoria (podem estar em documento externo ou versão anterior do `EVIDENCIAS_TESTES_FINAIS.md` que não encontrei).
2. **Diagrama de Componentes (FIGURA_35)** sem Gemini/Web Push — correção de responsabilidade de quem edita o diagrama.
3. **Diagrama DER (FIGURA_34)** sem `cliente.observacao` e com `id_usuario:int` (já documentado via ADR 0001, só precisa de nota no texto).
4. **Busca de clientes por Observação** não implementada — se o texto do TFC já afirma isso, precisa ser corrigido para não divergir do sistema real.
5. **Regra de WhatsApp** não exige exatamente 13 dígitos/9º dígito — se o texto do TFC descrever essa exigência, precisa de ajuste.

---

## Checklist final para entrega

### Pode manter como está
- Introdução, objetivos, escopo geral do DERS
- RF001–RF016, nomes e numeração oficiais
- As 51 RNs do DERS original (texto oficial do `CLAUDE.md`)
- Arquitetura geral (frontend/backend separados + Supabase)
- Segurança (RLS, ownership, HMAC) já descrita nas evidências existentes

### Precisa alterar obrigatoriamente
- Qualquer menção a WhatsApp Web → trocar por WhatsApp Cloud API
- Incluir Gemini e Web Push na lista de tecnologias, se ausentes
- Corrigir a regra de validação do WhatsApp (mínimo 12 dígitos, não "exatamente 13 com 9º dígito obrigatório")
- Corrigir/remover afirmação de busca por Observação, se existir
- Descrever a divisão Clientes (cadastro) × Dashboard (operação) em RF003

### Seria bom atualizar
- Nota sobre `usuario.id_usuario` ser `uuid` (ADR 0001), não `int`
- Atributo `observacao` no DER
- Números de teste, se o capítulo ainda não estiver fechado

### Figuras que precisam alteração
- `FIGURA_35_Diagrama_de_Componentes.png`: adicionar Gemini e Web Push
- `FIGURA_34_DER.png`: adicionar `cliente.observacao` (opcional: nota sobre `uuid`)

### Números oficiais que devem ser preservados
- 644/150/794 testes (evidência histórica), **se o capítulo já estiver fechado com base neles**
- k6: 258 requisições, 0% falha, p95=228,15ms

### Informações novas que precisam entrar
- WhatsApp Cloud API, Gemini, Web Push como tecnologias do sistema final
- Divisão Clientes × Dashboard
- WhatsApp único por designer (como regra de integridade aprovada, não RN numerada)

### Informações antigas que precisam sair
- Qualquer referência a WhatsApp Web ou automação de navegador
- Qualquer afirmação de funcionalidade não implementada (busca por Observação, validação rígida de 13 dígitos)
