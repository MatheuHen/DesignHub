# Auditoria das Correções do Orientador — DesignHub

> Documento gerado por auditoria **somente leitura** do repositório DesignHub em 2026-10-17. Nenhum arquivo de código, banco, migration, diagrama ou documento do TFC foi alterado para produzir este material. Fontes usadas: `CLAUDE.md` (raiz), `docs/tfc-oficial/` (DERS/TFC I, diagramas extraídos FIGURA 30-35, ordem de precedência), `docs/decisions/` (7 ADRs), `docs/evidencias/CONTROLE_EXECUCAO.md`, `docs/traceability/matriz-rastreabilidade.md`, `docs/rastreabilidade/MATRIZ_RASTREABILIDADE_DESIGNHUB.csv`, `EVIDENCIAS_TESTES_FINAIS.md`, `RESUMO_SEMINARIO_10_SEMANA_TFC2.md`, leitura direta de todas as 50 migrations em `supabase/migrations/`, leitura direta de código em `backend/src/` e `frontend/src/`, e execução real das suítes de teste (`npm run test --workspace backend` / `--workspace frontend`) nesta sessão. Itens não confirmáveis estão marcados **NÃO CONFIRMADO** — nenhum foi inventado.

---

## 1. Arquitetura WhatsApp — anterior x atual

### A) O que estava previsto no DERS/TFC I

O TFC I descrevia a coleta estruturada inicial do cliente por automação do **WhatsApp Web** — um chatbot operando sobre a interface web do WhatsApp (não a API oficial da Meta).

### B) Como essa arquitetura funcionaria conceitualmente

- Uma sessão de navegador (real ou headless) mantém o WhatsApp Web autenticado com o número do estúdio/designer, de forma persistente.
- Um script de automação (ex.: Selenium/Puppeteer, nunca implementado) leria/enviaria mensagens via DOM da interface web.
- **Limitações**: não é um mecanismo oficial da Meta; depende de uma sessão de navegador sempre ativa; é frágil a qualquer mudança de layout da interface web; pode violar os Termos de Uso do WhatsApp; não tem SLA, suporte oficial nem webhook estruturado — a "leitura" de mensagens exige raspar a tela, não um evento HTTP confiável.

### C) Arquitetura REAL implementada (WhatsApp Cloud API oficial da Meta)

**Saída (DesignHub → Cliente):**
```
Designer autenticado → POST /api/clientes/:id/atendimentos (backend)
  → backend/src/integrations/whatsapp/whatsappClient.ts (sendTextMessage / sendTemplateMessage)
  → Graph API da Meta (graph.facebook.com/v21.0/{WHATSAPP_PHONE_NUMBER_ID}/messages)
  → WhatsApp do cliente
```

**Entrada (Cliente → DesignHub):**
```
Cliente responde no WhatsApp
  → Meta (Graph API)
  → Webhook HTTPS do DesignHub: POST /api/webhooks/whatsapp (backend/src/routes/whatsapp.routes.ts)
  → verificação de assinatura HMAC-SHA256 (X-Hub-Signature-256, webhookSignature.ts)
  → atendimento.service.ts (máquina de perguntas RN08, atendimentoQuestions.ts)
  → banco (atendimento, resposta_cliente, whatsapp_webhook_evento para idempotência por wamid)
  → ao concluir o questionário: RPC cria a solicitação (nasce em "Em produção")
```

A única rota do sistema sem autenticação JWT é esse webhook — protegida inteiramente por assinatura HMAC + handshake `hub.verify_token`, nunca por automação de navegador.

### D) Por que houve a mudança

Pré-aprovada no próprio `CLAUDE.md` (seção 2, "Alteração técnica aprovada para TFC II") e formalizada em `docs/decisions/0002-whatsapp-cloud-api.md`: a automação de WhatsApp Web é oficialmente desaconselhada, frágil e potencialmente contrária aos termos da Meta; a Cloud API é o canal oficial, estável e gratuito (na maior parte dos usos) para esse fluxo.

### E) O que mudou tecnicamente

- Transporte de mensagem: automação de navegador → chamadas HTTPS diretas à Graph API da Meta.
- Entrada de mensagem: raspagem de tela → webhook HTTPS assinado, com idempotência por `wamid`.
- Mensagens fora da janela de 24h desde o último contato do cliente exigem **template pré-aprovado** pela Meta (erro `131047` se texto livre) — mecanismo que não existe em automação de WhatsApp Web.

### F) O que NÃO mudou funcionalmente

RN01-RN10, RN19 e o fluxo do RF004 continuam idênticos: designer inicia o atendimento, perguntas predefinidas (RN08), toda pergunta/resposta registrada (RN09), prazo de 2 dias (RN05), criação da solicitação ao final. Nenhum ator, estado, tela ou regra de negócio foi criado/removido — só o mecanismo de transporte da mensagem.

### G) Texto curto sugerido para o comentário do professor

Ver seção 17, item 1.

---

## 2. Arquitetura atual completa

### FRONTEND
- React 19 + TypeScript + Vite, `react-router-dom` 7.
- Estrutura por feature em `frontend/src/features/{auth,admin,designer,avaliacao,instagram}`, sem pasta `hooks/`/`services/` genérica — cada feature tem seu próprio `api.ts` (camada de chamada REST) e tipos TypeScript (sem classes OOP de domínio).
- Autenticação: `@supabase/supabase-js` (`frontend/src/lib/supabaseClient.ts`), sessão gerida pelo próprio SDK; token enviado via `Authorization: Bearer` em `apiClient.ts`; perfil Designer/Admin **não** é decidido por sufixo de e-mail no frontend — vem de `GET /api/auth/me` (ver seção 10).

### BACKEND
- Node.js 24 + Express 5 + TypeScript. Camadas: `routes/` (13 arquivos, atua como controller fino) → `services/` (12, regra de negócio) → `repositories/` (10, acesso Supabase) → `integrations/` (`whatsapp/`, `instagram/`, `ai/` Gemini, `webpush/`).
- Validação de entrada: Zod (`backend/src/schemas/*.schemas.ts`).
- Middlewares: `auth.ts` (JWT Supabase), `internalAuth.ts` (segredo de jobs internos), `upload.ts` (Multer), `error-handler.ts`.

### BANCO
- PostgreSQL 17 via Supabase, **50 migrations** (confirmado por leitura direta de todos os arquivos).
- 13 tabelas de negócio do DER + 6 tabelas técnicas (ver seção 7).
- RLS habilitada em todas; só `SELECT` para `authenticated`/`anon` quando aplicável — toda escrita crítica passa por função `SECURITY DEFINER` chamada pelo backend com service role.
- Supabase Auth para identidade/sessão (ver ADR 0001, seção 7 abaixo); Supabase Storage (bucket privado `artes`); `pg_cron`+`pg_net` para 3 jobs periódicos.

### INTEGRAÇÕES
- **WhatsApp Cloud API** — `graph.facebook.com`, v21.0.
- **Instagram API** ("Instagram API with Instagram Login") — `graph.instagram.com` (host diferente do WhatsApp; confirmado como armadilha real documentada no ADR 0003), OAuth **por cliente** (ADR 0005), nunca credencial global.
- **Web Push (VAPID)** — aviso ao designer de publicação próxima (RNF acessório, não um RF numerado).
- **Gemini** — classificador auxiliar opcional (ver seção 13).

### INFRAESTRUTURA
- Vercel: 2 projetos separados (`designhub-backend`, `designhub-frontend`), mesmo time. Backend como função serverless; frontend como build estático Vite.
- Supabase Free tier, projeto único (`hfwgodzvitinubarwrjm`, região `sa-east-1`).

### Conexões reais (resumo)
```
Navegador (Admin/Designer/Cliente)
   | HTTPS
Frontend (React/Vite, Vercel CDN)
   | HTTPS + Authorization: Bearer <token Supabase>
Backend (Express/TS, Vercel Function)
   |-------------|-------------|------------------|
   v             v             v                  v
Supabase      Supabase      WhatsApp           Instagram API
Postgres+Auth Storage       Cloud API (Meta)   (Meta, OAuth por cliente)
+RLS+RPCs+pg_cron
   | pg_net, a cada 5 min
   v
Backend /api/internal/* (segredo compartilhado INTERNAL_JOB_SECRET)

Backend --HTTPS--> Gemini API (classificador opcional)
Backend --Web Push (VAPID)--> navegador do designer (opcional)
Meta --webhook assinado HMAC--> Backend
```

---

## 3. Caso de uso

Diagrama oficial analisado: `docs/tfc-oficial/diagramas-extraidos/FIGURA_30_Caso_de_Uso.png` (versão corrigida, maior precedência documental).

### Atores oficiais
Administrador, Designer, Cliente, **Serviço Automático / Rotina do Sistema**.

### Mapeamento RF → Ator (conforme a imagem oficial)
| Ator | RFs |
|---|---|
| Administrador | RF001, RF015, RF016 |
| Designer | RF002\*, RF003, RF005, RF007, RF008, RF012, RF013, RF014 |
| Cliente | RF004, RF009, RF010 |
| Serviço Automático / Rotina do Sistema | RF006, RF011 |

\* RF002 (Autenticar Usuário) está desenhado entre Administrador e Designer no diagrama (ambos acessam).

### Include/extend
**Nenhuma relação `<<include>>`/`<<extend>>` está desenhada na imagem oficial.** Conforme instrução do CLAUDE.md e deste pedido: como não há include/extend documentado na fonte de maior precedência, **não deve ser criado nenhum** nos diagramas corrigidos.

### WhatsApp / Instagram / ferramentas de design são atores?
**Não.** No diagrama de Componentes oficial (FIGURA_35), WhatsApp e Instagram aparecem dentro da caixa "Sistemas Externos" — são **tecnologias externas integradas**, não atores do caso de uso. Nenhuma ferramenta de design (Photoshop, Canva etc.) aparece em nenhum diagrama — a arte é produzida externamente, fora do escopo de qualquer ator do sistema.

### Sistema/Serviço Automático é ator?
**Sim** — está desenhado explicitamente como ator no diagrama oficial, ligado a RF006 e RF011.

### Ponto de atenção (não é erro de implementação, é leitura de diagrama)
No diagrama oficial, **RF014 (Realizar Publicação da Arte) está ligado ao ator Designer**, não ao "Serviço Automático". Já o `CLAUDE.md` (seção 4) lista RF014 entre as responsabilidades do "Serviço Automático" (RF006, RF011, RF014). Na implementação real, a publicação é majoritariamente automática (job `pg_cron` chamando `POST /api/internal/publicacoes/processar`), com o Designer aparecendo apenas no caminho manual (fallback) e na criação/edição do agendamento que antecede a publicação. Isso é uma **divergência entre o texto do CLAUDE.md e a imagem do diagrama oficial** — ver seção 16, D2.

---

## 4. Sequência — Incluir Cliente

Diagrama oficial: `FIGURA_31_Sequencia_Incluir_Cliente.png`. Participantes: Designer, Tela de Clientes, Sistema DesignHub, Banco de Dados.

Fluxo documentado: Designer acessa Clientes → solicita tela de cadastro → informa nome/WhatsApp/Instagram → sistema valida campos obrigatórios → **alt** dados válidos: verifica se WhatsApp já cadastrado → **alt interno** não cadastrado: registra e confirma sucesso / já cadastrado: exibe erro "WhatsApp já cadastrado" → **alt** dados inválidos: solicita correção.

### Comparação com a implementação real
- `POST /api/clientes` (`backend/src/routes/cliente.routes.ts`, designer-only) valida entrada via Zod (dados obrigatórios: nome, whatsapp; Instagram opcional) e persiste via `cliente.service.ts`/`cliente.repository.ts`.
- **NÃO CONFIRMADO nesta rodada** se existe uma validação explícita de "WhatsApp já cadastrado **para aquele designer**" retornando erro amigável equivalente ao `alt` do diagrama (o agente de backend não abriu `cliente.schemas.ts`/`cliente.service.ts` linha a linha neste ponto específico). A matriz de rastreabilidade (RF003) registra "CRUD, listagem/busca, ownership testado", sem citar explicitamente a regra de duplicidade de WhatsApp. Recomenda-se confirmar pontualmente no código antes de afirmar 100% de aderência a esse `alt` específico do diagrama.
- O restante do fluxo (tela → validação → persistência → confirmação) corresponde à estrutura real (Frontend `ClienteFormPanel.tsx` → `POST /api/clientes` → `cliente.repository.ts` → Postgres).

Nenhuma etapa foi adicionada ou removida em relação ao diagrama oficial nos pontos confirmados.

---

## 5. Sequência — Cancelar Agendamento

Diagrama oficial: `FIGURA_32_Sequencia_Cancelar_Agendamento.png`. Participantes: **Designer**, Tela de Publicações, Sistema, Banco de Dados. Fluxo: Designer acessa Publicações → lista agendamentos → seleciona um → aciona "Cancelar agendamento" → sistema verifica prazo mínimo de 3h → **alt** permitido: atualiza status para Cancelado + registra histórico + confirma / **alt** prazo não respeitado: retorna impedimento + mensagem explicando a regra de 3h.

### Regra real (RN31)
Confirmada idêntica: cancelamento só é aceito com ≥ 3 horas de antecedência; caso contrário, rejeitado com mensagem explicando a regra — mapeado no código pelo SQLSTATE `P0005` → `ConflictError`.

### Ator / Frontend / Backend / Serviço / Banco / Resposta (fluxo real do Designer)
```
Designer (SolicitacaoDetailPage.tsx)
  → DELETE /api/solicitacoes/:id/agendamento (solicitacao.routes.ts, requireProfile('designer'))
  → agendamento.service.ts → cancelAgendamento
  → agendamento.repository.ts → RPC cancel_agendamento (Postgres, SECURITY DEFINER)
      verifica janela de 3h sob lock; se ok, atualiza status + historico_solicitacao
  ← 200 (sucesso) ou 409 ConflictError (prazo não respeitado)
```

### Existe fluxo de cancelamento pelo Cliente via link/token?

**Sim — e isso é uma divergência documentada em relação ao diagrama de sequência oficial, não um erro.** Desde 13/09/2026 (rodada de correções/melhorias aprovada pelo orientador, conforme `docs/traceability/matriz-rastreabilidade.md`), existe também:

```
Cliente (AvaliacaoPage.tsx, via link/token — sem login)
  → POST /api/avaliacao/:token/cancelar-agendamento (avaliacao.routes.ts, rota pública)
  → avaliacao.service.ts → cancelarAgendamentoCliente
  → avaliacao.repository.ts → mesma RPC cancel_agendamento (reaproveitada, mesma regra de 3h)
  ← mesma resposta de sucesso/impedimento
```

A regra das 3h **não está duplicada**: ambos os fluxos (Designer autenticado e Cliente via token) chamam a mesma função/RPC no banco. O diagrama de sequência oficial documenta apenas o caminho do Designer — o caminho do Cliente é um item aditivo testado (`checklist-manual-2026-09-15.md`, item 1) e registrado na matriz de rastreabilidade, mas **o diagrama de sequência não foi atualizado para refletir essa ampliação**. Ver seção 16, D3.

---

## 6. Diagrama de Classes

Diagrama oficial: `FIGURA_33_Diagrama_de_Classe.png` — modelo de análise orientado a objetos: `Usuario` (base) → `Designer`/`Administrador` (herança), `Cliente`, `SolicitacaoArte`, `AgendamentoPublicacao`, `Publicacao`, `Atendimento`, `RespostaCliente`, `HistoricoSolicitacao`, `VersaoArte`, `Avaliacao`, `Ajuste`, com métodos (`cadastrarCliente()`, `iniciarAtendimento()`, `responderChatbot()`, `avaliarArte()` etc.).

### A implementação usa classes de domínio literais?

**Não.** O backend está estruturado como **rotas → services → repositories → schemas → adapters/integrations** (funções TypeScript + tipos/interfaces), não como classes OOP com métodos de negócio. Mesmo padrão no frontend (interfaces + funções `api.ts` por feature, sem classes de domínio). Isso é consistente com a stack congelada (Express + TypeScript funcional), não um desvio arquitetural — é a forma usual de se implementar Express/TS.

### Respostas pontuais

**A) O diagrama de classes antigo representa a implementação real?** Não literalmente — é um modelo de análise OO; a implementação é em camadas funcionais.

**B) Quais elementos ainda correspondem?** As **entidades conceituais e seus atributos/relacionamentos** (Usuario/Designer/Administrador, Cliente, SolicitacaoArte≈solicitacao, VersaoArte, Avaliacao, Ajuste, AgendamentoPublicacao, Publicacao, Atendimento, RespostaCliente, HistoricoSolicitacao) correspondem **quase integralmente** às tabelas físicas (ver seção 7) — a estrutura conceitual de dados está correta e implementada.

**C) Quais não correspondem?** Os **métodos** desenhados nas classes (ex.: `SolicitacaoArte.atualizarStatus()`) não existem como métodos de uma classe `SolicitacaoArte` no código — a lógica equivalente está distribuída em `solicitacao.service.ts` + funções `SECURITY DEFINER` no banco (RPCs). A herança `Usuario ← Designer/Administrador` é representada no banco como tabelas de especialização 1:1 (`designer.id_usuario`/`administrador.id_usuario` FK para `usuario.id_usuario`), não como herança de classes em código.

**D) Existe entidade "Arte" independente ou o conceito está em `versao_arte`?** Confirmado: **não existe tabela/classe "Arte" separada.** O diagrama de classes já usa `VersaoArte` (não "Arte"), coerente com o DER e com a tabela física `versao_arte`.

**E) Modelagem academicamente correta e coerente com a implementação?** O diagrama de classes de **análise** (entidades + atributos + relacionamentos + cardinalidade) permanece válido como estava. Para refletir a implementação física, a forma mais honesta é mantê-lo como "diagrama de classes de análise/domínio" (não de implementação) — ou, alternativamente, complementar com um diagrama de camadas (routes/services/repositories) **separado**, deixando explícito que o sistema não é implementado com objetos de domínio com estado e comportamento encapsulados.

**F) Deve ser corrigido ou refeito?** Não precisa ser refeito do zero — as entidades/atributos/relacionamentos continuam corretos. Recomenda-se apenas **esclarecer no texto do TFC** (não necessariamente no diagrama) que esse é um diagrama de classes de **análise/domínio**, e que a implementação real usa uma arquitetura em camadas (routes/services/repositories) em vez de objetos com métodos, conforme a stack Express/TypeScript documentada no próprio `CLAUDE.md`. O diagrama em si está **legível** na versão extraída (FIGURA_33) — o problema relatado pelo professor é provavelmente a versão renderizada/embutida no corpo do TFC, não o conteúdo conceitual.

---

## 7. DER

Diagrama oficial: `FIGURA_34_DER.png`, cruzado com leitura direta de todas as 50 migrations em `supabase/migrations/`.

### Entidade por entidade (DER lógico x schema físico)

| Entidade DER | Tabela física | PK real | Confirma/diverge |
|---|---|---|---|
| usuario | `usuario` | `id_usuario uuid` (FK `auth.users.id`) | Diverge do DER **só no tipo da PK** (int → uuid) e na ausência física de `senha_hash` — mudança **documentada e aprovada** em ADR 0001 (delegação ao Supabase Auth), não um erro |
| designer | `designer` | `id_usuario uuid` PK/FK | Confirma (mesma adaptação uuid) |
| administrador | `administrador` | `id_usuario uuid` PK/FK | Confirma |
| cliente | `cliente` | `id_cliente bigint identity` | Confirma integralmente (PK numérica, como no DER) |
| solicitacao | `solicitacao` | `id_solicitacao bigint identity` | Confirma; CHECK garante os 7 estados exatos |
| agendamento_publicacao | `agendamento_publicacao` | `id_agendamento bigint identity` | Confirma os campos do DER; colunas técnicas aditivas (ver abaixo) |
| publicacao | `publicacao` | `id_publicacao bigint identity` | Confirma; colunas técnicas aditivas (permalink, comprovante_url) |
| atendimento | `atendimento` | `id_atendimento bigint identity` | Confirma; enum de status interno ampliado (não é um dos 7 estados oficiais de `solicitacao`, é controle interno do atendimento) |
| resposta_cliente | `resposta_cliente` | `id_resposta bigint identity` | Confirma; coluna aditiva `id_evento` (amarra ao `wamid`) |
| historico_solicitacao | `historico_solicitacao` | `id_historico bigint identity` | Confirma integralmente |
| versao_arte | `versao_arte` | `id_versao bigint identity` | Confirma integralmente |
| avaliacao | `avaliacao` | `id_avaliacao bigint identity` | Confirma os campos do DER; colunas aditivas (`deseja_agendamento`, `opcao_publicacao` — ADR 0004) |
| ajuste | `ajuste` | `id_ajuste bigint identity` | Confirma integralmente |

**Todas as 13 entidades do DER existem fisicamente; nenhuma foi removida ou renomeada.** As divergências são sempre **aditivas** (colunas novas), nunca remoção/renomeação de PK/FK/coluna de negócio do DER.

### Supabase Auth x `usuario`/`senha_hash`

Confirmado: `usuario.id_usuario` é `uuid`, FK para `auth.users(id) on delete cascade`; **não existe coluna física `senha_hash`** — delegado ao Supabase Auth (`auth.users.encrypted_password`), exatamente conforme ADR 0001 e a própria seção 10 do `CLAUDE.md`, que já previa e autorizava essa divergência.

### Tabelas técnicas (fora do DER, não são novos requisitos funcionais)

| Tabela | Propósito |
|---|---|
| `whatsapp_webhook_evento` | Deduplicação/idempotência de webhook da Meta (dedupe por `wamid`) |
| `avaliacao_link_token` | Token opaco (hash) do link público de avaliação (RF009) |
| `cliente_instagram_conexao` | Conexão OAuth Instagram por cliente (token cifrado via `pgcrypto`) |
| `instagram_oauth_state` | Estado CSRF efêmero do handshake OAuth do Instagram |
| `instagram_data_deletion_request` | Log do callback obrigatório de exclusão de dados exigido pela Meta |
| `push_subscription` | Assinaturas Web Push (VAPID) do navegador do designer |

### UUID
Usado **só** em `usuario`/`designer`/`administrador` (para integração nativa com `auth.users`). Todas as demais entidades do DER mantêm PK numérica (`bigint identity`), como documentado.

### Conclusão
**O DER antigo continua válido como modelo lógico.** Não precisa ser refeito — precisa apenas de uma nota explícita (já redigida no ADR 0001) esclarecendo a adaptação física de `usuario` para `uuid`/Supabase Auth, e, opcionalmente, uma observação de que tabelas técnicas de infraestrutura (webhook, token, OAuth, push) existem no banco físico sem serem novas entidades de negócio do DER.

---

## 8. Diagrama de Componentes

Diagrama oficial: `FIGURA_35_Diagrama_de_Componentes.png`. Mostra: WEB (Front-end: React/TypeScript/HTML-CSS/Cliente de API/Links Públicos; Back-end: Node.js/TypeScript/Express.js/API Server/Regras de Negócio) + Sistemas Externos (**"WhatsApp Web — Chatbot e Links"**, Instagram — Publicação) + Banco de Dados/Supabase (PostgreSQL, Supabase Auth, Supabase Storage).

### Componentes confirmados na implementação real
Frontend (React/TS/Vite), Backend (Node/Express/TS), PostgreSQL/Supabase, Supabase Auth, Supabase Storage, **WhatsApp Cloud API** (não WhatsApp Web), **Instagram API oficial** (não "Publicação" genérica), **Web Push**, e **Gemini** (opcional, quando a chave está configurada).

### Dependências/conexões que precisam aparecer
Frontend → Backend (HTTPS/REST, Bearer token Supabase); Backend → Supabase (Postgres/Auth/Storage, dois clientes: escopado por token e service-role); Backend ↔ WhatsApp Cloud API (REST + webhook assinado); Backend ↔ Instagram API (REST + OAuth por cliente); Supabase (pg_cron/pg_net) → Backend (`/api/internal/*`, segredo compartilhado); Backend → Gemini API (opcional); Backend → navegador do designer (Web Push, opcional).

### Divergência relevante
**O diagrama de componentes extraído ("corrigido") ainda nomeia "WhatsApp Web — Chatbot e Links"**, não "WhatsApp Cloud API". Isso não corresponde à arquitetura real implementada (seção 1) nem à decisão já registrada no `CLAUDE.md`/ADR 0002. Este é provavelmente o ponto concreto que motivou a pergunta do professor sobre arquitetura — ver seção 16, D1, e texto sugerido na seção 17.

Não foram inventados componentes além dos confirmados acima.

---

## 9. Diagrama de Arquitetura

Estrutura textual da arquitetura real (não um desenho, apenas o roteiro em texto pedido):

```
CAMADA DE APRESENTAÇÃO
Componente: Frontend SPA
Tecnologia: React 19 + TypeScript + Vite
Conexão: HTTPS/JSON
Protocolo: REST, Authorization: Bearer <token Supabase>
Responsabilidade: UI, nenhuma regra de negócio

        ↓ HTTPS/REST

CAMADA DE API/BACKEND
Componente: API Server
Tecnologia: Node.js + Express 5 + TypeScript (Vercel Serverless Function)
Conexão: HTTPS (recebe do frontend), HTTPS (chama Supabase e Meta)
Responsabilidade: validação (Zod), autenticação/autorização por perfil+ownership,
  orquestração de integrações, chamada de RPCs atômicas

        ↓ @supabase/supabase-js (client-token e service-role)

CAMADA DE DADOS
Componente: PostgreSQL 17 (Supabase) + Auth + Storage
Conexão: SQL/RPC (SECURITY DEFINER), RLS como 2ª camada de autorização
Responsabilidade: persistência, integridade, constraints, idempotência,
  agendamento de jobs (pg_cron/pg_net)

INTEGRAÇÕES EXTERNAS (lateral, a partir do Backend)
- WhatsApp Cloud API (Meta) — REST + webhook HTTPS assinado HMAC-SHA256
- Instagram API oficial (Meta) — REST + OAuth por cliente
- Gemini API (Google) — REST, opcional, classificador auxiliar
- Web Push (protocolo aberto, VAPID) — opcional, aviso ao designer

INFRAESTRUTURA
- Vercel (2 projetos: backend função serverless, frontend build estático)
- Supabase Free tier, projeto único, região sa-east-1
```

Nenhum componente foi inventado — todos listados foram confirmados em código/config nesta auditoria.

---

## 10. RF001 x RF015 x RF016

### Confirmação rigorosa
- **RF001 continua requisito independente** no texto do `CLAUDE.md` (seção 5) e na matriz de rastreabilidade.
- **RF015 continua requisito independente** (mesma fonte).
- **RF016 continua requisito independente** (mesma fonte, rota própria).

### A implementação compartilha telas/código?
**Sim, parcialmente.** Confirmado por leitura direta do código:
- RF001 (Manter Designer) e RF015 (Gerenciar Designers) usam **o mesmo arquivo de rotas e o mesmo service** — `backend/src/routes/designer.routes.ts` / `backend/src/services/designer.service.ts`. O próprio código documenta isso em comentário explícito: *"RF001/RF015: toda a área de gestão de designers é exclusiva do Administrador."*
- RF016 (Reatribuir Solicitações) tem **rota fisicamente separada** — `PATCH /api/solicitacoes/:id/reatribuir` em `backend/src/routes/solicitacao.routes.ts` — mas a **função de serviço** (`reassignSolicitacao`) está implementada dentro de `designer.service.ts`, importada por `solicitacao.routes.ts`.

### Isso significa que os requisitos foram fundidos?
**Não.** "Compartilhar implementação" significa que RF001/RF015 reaproveitam o mesmo CRUD de designer (porque são, na prática, a mesma operação de dados vista por duas óticas do texto do TFC: manter um designer x gerenciar o conjunto de designers) — cada ação (criar, listar, inativar, excluir, alterar senha, reatribuir) continua individualmente identificável, rastreável e testada separadamente (ver testes em `designer.routes.test.ts`, `designer.service.test.ts`). "Unificar requisitos" seria removê-los do texto do TFC, apagar a distinção RF001/RF015/RF016 da documentação, ou tratar como um único caso de uso sem rastreabilidade própria — **isso não ocorreu**: os três RFs continuam distintos na matriz de rastreabilidade, com evidência própria cada um.

### Texto de 3-6 linhas sugerido para substituir o trecho confuso do relatório

> RF001, RF015 e RF016 permanecem requisitos funcionais distintos e rastreáveis individualmente. Por tratarem do mesmo recurso de dados (designer), RF001 e RF015 reaproveitam o mesmo serviço de CRUD no backend (`designer.service.ts`), sem perda de rastreabilidade — cada ação é testada e documentada separadamente. RF016 (reatribuição) possui rota própria (`PATCH /api/solicitacoes/:id/reatribuir`), exclusiva do Administrador, preservando histórico, versões, avaliações e agendamentos da solicitação reatribuída. Compartilhar implementação não é o mesmo que unificar requisitos.

---

## 11. Termos técnicos solicitados pelo professor

**migration**
O que é: um arquivo versionado com instruções SQL que altera o schema do banco de forma incremental e reproduzível.
Como foi usado no DesignHub: 50 arquivos em `supabase/migrations/`, aplicados em ordem cronológica pelo timestamp no nome, cobrindo as 13 entidades do DER + tabelas técnicas.

**ambientes**
O que é: configurações isoladas (variáveis, URLs, credenciais) para cada estágio do ciclo de vida do software (local, produção etc.).
Como foi usado no DesignHub: desenvolvimento local (`.env.local`) e produção (Vercel) — ver seção 12, sem ambiente de staging.

**RLS (Row Level Security)**
O que é: mecanismo do PostgreSQL que restringe, linha a linha, quais registros uma conexão pode ver/alterar, de acordo com regras declaradas no próprio banco.
Como foi usado no DesignHub: habilitada em todas as tabelas de negócio; `authenticated` só tem `SELECT` filtrado por `auth.uid()` (ownership); toda escrita crítica passa por função `SECURITY DEFINER`, nunca direto do cliente.

**policies**
O que é: as regras específicas (SQL `CREATE POLICY`) que implementam o RLS para cada operação (SELECT/INSERT/UPDATE/DELETE).
Como foi usado no DesignHub: ex. `cliente_select_owner_or_admin` — designer só vê clientes onde `id_designer = auth.uid()`, ou admin.

**RPC (Remote Procedure Call)**
O que é: chamada a uma função armazenada no banco (Postgres) a partir da aplicação, em vez de montar a query diretamente.
Como foi usado no DesignHub: operações atômicas críticas (ex.: `reassign_solicitacao`, `submit_avaliacao`, `cancel_agendamento`) são funções Postgres chamadas via RPC pelo backend.

**SECURITY DEFINER**
O que é: atributo de função Postgres que a executa com os privilégios de quem a criou (não de quem a chama), permitindo operações controladas sem dar privilégio direto ao usuário.
Como foi usado no DesignHub: todas as RPCs críticas são `SECURITY DEFINER` com `search_path` fixo e `revoke`/`grant` explícitos, para evitar que `anon`/`authenticated` as chamem diretamente.

**trigger**
O que é: rotina executada automaticamente pelo banco quando um evento (INSERT/UPDATE) ocorre em uma tabela.
Como foi usado no DesignHub: ex. `set_updated_at` (timestamp automático), `ajuste_requer_avaliacao_ajustes` (impede `ajuste` sem `avaliacao` em status `Ajustes`).

**job**
O que é: tarefa executada periodicamente de forma automática, sem intervenção humana.
Como foi usado no DesignHub: 3 jobs (publicação vencida, expiração de atendimento parado, notificação de publicação próxima), todos via `pg_cron`.

**pg_cron**
O que é: extensão do PostgreSQL que agenda execução periódica de comandos SQL diretamente no banco.
Como foi usado no DesignHub: agenda a chamada aos 3 jobs acima, sem custo (compatível com o plano gratuito do Supabase).

**pg_net**
O que é: extensão do PostgreSQL que permite fazer chamadas HTTP a partir de uma função SQL.
Como foi usado no DesignHub: usada pelos jobs `pg_cron` para chamar os endpoints internos do próprio backend (`/api/internal/*`).

**monorepo**
O que é: um único repositório Git contendo múltiplos projetos/pacotes relacionados.
Como foi usado no DesignHub: `frontend/` e `backend/` como dois workspaces no mesmo repositório, com scripts raiz agregando lint/typecheck/test/build.

**npm workspaces**
O que é: recurso nativo do npm para gerenciar múltiplos pacotes dentro de um monorepo com um único `node_modules`/lockfile.
Como foi usado no DesignHub: `package.json` raiz declara `frontend`/`backend` como workspaces.

**Zod**
O que é: biblioteca de validação e inferência de tipos para TypeScript.
Como foi usado no DesignHub: valida todo payload de entrada (body/params/query) em `backend/src/schemas/*.schemas.ts`, incluindo webhook da Meta e resposta do Gemini.

**Multer**
O que é: middleware Express para processar uploads `multipart/form-data`.
Como foi usado no DesignHub: recebe o arquivo da arte/referência em memória antes de validar a assinatura de bytes real (não confia em extensão/Content-Type declarados).

**Helmet**
O que é: middleware Express que aplica um conjunto de headers HTTP de segurança por padrão.
Como foi usado no DesignHub: configurado no backend junto a uma CSP própria, X-Content-Type-Options, etc.

**CORS**
O que é: mecanismo do navegador que restringe quais origens podem consumir uma API via JavaScript, controlado por headers do servidor.
Como foi usado no DesignHub: `cors({ origin: <domínio fixo do frontend>, credentials: true })` — nunca wildcard, confirmado em produção.

**express-rate-limit**
O que é: middleware Express que limita a quantidade de requisições por janela de tempo, por chave (IP ou usuário).
Como foi usado no DesignHub: limite global + limites dedicados por rota sensível (upload, link público de avaliação, gestão de designers, endpoint interno de publicação).

**Web Push**
O que é: protocolo aberto (não proprietário) que permite a um servidor enviar notificações ao navegador do usuário mesmo com a aba fechada.
Como foi usado no DesignHub: aviso ao designer de publicação programada para as próximas ~2h.

**VAPID**
O que é: padrão de autenticação (par de chaves pública/privada) usado pelo Web Push para provar a identidade do servidor que envia a notificação.
Como foi usado no DesignHub: par de chaves gerado localmente (`npx web-push generate-vapid-keys`), sem serviço pago; chave pública exposta via `GET /api/push/vapid-public-key`.

**Service Worker**
O que é: script que roda em segundo plano no navegador, independente da página, habilitando push/notificações/cache offline.
Como foi usado no DesignHub: recebe o evento de Web Push e exibe a notificação ao designer; testado em E2E real (Playwright) contra produção.

**idempotência**
O que é: propriedade de uma operação que produz o mesmo resultado final mesmo se executada mais de uma vez.
Como foi usado no DesignHub: webhooks (dedupe por `wamid`), publicação (índice único `publicacao_unica_sucesso_idx` — reprocessar o job não publica duas vezes), agendamento (índice único de agendamento ativo por solicitação).

---

## 12. Ambientes

Confirmado por leitura de `.env.example`, `backend/vercel.json`, `frontend/vercel.json`, scripts do `package.json` raiz:

- **Desenvolvimento local**: `npm run dev` (via `concurrently`) ou `npm run dev:backend`/`dev:frontend`; backend com `tsx watch`, frontend com `vite`; variáveis em `.env.local` (nunca versionado).
- **Produção**: Vercel, 2 projetos (`designhub-backend`, `designhub-frontend`), URLs reais referenciadas na CSP (`designhub-frontend-ten.vercel.app`, `designhub-backend.vercel.app`).
- **Supabase**: **um único projeto** (`hfwgodzvitinubarwrjm`, região `sa-east-1`) usado tanto em desenvolvimento quanto em produção — não há projeto Supabase separado para testes/staging.
- **Staging/homologação**: **NÃO HÁ EVIDÊNCIA** de um ambiente intermediário no repositório. Não deve ser citado na apresentação como se existisse.

---

## 13. Gemini

- **O que faz**: classificador auxiliar de linguagem natural, usado em **dois pontos específicos e só como segunda tentativa**, depois que uma regra determinística (regex) já tentou decidir e não conseguiu: (1) classificar a resposta de confirmação inicial do questionário (sim/não/indefinido) e (2) desde 27/09/2026, classificar se uma resposta livre do cliente é pertinente à pergunta atual do questionário (usando um pequeno histórico da conversa como contexto).
- **Onde entra no fluxo**: exclusivamente dentro de `atendimento.service.ts` (RF004/RN08), chamando `backend/src/integrations/ai/geminiClient.ts`.
- **O que ele NÃO pode fazer**: não muta estado diretamente, não tem acesso a function-calling/ferramentas, não decide sozinho — só retorna uma classificação (enum fechado, validado por Zod) que o código já existente usa da mesma forma que usava o resultado da regex.
- **Fallback determinístico**: sem a chave configurada (ou em timeout/erro/schema inesperado/limite local excedido), a função retorna `null` imediatamente e o fluxo volta a usar só a regra determinística — nunca bloqueia o atendimento, nunca lança exceção.
- **Por que a ausência da chave não quebra o sistema**: por desenho — o classificador é estritamente opcional (fail-closed), o questionário do WhatsApp (RF004) funciona de ponta a ponta sem ele, só com um pouco mais de atrito em respostas fora do padrão regex.
- **Variável usada (só o nome)**: `GEMINI_API_KEY`; modelo configurável via `GEMINI_MODEL` (padrão atual: `gemini-3.5-flash-lite` — corrigido em 23/09/2026 depois que o Google descontinuou `gemini-2.5-flash-lite` para chaves novas).
- **Estava ativa no ambiente descrito?** Status **mudou ao longo do projeto**: inativa (sem chave) até 23/09/2026; **ativada em produção pelo usuário em 23/09/2026** e validada com uma chamada real (`200`, resposta dentro do schema esperado). Portanto, no estado **atual** do repositório, a integração Gemini está configurada e funcional em produção — qualquer trecho do TFC redigido antes dessa data que a descreva como "inativa" está desatualizado e deve ser revisado para refletir o estado atual.
- **Nota de transparência (sem expor segredo)**: há um incidente já documentado em `docs/evidencias/CONTROLE_EXECUCAO.md` em que, durante o diagnóstico do erro 404 do modelo descontinuado, um comando malformado expôs brevemente o valor da chave no output de uma ferramenta; o usuário foi avisado no mesmo turno e optou explicitamente por não rotacionar a chave. Nenhum valor é reproduzido neste documento.

---

## 14. Classificação correta dos testes

Classificação obtida por leitura direta dos arquivos de teste (amostra ampla, backend e frontend), não apenas pelo nome do arquivo:

| Tipo | O que é no projeto | Evidência |
|---|---|---|
| **Unitário** | Services e repositories com dependências mockadas (`vi.mock`) ou com um "fake client" manual simulando a query builder do Supabase — nunca toca um banco real. Ex.: `avaliacao.service.test.ts`, `atendimento.service.test.ts`, `cliente.repository.test.ts`, `webhookSignature.test.ts` (função criptográfica pura). | ~34 arquivos |
| **Integração (camada HTTP)** | Sobe a aplicação Express real (`createApp()`) e usa Supertest para bater nas rotas, mas o módulo Supabase é mockado — valida autenticação/autorização/shape de resposta/rate limit/status HTTP, não o banco real. Ex.: `solicitacao.routes.test.ts`, `designer.routes.test.ts`, `auth.routes.test.ts`. | ~13 arquivos |
| **Integração (adapters externos mockados)** | Testa o adapter (`fetch` global stubado) sem nunca chamar a API real da Meta/Google. Ex.: `instagramClient.test.ts`, `geminiClient.test.ts`, `whatsappClient.test.ts`. | incluído na contagem acima |
| **E2E real (navegador, contra produção)** | **1 cenário**: `frontend/e2e/web-push.spec.ts` (Playwright), login real, Service Worker real, push real contra VAPID de produção — não é um RF numerado, é o RNF de notificação (item 9/10 das rodadas de melhoria). | 1 arquivo, 1 teste |
| **Análise estática** | ESLint (0 erros/warnings) + TypeScript `tsc`/`tsc -b` (0 erros) nos dois workspaces. | — |
| **Desempenho/carga** | `k6-health-test.js` — 10 VUs/30s **apenas** contra `GET /api/health`. Não cobre fluxos de negócio (upload, listagem, avaliação, publicação). | 1 script |
| **Segurança (negativa)** | Não é uma suíte separada — está embutida nos testes de integração HTTP acima: testes nomeados explicitamente como "...403", "rejeita quando não há token", "IDOR" (ex.: `versaoArte.service.test.ts`, "rejeita quando a versão não pertence à solicitação informada (IDOR)"). | integrado aos ~13 de integração |
| **RLS automatizada** | **Não existe.** Não há diretório `supabase/tests` (pgTAP ou equivalente) nem suíte que exercite as policies de RLS contra um Postgres real com usuários diferentes. A "ownership via RLS" mencionada em nomes de teste é, na prática, ownership validado na camada de aplicação com um *double* do Supabase — defesa em profundidade real e válida, mas **não é prova de que a RLS do Postgres em si bloqueia acesso cruzado**. | NÃO CONFIRMADO/ausente |

### Observação importante para o texto do TFC
Se o capítulo de testes descrever os "testes de integração" como prova de que "RLS foi testada" ou de que "a integração com Meta/Gemini foi validada automaticamente", isso seria uma caracterização imprecisa da evidência real. A caracterização correta é: **ownership aplicado e testado na camada de serviço (com mocks/fakes)**, **RLS validada por revisão de migration (não por teste automatizado executável)**, e **integrações Meta/Gemini testadas com adapter mockado, com validação manual pontual registrada em ADRs/`CONTROLE_EXECUCAO.md`** (não suíte automatizada contra API real).

Não usar "teste de funcionalidade" ou "teste geral" como categoria técnica — cada um dos tipos acima tem um nome técnico próprio, conforme a tabela.

---

## 15. Números atuais

**Execução real nesta auditoria** (`npm run test --workspace backend` / `--workspace frontend`, 2026-10-17, branch `main`, commit `1b25857`):

| Camada | Suítes | Testes | Falhas | Resultado |
|---|---|---|---|---|
| Backend (Vitest) | **52** | **650** | 0 | PASS |
| Frontend (Vitest + Testing Library) | **15** | **150** | 0 | PASS |
| **Total** | **67** | **800** | **0** | **PASS** |

### HISTÓRICO x ATUAL

| Data/fonte | Backend | Frontend | Total |
|---|---|---|---|
| `EVIDENCIAS_TESTES_FINAIS.md` (2026-09-27, antes do commit `9dcd679`) | 644 | 150 | 794 |
| `CONTROLE_EXECUCAO.md` / `RESUMO_SEMINARIO_10_SEMANA_TFC2.md` (2026-09-27, após `9dcd679`) | 650 | 150 | 800 |
| **Esta auditoria — execução real (2026-10-17)** | **650** | **150** | **800** |

**Conclusão**: o número atual e confirmado por execução real é **650 (backend) + 150 (frontend) = 800**, não mais 794. A diferença (+6 no backend) vem do commit `9dcd679` (27/09/2026), que adicionou testes ao classificador de pertinência do WhatsApp (Gemini com histórico de conversa). Nenhum teste falhou.

Lint e typecheck **não foram reexecutados nesta auditoria** (fora do pedido específico desta rodada, que pediu apenas a contagem de testes); os relatórios internos mais recentes (`CONTROLE_EXECUCAO.md`, 27/09/2026) registram ambos limpos nos dois workspaces.

---

## 16. Divergências encontradas

| # | Divergência | Fonte | Natureza |
|---|---|---|---|
| D1 | ~~Diagrama de Componentes extraído (FIGURA_35) ainda nomeia "WhatsApp Web — Chatbot e Links", não WhatsApp Cloud API~~ **CORRIGIDO em 2026-10-17** (ver seção 18.6) | Comparação FIGURA_35 x ADR 0002/implementação real | Diagrama desatualizado em relação a uma mudança já aprovada e documentada |
| D2 | Diagrama de Casos de Uso (FIGURA_30) liga RF014 ao ator Designer; `CLAUDE.md` seção 4 lista RF014 entre as responsabilidades do "Serviço Automático" | Comparação FIGURA_30 x CLAUDE.md | Divergência textual entre dois documentos-fonte do próprio TFC, não um erro de implementação |
| D3 | Diagrama de sequência "Cancelar Agendamento" (FIGURA_32) mostra só o Designer; a implementação real (desde 13/09/2026) também permite cancelamento pelo Cliente via link/token, mesma regra de 3h reaproveitada | Comparação FIGURA_32 x código real + matriz de rastreabilidade | Funcionalidade aditiva aprovada e testada, diagrama não atualizado |
| D4 | RN50 descreve identificação de administrador por sufixo de e-mail `.adm`; a implementação real decide o perfil por coluna persistida (`usuario.perfil`), validada no servidor — nunca por string de e-mail | ADR/RESUMO_SEMINARIO (nota já registrada) | Implementação mais segura que o texto literal da RN50; mesma regra de negócio, mecanismo mais robusto |
| D5 | Diagrama de Classes (FIGURA_33) é um modelo OO com métodos; a implementação real é em camadas funcionais (routes/services/repositories), sem classes de domínio com métodos | Seção 6 desta auditoria | Diagrama de análise x diagrama de implementação — natureza diferente, não erro |
| D6 | 6 tabelas técnicas (`whatsapp_webhook_evento`, `avaliacao_link_token`, `cliente_instagram_conexao`, `instagram_oauth_state`, `instagram_data_deletion_request`, `push_subscription`) existem no banco físico sem estar no DER lógico original | Seção 7 desta auditoria | Infraestrutura de segurança/idempotência, não novas entidades de negócio |
| D7 | Testes classificados internamente como "integração" não tocam um Postgres/Supabase real (usam mocks/fakes do Supabase); apenas 1 teste E2E (Web Push) roda contra produção real | Seção 14 desta auditoria | Risco de caracterização incorreta no texto do TFC se apresentado como "testado contra ambiente real" |
| D8 | Não existe suíte automatizada de RLS (pgTAP ou equivalente); a "RLS testada" citada em alguns nomes de teste refere-se a ownership testado na camada de aplicação com double, não à policy do Postgres em si | Seção 14 desta auditoria | Lacuna de evidência formal para o Gate B do `CLAUDE.md` |
| D9 | `k6-health-test.js` mede apenas `GET /api/health`, não fluxos de negócio (upload, listagem, avaliação, publicação) | Leitura direta do script | Teste de carga limitado a um smoke test, não ao desempenho geral da API |
| D10 | Lighthouse, Postman/Newman e relatório final do OWASP ZAP (0 Alto/0 Médio/0 Baixo) citados em sessões anteriores **não foram localizados como arquivo** no repositório atual | `docs/testes/ESTRATEGIA_TESTES.md`/`RESUMO_SEMINARIO_10_SEMANA_TFC2.md` (já registrado antes desta auditoria) | Dado não reconfirmável — não citar como fato auditado sem localizar a fonte original |
| D11 | A suíte de testes E2E ponta a ponta prevista na Fase 15 do roadmap (20 cenários de fluxo completo) não existe em Playwright — só 1 spec de Web Push | Seção 14 desta auditoria | A cobertura desses 20 cenários existe como validação manual registrada (matriz de rastreabilidade), não como suíte automatizada de navegador |
| D12 | Diagrama de Casos de Uso oficial não contém nenhuma relação `<<include>>`/`<<extend>>` | FIGURA_30 | Confirma que nenhuma relação desse tipo deve ser criada nos diagramas corrigidos |

Nenhuma dessas divergências foi corrigida nesta sessão (auditoria somente leitura). Todas ficam registradas para decisão humana/documental.

---

## 17. Textos curtos sugeridos para responder às marcações

**COMENTÁRIO DO PROFESSOR:**
"No DERS, o atendimento foi especificado considerando uma integração compatível com o WhatsApp Web. Durante a implementação, essa solução foi substituída pela WhatsApp Cloud API oficial da Meta (...) qual a arquitetura atual? e qual era a arquitetura anterior? explique"

**TRECHO SUGERIDO PARA ACRESCENTAR:**
> A arquitetura anterior (DERS) previa automação do WhatsApp Web por navegador — mecanismo não oficial, dependente de sessão persistente e sujeito a instabilidade de layout. A arquitetura atual usa a WhatsApp Cloud API oficial da Meta: o DesignHub envia mensagens via chamadas HTTPS diretas à Graph API (`graph.facebook.com`), e recebe respostas por um webhook HTTPS próprio (`/api/webhooks/whatsapp`), validado por assinatura HMAC-SHA256 e idempotente por identificador único de mensagem (`wamid`). O fluxo funcional (RF004, RN01-RN10) permanece idêntico; mudou apenas o mecanismo de transporte da mensagem.

---

**COMENTÁRIO DO PROFESSOR (implícito):**
"Diagrama de Casos de Uso — ilegível."

**TRECHO SUGERIDO PARA ACRESCENTAR:**
> O diagrama de casos de uso contém 4 atores (Administrador, Designer, Cliente e Serviço Automático/Rotina do Sistema) e 16 casos de uso correspondentes a RF001-RF016, sem relações de inclusão/extensão. A versão legível está disponível em `docs/tfc-oficial/diagramas-extraidos/FIGURA_30_Caso_de_Uso.png` e deve substituir a imagem atualmente embutida no corpo do texto.

---

**COMENTÁRIO DO PROFESSOR:**
"Diagrama de Classes — ilegível - verificar se essa modelagem condiz com as classes que foram implementadas no sistema."

**TRECHO SUGERIDO PARA ACRESCENTAR:**
> O diagrama de classes representa o modelo de domínio (entidades, atributos e relacionamentos), que corresponde integralmente às tabelas físicas do banco. A implementação, no entanto, segue a arquitetura em camadas da stack Express/TypeScript (rotas → serviços → repositórios), e não objetos com métodos de negócio — por isso os métodos desenhados nas classes não existem literalmente no código, embora a regra que representam esteja implementada nos serviços/funções do banco correspondentes.

---

**COMENTÁRIO DO PROFESSOR:**
"DER — ilegível - verificar se essa modelagem condiz com o banco de dados implementado."

**TRECHO SUGERIDO PARA ACRESCENTAR:**
> As 13 entidades do DER existem fisicamente no banco Supabase/PostgreSQL, com os mesmos atributos e relacionamentos documentados, exceto por uma adaptação já registrada em ADR técnico: `usuario.id_usuario` passou de inteiro para UUID (vinculado ao Supabase Auth) e a coluna `senha_hash` não existe fisicamente — a credencial é gerenciada pelo subsistema de autenticação, nunca pela aplicação. Seis tabelas técnicas adicionais (webhook, token de avaliação, conexão Instagram, estado OAuth, exclusão de dados e assinatura de push) oferecem suporte de segurança/idempotência às integrações, sem representar novas entidades de negócio do DER.

---

**COMENTÁRIO DO PROFESSOR:**
"Diagrama de Arquitetura — o professor marcou o atual como ilegível."

**TRECHO SUGERIDO PARA ACRESCENTAR:**
> A arquitetura é dividida em três camadas (apresentação, API/backend, dados) mais integrações externas: Frontend React/TypeScript/Vite consome a API via HTTPS/REST autenticado; o Backend Node.js/Express/TypeScript valida, autoriza e orquestra chamadas a PostgreSQL/Auth/Storage (Supabase) e às APIs oficiais da Meta (WhatsApp Cloud API, Instagram API) e, opcionalmente, à API do Gemini; jobs agendados no banco (`pg_cron`) acionam endpoints internos protegidos do próprio backend para processar publicações e notificações pendentes.

---

**COMENTÁRIO DO PROFESSOR:**
"quais ambientes?"

**TRECHO SUGERIDO PARA ACRESCENTAR:**
> Foram utilizados dois ambientes: desenvolvimento local (variáveis em `.env.local`, backend e frontend rodando localmente) e produção (Vercel, dois projetos separados para backend e frontend). Ambos os ambientes usam o mesmo projeto Supabase (plano gratuito); não há ambiente de staging/homologação separado.

---

**COMENTÁRIO DO PROFESSOR:**
"[trecho sobre chave externa do Gemini] confuso."

**TRECHO SUGERIDO PARA ACRESCENTAR:**
> O Gemini é usado apenas como classificador auxiliar de linguagem natural no questionário do WhatsApp, acionado somente quando uma regra determinística por expressão regular não consegue decidir. Sem a variável de ambiente `GEMINI_API_KEY` configurada, o sistema usa só a regra determinística, sem qualquer impacto no funcionamento do atendimento — a chave foi configurada e validada em produção em 23/09/2026.

---

**COMENTÁRIO DO PROFESSOR:**
"[trecho] deu a entender que RF001 e RF015 foram unificados."

**TRECHO SUGERIDO PARA ACRESCENTAR:** ver texto completo na seção 10 deste documento.

---

## 18. Aprofundamento — Representação do componente WhatsApp nos 6 diagramas oficiais

> Rodada complementar de auditoria (somente leitura, nenhuma correção aplicada), feita a pedido explícito do usuário, abrindo novamente os 6 diagramas extraídos (`FIGURA_30` a `FIGURA_35`) com foco exclusivo em como o componente/mecanismo WhatsApp aparece em cada um, e cruzando com 4 auditorias independentes (frontend, backend/integrações Meta, banco de dados, testes). Nenhum arquivo de código, banco, migration, diagrama ou documento do TFC foi alterado nesta rodada.

### 18.1. Limitação de ferramenta registrada

O ambiente desta sessão não tem `poppler-utils` instalado, portanto o `Read` não consegue renderizar páginas de `docs/tfc-oficial/02_TFC1_BASE_104_PAGINAS.pdf` nem de `03_TFC1_CORRECOES_CONSOLIDADAS.pdf` (erro: `pdftoppm is not installed`), e uma busca textual direta (`Grep`) nesses PDFs não retornou nenhuma ocorrência de "WhatsApp" — indício de que o texto desses PDFs não está disponível como camada de texto pesquisável neste ambiente (prováveis PDFs de imagem/scan ou com texto não extraível pela ferramenta disponível). **Não foi possível citar o número exato da página/trecho literal do TFC1.pdf nesta rodada.** A fonte primária usada para a comparação com o DERS/TFC I é a citação já registrada em `docs/decisions/0002-whatsapp-cloud-api.md` (linhas 10-13), que parafraseia o conteúdo original: *"Os documentos originais do TFC (`TFC1.pdf`) descreviam a coleta estruturada inicial do cliente via automação do WhatsApp Web (navegador)."* Essa citação já estava registrada antes desta rodada e não foi alterada — está marcada aqui como **NÃO CONFIRMADO: página/trecho literal exato do PDF**, já que não pôde ser reaberta nesta sessão.

### 18.2. Como o WhatsApp está representado em cada um dos 6 diagramas (reabertos e reanalisados nesta rodada)

| # | Diagrama | Onde/como o WhatsApp aparece | Nomeia um mecanismo/tecnologia específico? |
|---|---|---|---|
| 1 | Caso de Uso (`FIGURA_30`) | Não aparece o termo "WhatsApp" em nenhum lugar da imagem. O canal está implícito apenas no caso de uso "Registrar Respostas do Cliente — RF004", ligado ao ator Cliente. | **Não** — nenhuma tecnologia nomeada |
| 2 | Sequência Incluir Cliente (`FIGURA_31`) | "WhatsApp" aparece 3 vezes, sempre como **dado de cadastro**: "Informa nome, WhatsApp e Instagram"; "Verifica se o WhatsApp já está cadastrado"; "WhatsApp já cadastrado no sistema". | **Não** — é o campo de telefone do cliente, não um canal de comunicação ativo neste fluxo |
| 3 | Sequência Cancelar Agendamento (`FIGURA_32`) | O termo "WhatsApp" não aparece em nenhum lugar da imagem. | Não se aplica |
| 4 | Diagrama de Classes (`FIGURA_33`) | Atributo `whatsapp: String` nas classes `Designer` e `Cliente`; métodos conceituais `Designer.iniciarAtendimento(): int` e `Cliente.responderChatbot(): boolean`, que representam a ideia de um atendimento/chatbot sem citar qual tecnologia o implementa. | **Não** — representa a regra de negócio (um chatbot existe), não a tecnologia por trás |
| 5 | DER (`FIGURA_34`) | Coluna `whatsapp : varchar` nas entidades `designer` e `cliente`. | **Não** — é só um atributo de dado |
| 6 | Diagrama de Componentes (`FIGURA_35`) | Caixa explícita **"WhatsApp Web — Chatbot e Links"**, dentro do bloco "Sistemas Externos", conectada ao Back-end por uma linha pontilhada rotulada **"Chatbot / Mensagens"**. | **Sim — e é o único dos 6 que nomeia uma tecnologia específica: "WhatsApp Web"** |

**Conclusão da reabertura**: dos 6 diagramas oficiais, **5 referenciam WhatsApp apenas como um dado de domínio (número de telefone) ou um conceito de caso de uso/método (chatbot/atendimento)**, sem amarrar isso a nenhuma tecnologia de transporte — essa representação é neutra e **continua tecnicamente válida** independentemente de o mecanismo por trás ser WhatsApp Web ou WhatsApp Cloud API, porque não faz essa afirmação. **Apenas 1 diagrama — o Diagrama de Componentes (`FIGURA_35`) — nomeia explicitamente "WhatsApp Web" como o mecanismo**, e é esse único ponto que diverge factualmente da arquitetura real implementada.

### 18.3. Comparação com a implementação real (consolidação dos 4 subagentes desta rodada)

**Backend/integrações Meta** (auditoria dedicada, 17 arquivos revisados):
- Host real usado: `https://graph.facebook.com/v21.0/...` (`backend/src/integrations/whatsapp/whatsappClient.ts`) — Graph API oficial da Meta, nunca `web.whatsapp.com`.
- Entrada de mensagem: webhook HTTPS assinado — `X-Hub-Signature-256` (HMAC-SHA256 do corpo bruto com `META_APP_SECRET`, comparação por `timingSafeEqual`) + handshake `hub.verify_token` (`webhookSignature.ts`), aplicado **antes** de processar qualquer payload (`whatsapp.routes.ts`).
- Idempotência: reserva em duas fases (`processando`→`concluido`) por `wamid`, via RPCs `claim_webhook_evento`/`mark_webhook_evento_concluido`; resposta do questionário também deduplicada por `wamid` (`register_resposta_atendimento_e_avancar`).
- Falha externa nunca produz falso sucesso: erros da Meta (ex.: `131047`, janela de 24h fechada) são tratados e tipados, nunca mascarados.
- Segredos (`META_APP_SECRET`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_VERIFY_TOKEN` etc.) são server-only, nunca logados.
- Busca ampla por `whatsapp-web|puppeteer|selenium|qrcode|wppconnect|baileys|venom` no repositório inteiro: **zero ocorrências em código ou em `package.json`** — as únicas menções a esses termos estão em documentação (ADRs, este próprio relatório), sempre no sentido de declarar que a abordagem foi rejeitada/nunca implementada.

**Banco de dados** (todas as 50 migrations lidas, foco na tabela técnica de webhook):
- `whatsapp_webhook_evento.id_evento` é `text PRIMARY KEY`, documentado na própria migration como "dedup de **wamid** (id de mensagem)" — `wamid` é um identificador retornado pela Cloud API em cada mensagem de webhook; não existe equivalente em scraping de WhatsApp Web.
- Mecanismo de duas fases resolve explicitamente o padrão real de **reentrega HTTP de webhook em resposta não-2xx**, documentado como comportamento da Meta — conceito que só existe para um servidor recebendo POSTs assinados, não para uma sessão de navegador.
- Busca ampla por `qrcode|sessão de navegador|puppeteer|whatsapp.?web|selenium|headless` em todas as migrations: **zero ocorrências**.
- Nenhuma coluna de sessão, cookie, QR code ou token de WhatsApp Web em qualquer tabela.

**Frontend** (busca em todo `frontend/src`):
- Nenhuma ocorrência de `wa.me`, `web.whatsapp.com`, `whatsapp.com` ou `api.whatsapp` em nenhum componente — o frontend nunca abre um link/deep-link de WhatsApp Web para o designer.
- Nenhum `iframe` relacionado a WhatsApp (o único `iframe` do projeto é o preview de arte da tela de avaliação, não relacionado).
- Nenhuma string de UI ou comentário de código menciona "WhatsApp Web" — todos os textos visíveis usam apenas "WhatsApp" genérico (ex.: "Atendimento iniciado — primeira pergunta enviada por WhatsApp.", `ClientesPage.tsx`).
- **Achado secundário, fora do escopo estrito da pergunta sobre arquitetura, mas relevante ao componente WhatsApp**: o campo "WhatsApp" do formulário de cliente/designer (`ClienteFormPanel.tsx`, `DesignerFormPanel.tsx`) é um `&lt;input&gt;` de texto livre, sem `type="tel"`, sem máscara e sem validação de formato E.164 no frontend (só `required` + `minLength={8}`). Isso não é uma divergência de diagrama — é uma observação técnica sobre robustez de entrada, registrada para referência caso o capítulo de qualidade/UX do TFC trate desse campo.

**Testes** (3 arquivos de teste dedicados ao WhatsApp lidos integralmente):
- `webhookSignature.test.ts` e `whatsapp.routes.test.ts` provam, com casos concretos, que a rota exige handshake `hub.verify_token` e assinatura HMAC `sha256=` válida, rejeitando ausência/adulteração — mecanismo de webhook oficial, incompatível com scraping/automação de navegador.
- `whatsappClient.test.ts` prova envio via `fetch` com corpos `type:text`/`type:template` e tratamento do erro oficial `131047` da Cloud API.
- Busca ampla por Puppeteer/Selenium/QR code/whatsapp-web.js/Baileys/Venom em todo o projeto: **zero ocorrências** em código, testes ou dependências.
- **Ressalva de rigor registrada pelo subagente**: nenhuma asserção de teste contém literalmente a string `graph.facebook.com` (os testes verificam a forma do path e o comportamento via mock de `fetch`, não o host exato) — essa string só existe no código-fonte (`whatsappClient.ts`), não dentro de um `expect(...)` de teste. Isso é uma nuance de rigor de evidência, não motivo para dúvida sobre a arquitetura real (o código-fonte é inequívoco quanto ao host).
- **Ausência registrada**: não foi localizado, no arquivo `whatsapp.routes.test.ts`, um teste específico de reentrega do mesmo `wamid` na própria rota HTTP (a idempotência está implementada e coberta nas RPCs/`atendimento.service.ts`, mas não foi confirmado um teste de reentrega na camada de rota especificamente) — marcado **NÃO CONFIRMADO neste arquivo**, sem alegar que a idempotência em si não exista (ela existe e está provada em outras camadas, seção 18.3 acima).

### 18.4. O que está incorreto ou desatualizado (resposta direta)

**Apenas um ponto, em um único diagrama**: a caixa **"WhatsApp Web — Chatbot e Links"** no Diagrama de Componentes (`FIGURA_35`) não corresponde à arquitetura real. Nomeia uma tecnologia (WhatsApp Web) que:
- não está presente em nenhuma linha de código do backend ou do frontend;
- não está presente em nenhuma migration/tabela do banco;
- não está coberta nem mencionada em nenhum teste como algo implementado;
- foi explicitamente substituída, de forma documentada e aprovada (ADR 0002), pela WhatsApp Cloud API oficial da Meta.

Os outros 5 diagramas **não precisam de correção neste ponto específico**, porque nenhum deles afirma um mecanismo de transporte — usam "WhatsApp" apenas como atributo de dado (telefone) ou conceito de caso de uso/método, o que continua correto com qualquer um dos dois mecanismos.

### 18.5. Como deveria ficar atualmente (sem aplicar a correção agora)

Proposta de atualização, apenas para registro — **nenhuma alteração foi feita no arquivo de imagem**:

- Rótulo da caixa: de **"WhatsApp Web — Chatbot e Links"** para **"WhatsApp Cloud API — Mensageria oficial (Meta)"** (ou "WhatsApp Cloud API — Chatbot e Links", preservando o restante do texto original e trocando só o termo da tecnologia).
- Rótulo da conexão pontilhada: de **"Chatbot / Mensagens"** para algo como **"REST (Graph API) + Webhook HTTPS assinado (HMAC-SHA256)"**, ou manter "Chatbot / Mensagens" e acrescentar uma nota de rodapé no diagrama citando o mecanismo (REST + webhook assinado), para não sobrecarregar a caixa.
- Nenhuma mudança é necessária nos outros 5 diagramas quanto a este ponto.

### 18.6. Correção aplicada em 2026-10-17 (escopo mínimo, somente FIGURA_35)

A pedido explícito do usuário, foi aplicada **exclusivamente** a correção textual mínima confirmada pela auditoria acima — nenhum outro diagrama, nenhum código, nenhuma migration e nenhum texto do TFC foram tocados.

**O que foi alterado:**
- Arquivo: `docs/tfc-oficial/diagramas-extraidos/FIGURA_35_Diagrama_de_Componentes.png`.
- Único elemento alterado: o texto dentro da caixa de componente em "Sistemas Externos" que antes dizia **"WhatsApp Web / Chatbot e Links"** passou a dizer **"WhatsApp Cloud API / Mensageria oficial da Meta"**.
- Técnica usada: edição de pixels (Python/Pillow) restrita à região exata do texto antigo (coordenadas medidas pixel a pixel: caixa de texto original em x≈960-1022, y≈233-250), preenchida com a cor de fundo idêntica da própria caixa (`RGB 255,253,242`) e redesenhada com a mesma fonte/estilo visual do restante do diagrama (Arial, tamanho 9px, cinza-escuro `RGB 71,71,68`, alinhamento à esquerda no mesmo ponto `x=960` onde o texto original começava). Bordas do componente, ícone UML, caixa "Instagram/Publicação", linhas pontilhadas e todo o restante da imagem permanecem pixel a pixel inalterados.
- **O rótulo da conexão pontilhada ("Chatbot / Mensagens") NÃO foi alterado** — decisão deliberada, registrada aqui: o texto completo sugerido pelo usuário para esse rótulo ("REST (Graph API) + Webhook HTTPS assinado (HMAC-SHA256)", 58 caracteres) não cabe na caixa de rótulo existente (≈99px de largura, hoje ocupados por "Chatbot / Mensagens", 19 caracteres) sem aumentar essa caixa — o que violaria a própria instrução do usuário de "não redesenhar todo o diagrama" e "fazer apenas a correção mínima". Além disso, a auditoria da seção 18.2/18.4 já havia concluído que esse rótulo específico não nomeia nenhuma tecnologia (não diz "WhatsApp Web" nem nada equivalente) — portanto não foi identificado como incorreto, só como um ponto que poderia opcionalmente ganhar mais detalhe técnico. Se o usuário quiser essa alteração mesmo assim, ela exige aumentar a caixa do rótulo (pequeno redesenho local), o que pode ser feito em uma rodada separada e explícita.
- Confirmado via `git status`/`git diff --stat`: **apenas este arquivo PNG foi modificado** nesta rodada (nenhum outro diagrama, código, migration ou documento do TFC).

**Coerência da figura após a troca:** sim — verificada visualmente após a edição (reabertura completa do PNG). A caixa de componente, o ícone UML, as bordas, a caixa "Instagram/Publicação" logo abaixo, as linhas pontilhadas de conexão e os demais blocos do diagrama (WEB/Front-end/Back-end, Banco de Dados/Supabase) permanecem idênticos. O novo texto (duas linhas, 19 e 27 caracteres) coube confortavelmente dentro da caixa original sem tocar as bordas (margem de ~40-65px até a borda direita em ambas as linhas) e sem precisar reduzir o tamanho da fonte em relação ao texto antigo.

**Elementos visuais que ficaram inconsistentes após a troca:** nenhum identificado. Verificação específica:
- Alinhamento/posição vertical das duas linhas: preservado nas mesmas linhas de base do texto original.
- Espaçamento até as bordas do componente: preservado (nenhuma invasão de borda).
- Ícone UML (retângulo com duas abas) à esquerda do texto: intocado.
- Caixa "Instagram / Publicação" (mesmo padrão visual, mesmo tamanho): intocada, permanece consistente como par da caixa corrigida.
- Fonte/cor/tamanho do novo texto: igual ao padrão do restante do diagrama (mesma fonte sans-serif, mesmo tom de cinza).
- Único ponto que permanece como estava, por decisão explícita acima: o rótulo "Chatbot / Mensagens" da linha pontilhada — não é uma inconsistência introduzida pela correção, é simplesmente o rótulo original, preservado por não caber o texto completo sugerido sem redesenho.

### 18.7. Conclusão única consolidada (frontend + backend + banco + testes + documentação)

As quatro auditorias independentes desta rodada (frontend, backend/integrações Meta, banco de dados, testes), mais a documentação já existente (ADR 0002, `docs/GUIA_INTEGRACAO_META_WHATSAPP_INSTAGRAM.md`, `docs/evidencias/CONTROLE_EXECUCAO.md`) e a reabertura visual dos 6 diagramas oficiais, convergem para a mesma conclusão, sem nenhuma divergência entre as fontes: **a implementação real do DesignHub usa exclusivamente a WhatsApp Cloud API oficial da Meta (Graph API + webhook HTTPS assinado), sem nenhum vestígio de automação de WhatsApp Web em código, banco, testes ou dependências; o único artefato documental desatualizado é o rótulo "WhatsApp Web" no Diagrama de Componentes (`FIGURA_35`)** — um ponto isolado, pontual e já esperado (é justamente a mudança registrada no ADR 0002), não uma divergência de arquitetura real. Nenhuma correção foi aplicada nesta rodada, conforme solicitado.

---

## 19. Continuação da auditoria — demais pontos marcados pelo orientador

> Rodada complementar (2026-10-18), somente leitura, nenhuma correção aplicada nesta seção. Objetivo: aprofundar os pontos ainda pendentes com o mesmo rigor aplicado ao componente WhatsApp (seção 18), e registrar uma descoberta de fonte primária que muda o enquadramento de parte da auditoria.

### 19.1. Nova fonte primária lida nesta rodada: `01_Roteiro_Correcoes_Pendentes_TFC_DesignHub.docx`

Nas rodadas anteriores, este arquivo não pôde ser aberto (o `Read` não processa `.docx` diretamente). Nesta rodada, o texto foi extraído com sucesso via `unzip` do XML interno (`word/document.xml`, que é texto puro dentro do contêiner `.docx`) — técnica somente leitura, sem qualquer alteração do arquivo original. Achados:

1. **Este roteiro é de uma rodada anterior (TFC I, 27/07/2026), não da rodada atual.** A primeira frase do documento é explícita: *"IMPORTANTE: os diagramas de Casos de Uso, Classes e DER já foram revisados. Neste roteiro, a dupla deve corrigir somente o texto do TFC, os protótipos, a LGPD, a ficha catalográfica e a apresentação."* Ou seja, os comentários mais recentes do orientador descritos no início desta auditoria (diagramas "ilegíveis" na entrega atual, arquitetura WhatsApp, confusão RF001/RF015, Gemini, ambientes) são de uma **rodada posterior e distinta**, não registrada neste `.docx` — não deve ser confundida com ele.

2. **A matriz de dependências RF001-RF016 ditada neste roteiro (página 27-31 do TFC1.pdf) bate 100% com a matriz já implementada em `CLAUDE.md` (seção 6) e com a implementação real.** Conferência linha a linha: RF001→RF002, RF002→nenhuma, RF003→RF002, RF004→RF003, RF005→RF003+RF004, RF006→RF005, RF007→RF005, RF008→RF005+RF007, RF009→RF008, RF010→RF009, RF011→RF004+RF005+RF007+RF009+RF010+RF012+RF014, RF012→RF009, RF013→RF012, RF014→RF012, RF015→RF002, RF016→RF015+RF005. **Nenhuma divergência.** O próprio roteiro já instruía, com as mesmas palavras usadas no `CLAUDE.md`: *"Não transformar essas dependências em novas setas no Diagrama de Casos de Uso."*

3. **Confirma a nomenclatura "Autenticar Usuário" (não "Autenticar Designer") para RF002** — já implementada e documentada (seção 3 desta auditoria, CLAUDE.md seção 5). Esta era uma correção textual do TFC, não de código; não há "Autenticar Designer" em nenhum lugar do código ou da UI atual (confirmado por buscas já feitas nas rodadas anteriores).

4. **Texto exato exigido para o RNF007** (acrescentar): *"As senhas dos usuários não deverão ser armazenadas em texto puro, sendo mantidas por meio de hash. O e-mail deverá ser único para cada usuário, evitando a criação de contas duplicadas. O acesso às funcionalidades deverá respeitar o perfil e as permissões do usuário autenticado."* — implementação real confirmada: Supabase Auth gerencia a senha (nunca texto puro, ADR 0001), `usuario.email` é `citext unique` (banco), autorização por perfil no backend (`requireProfile`). **Satisfeito.**

5. **Texto exato exigido para o RNF010** (LGPD, a incluir após o RNF009): praticamente idêntico ao já registrado em `CLAUDE.md` seção 8 e em `docs/seguranca/BASELINE_SEGURANCA.md`. **Satisfeito.**

6. **Itens deste roteiro que são exclusivamente sobre o texto/formatação do documento Word do TFC** (numeração contínua de protótipos "Figura N – ...", ficha catalográfica, apresentação com os dois autores falando) — **fora do escopo de uma auditoria de código/implementação**: não há, neste repositório, o arquivo editável do TFC II em si (só os PDFs/docx do TFC I e os diagramas). NÃO CONFIRMADO se essas correções textuais já foram aplicadas ao documento final do TFC II — isso só pode ser verificado abrindo o arquivo real do TFC II (Word/Google Docs), que não está neste repositório.

### 19.2. Diagrama de Arquitetura / Diagrama de Implantação — achado crítico: arquivo ausente do repositório

O `CLAUDE.md` (seção 2, item 4) cita *"Diagramas de Componentes e Implantação como base arquitetural"* — ou seja, são **dois diagramas oficiais distintos**: Componentes (que existe, `FIGURA_35`) e **Implantação** (Deployment).

`docs/tfc-oficial/INDICE_PACOTE_ORIGINAL.md` confirma que o pacote `.rar` original enviado pela dupla continha, sim, um Diagrama de Implantação próprio:
```
Diagramas tfc01/Diagramas Ofc/Diagrama de implatação/Diagrama de Implantação_DesignHub.drawio
Diagramas tfc01/Diagramas Ofc/Diagrama de implatação/Diagrama de Implantação_DesignHub.drawio.png
```
Mas o próprio índice também declara: *"Os seis diagramas incorporados no documento consolidado foram extraídos para `diagramas-extraidos/`"* — **seis**, não sete. O Diagrama de Implantação não está entre os seis extraídos (Casos de Uso, 2 Sequências, Classes, DER, Componentes).

**Busca exaustiva nesta rodada** (`find`/`glob` por `*implant*`, `*.drawio*`, `*.rar` em todo o repositório, fora `node_modules`): **nenhum resultado**. Nem o `.drawio` nem o `.png` do Diagrama de Implantação existem em qualquer lugar deste projeto, e o `.rar` original também não está presente.

**Conclusão**: o "Diagrama de Arquitetura" que o professor marcou como ilegível muito provavelmente **é** (ou deveria ser) o Diagrama de Implantação — e ele está **fisicamente ausente** deste repositório, não apenas malrenderizado. O texto do roteiro em texto (seção 9 desta auditoria) foi uma reconstrução aproximada a partir do dossiê técnico e do código real, **não uma transcrição de um diagrama oficial existente** — isso deve ficar explícito no capítulo do TFC: não é um caso de "melhorar a legibilidade" de uma imagem existente, é um caso de **localizar o arquivo original** (`Diagrama de Implantação_DesignHub.drawio`/`.png`, citado no índice do pacote original) ou **recriá-lo do zero** a partir da arquitetura real documentada na seção 9 deste relatório, já que o conteúdo técnico está integralmente levantado — falta apenas o artefato visual.

### 19.3. Diagrama de Sequência — originais x extraídos: sem divergência de conteúdo

Reabertos nesta rodada os dois arquivos em `docs/tfc-oficial/diagramas-sequencia-originais/` (`Diagrama de Sequência - Incluir Cliente..png` e `Diagrama de Sequência - Cancelar Agendamento.jpeg`) e comparados pixel a pixel/texto com as versões "corrigidas" em `diagramas-extraidos/` (`FIGURA_31`/`FIGURA_32`). **Conteúdo idêntico** em ambos os casos (mesmas mensagens, mesmos participantes, mesmos blocos `alt`) — a única diferença é estilo visual de renderização (cores dos atores na versão extraída). Não há nenhuma divergência de fluxo entre a versão "original" e a "corrigida" desses dois diagramas de sequência especificamente.

### 19.4. Diagrama de Casos de Uso — aprofundamento: ator do diagrama x perfil real da rota

Cruzamento RF a RF entre o ator desenhado na `FIGURA_30` e o middleware de autorização real (`requireAuth`/`requireProfile`/`requireInternalJobSecret`) de cada rota em `backend/src/routes/*.ts`. **11 dos 16 RFs confirmam exatamente** o ator do diagrama, sem nenhuma divergência (RF001, RF002, RF003, RF005, RF007, RF008, RF009, RF010, RF012, RF015, RF016). **5 RFs têm uma nuance técnica real** que vale registrar — nenhuma é um erro de implementação, mas o diagrama simplifica uma mecânica mais granular que existe no código:

| RF | Ator no diagrama | O que a implementação real mostra | Natureza da nuance |
|---|---|---|---|
| RF004 | Cliente | Designer **inicia** o atendimento (`POST /api/clientes/:id/atendimentos`, autenticado); o **registro efetivo** de cada pergunta/resposta ocorre dentro do processamento do webhook **público** `POST /api/webhooks/whatsapp` — chamado pela Meta, sem sessão de usuário | O "Cliente" do diagrama nunca é uma sessão autenticada; tecnicamente é sempre Meta→backend via webhook assinado |
| RF006 | Serviço Automático/Rotina do Sistema | A função `sync_designer_bloqueio` **não roda por job/cron dedicado** — é recalculada como efeito colateral dentro de chamadas autenticadas do próprio Designer (`GET /api/auth/me`, `POST /clientes/:id/atendimentos`, `POST /solicitacoes/:id/versoes`) | É automático no sentido de que o Designer não aciona manualmente a regra, mas tecnicamente sempre roda dentro de uma requisição HTTP do Designer, nunca via `INTERNAL_JOB_SECRET` |
| RF011 | Serviço Automático/Rotina do Sistema | Não existe uma função/rota "atualizar status" única — as transições são efeito colateral distribuído em cada RPC específica (upload, avaliação, agendamento, publicação). `backend/src/lib/statusTransitions.ts` é só documentação/teste, explicitamente "não substitui a aplicação real da regra" em runtime | O ator real de cada transição é quem disparou a ação de origem (Designer, Cliente por token, ou job interno) — não uma rotina única e separada |
| RF013 | Designer | Confirmado para o Designer (`DELETE /api/solicitacoes/:id/agendamento`); **mas o Cliente também pode cancelar** o próprio agendamento via link/token, sem login (`POST /api/avaliacao/:token/cancelar-agendamento`, mesma regra de 3h reaproveitada) | Ator adicional (Cliente) não representado no diagrama oficial — já tratado como funcionalidade aditiva documentada (seção 5 desta auditoria) |
| RF014 | Designer | O caminho **manual** é de fato do Designer (`POST /solicitacoes/:id/publicacao-manual`); o caminho **automático** real (`processarAgendamentosVencidos`) roda via `POST /api/internal/publicacoes/processar`, protegido só por `INTERNAL_JOB_SECRET`, **sem usuário autenticado** | O diagrama cobre apenas a metade manual do RF14; a publicação automática (o caminho preferencial quando há integração) não tem ator "Designer" — é consistente com "Serviço Automático", não com o que está desenhado |

**Conclusão desta seção**: o diagrama de casos de uso está correto para a maioria dos RFs e nenhuma rota contraria o perfil exigido no backend (não há IDOR/escalada de privilégio entre o que o diagrama promete e o que o código aplica). As 5 nuances acima são todas do tipo "o diagrama simplifica um mecanismo mais granular/dual", não "o código faz algo diferente do que deveria". Já era esperado dado que RF006/RF011/RF014 descrevem explicitamente processos parcialmente automáticos (RN11/RN12/RN41) — a simplificação do diagrama em atribuir um único ator por RF é uma limitação normal de diagramas UML de caso de uso (um RF pode ter mais de um "gatilho" técnico sem deixar de ser um único requisito funcional).

### 19.5. Diagrama de Classes — aprofundamento: método a método

Auditoria método-a-método dos ~20 métodos desenhados na `FIGURA_33` contra a função/rota real do backend que implementa a mesma regra de negócio.

| Classe.método (diagrama) | Função real | Arquivo |
|---|---|---|
| `Usuario.autenticar()` | SEM CORRESPONDÊNCIA DIRETA — delegado ao Supabase Auth client-side (`signInWithPassword`); backend só verifica a sessão já emitida | `backend/src/middleware/auth.ts` (`requireAuth`, `attachProfile`) |
| `Usuario.atualizarPerfil()` | Não existe autoatualização; existe atualização administrativa (`updateDesigner`) e troca de senha (`changeDesignerPassword`) | `backend/src/services/designer.service.ts` |
| `Designer.cadastrarCliente()` | `createCliente` | `backend/src/services/cliente.service.ts` |
| `Designer.iniciarAtendimento()` | `iniciarAtendimento` | `backend/src/services/atendimento.service.ts` |
| `Designer.enviarVersao()` | `uploadVersaoArte` (+ RPC `register_versao_arte`) | `backend/src/services/versaoArte.service.ts` |
| `Administrador.gerenciarDesigner()` | Conjunto de funções: `createDesigner`, `updateDesigner`, `changeDesignerStatus`, `removeDesigner`, `changeDesignerPassword`, `listPendenciasDesigner` | `backend/src/services/designer.service.ts` |
| `Administrador.reatribuirSolicitacao()` | `reassignSolicitacao` (+ RPC `reassign_solicitacao`) | `backend/src/services/designer.service.ts` |
| `Cliente.responderChatbot()` | Pipeline do webhook: `processInboundWebhook` → `processInboundMessage` → `handleInboundMessage` | `backend/src/services/atendimento.service.ts` |
| `Cliente.avaliarArte()` | `submitAvaliacaoDecisao` com `decisao:'Aprovado'` | `backend/src/services/avaliacao.service.ts` |
| `Cliente.solicitarAjuste()` | **Mesma função** `submitAvaliacaoDecisao`, com `decisao:'Ajustes'` | `backend/src/services/avaliacao.service.ts` |
| `SolicitacaoArte.criar()` | `completeAtendimentoAndCreateSolicitacao` | `backend/src/repositories/atendimento.repository.ts` |
| `SolicitacaoArte.atualizarStatus()` | SEM função genérica — autoridade distribuída em RPCs específicas por evento; `statusTransitions.ts` é só documentação/teste, não aplica a regra em runtime | várias RPCs `SECURITY DEFINER` |
| `SolicitacaoArte.encerrar()` | `cancelSolicitacao` (designer) ou `decisao:'Cancelado'` em `submitAvaliacaoDecisao` (cliente) | `backend/src/services/solicitacao.service.ts` / `avaliacao.service.ts` |
| `AgendamentoPublicacao.agendar()` | `createAgendamento` | `backend/src/services/agendamento.service.ts` |
| `AgendamentoPublicacao.cancelar()` | `cancelAgendamento` (designer) / `cancelarAgendamentoCliente` (cliente, via token) | `backend/src/services/agendamento.service.ts` / `avaliacao.service.ts` |
| `Publicacao.registrar()` | `registerPublicacaoSucesso` (automático) ou `registrarPublicacaoManual` (manual) | `backend/src/services/publicacao.service.ts` |
| `Atendimento.iniciar()` | `createAtendimento` | `backend/src/services/atendimento.service.ts` |
| `Atendimento.encerrar()` | 3 caminhos: conclusão normal, expiração RN05 (`processarAtendimentosExpirados`), cancelamento explícito (`markAtendimentoCancelado`) | `backend/src/services/atendimento.service.ts` |
| `RespostaCliente.registrar()` | `registerRespostaEAvancar` | `backend/src/repositories/atendimento.repository.ts` |
| `HistoricoSolicitacao.registrarEvento()` | SEM função TS dedicada — a gravação ocorre dentro de cada RPC, na mesma transação da mudança de status (RN48) | RPCs `SECURITY DEFINER` diversas |
| `VersaoArte.registrar()` | `registerVersaoArte` (repository) | `backend/src/repositories/versaoArte.repository.ts` |
| `VersaoArte.baixar()` | `getVersaoArteDownloadUrl` (URL assinada temporária) | `backend/src/services/versaoArte.service.ts` |
| `Avaliacao.aprovar()`/`.solicitarAjuste()`/`.cancelar()` | **Unificados em uma única função parametrizada** `submitAvaliacaoDecisao` + rota única `POST /api/avaliacao/:token` | `backend/src/services/avaliacao.service.ts` |
| `Ajuste.registrar()` | Efeito colateral da mesma RPC `submit_avaliacao` quando `decisao:'Ajustes'` | `backend/src/services/avaliacao.service.ts` |

**Padrão geral observado**: a maior parte dos métodos tem correspondência 1:1 clara. Os únicos padrões de divergência estrutural são (a) métodos de granularidade fina no diagrama (`aprovar`/`solicitarAjuste`/`cancelar`) implementados como **uma única função parametrizada** no código real — simplificação de implementação, não perda de regra de negócio; e (b) métodos "guarda-chuva" do diagrama (`atualizarStatus`, `registrarEvento`, `gerenciarDesigner`) que no código real são **conjuntos de funções específicas por evento**, por design (cada transição tem sua própria RPC atômica `SECURITY DEFINER`, mais seguro e testável do que um método genérico de transição livre).

**Caminho inverso — regras de negócio reais sem nenhum método equivalente no diagrama de classes** (não é uma lacuna do código, é esperado: são mecanismos de infraestrutura/segurança que um diagrama de classes de domínio não costuma representar):
- Idempotência de webhook WhatsApp e de publicação/notificação (`registerWebhookEventOnce`, `claimAgendamentoParaPublicacao`, `claimNotificacaoPublicacao`).
- Bloqueio de designer por atraso (`syncDesignerBloqueio`).
- Geração/hash de token opaco do link de avaliação e seus 4 estados (`valid/used/expired/invalid`).
- Verificação de assinatura HMAC do webhook Meta; validação de assinatura real de arquivo (magic bytes) em vez de Content-Type.
- Cifragem/decifragem do token OAuth do Instagram por cliente.
- Compensação transacional (rollback manual) em `createDesigner`, `uploadVersaoArte`, `submitAvaliacaoDecisao` quando uma etapa posterior falha.
- Rate limiting dedicado por rota sensível.
- Estratégias de inativação de designer com pendências (`cancelar_pendentes`/`reatribuir_pendentes`/`inativar_mesmo_assim`) — mais rica que o `reatribuirSolicitacao()` isolado do diagrama.
- Web Push ao designer — canal de notificação inteiramente ausente do diagrama de classes.
- Autenticação de serviço (job/cron) por segredo compartilhado, distinta de autenticação humana.
- Normalização de número de telefone do WhatsApp recebido contra o cliente cadastrado.

**Observação registrada pelo subagente, já esclarecida por fonte própria**: o atendimento via WhatsApp usa um classificador de linguagem natural (Gemini) para decidir pertinência/confirmação de respostas — funcionalidade real sem método correspondente no diagrama de classes oficial. O subagente, sem contexto da sessão anterior, sinalizou isso como possível tensão com a restrição de "IA generativa" da seção 3.2 do CLAUDE.md. **Já está resolvido e documentado**: a seção 13 desta auditoria e o `docs/decisions/0006-ia-classificadora-confirmacao-whatsapp.md` registram que essa funcionalidade foi **explicitamente autorizada pelo usuário** como exceção pontual e delimitada (classificador auxiliar, nunca executor de ação de negócio, fail-closed sem a chave) — não é um achado novo, é a mesma funcionalidade já auditada e com autorização registrada.

### 19.6. Conclusão da rodada — status de todos os pontos marcados pelo orientador

| Ponto marcado | Status nesta auditoria |
|---|---|
| Arquitetura WhatsApp (anterior x atual) | Auditado em profundidade (seções 1 e 18) — WhatsApp Web→Cloud API confirmado em todas as camadas; 1 diagrama corrigido a pedido do usuário |
| Diagrama de Casos de Uso ilegível | Reaberto, conteúdo íntegro na versão extraída (`FIGURA_30`); aprofundado ator-a-ator contra rotas reais (seção 19.4) — sem erro de autorização, só simplificação normal de UML em 5 RFs |
| Diagrama de Classes ilegível/condiz | Reaberto; auditado método a método contra o backend real (seção 19.5) — correspondência ampla confirmada, divergências são de granularidade (métodos agrupados), não de regra de negócio ausente |
| DER ilegível/condiz | Reaberto; todas as 50 migrations lidas e cruzadas entidade a entidade (seção 7) — 13/13 entidades do DER existem fisicamente, única adaptação é a já documentada (ADR 0001, UUID/Supabase Auth) |
| Diagrama de Componentes ilegível | Reaberto; único ponto de fato desatualizado localizado e corrigido a pedido do usuário (WhatsApp Web → WhatsApp Cloud API, seções 8 e 18) |
| Diagrama de Arquitetura ilegível | **Achado novo nesta rodada (seção 19.2): o arquivo-fonte real (Diagrama de Implantação) está ausente deste repositório** — não é um problema de legibilidade de imagem, é ausência física do artefato. Reconstrução textual disponível na seção 9, mas não substitui o diagrama visual oficial |
| RF001 x RF015 confusão | Resolvido com evidência de código (seção 10) — requisitos continuam distintos e rastreados; texto de substituição de 3-6 linhas já redigido |
| Termos técnicos pedidos pelo professor | Todos os 20 termos explicados com aplicação real ao DesignHub (seção 11) |
| "Quais ambientes?" | Resolvido com evidência (seção 12) — dev local + produção Vercel, Supabase único, sem staging |
| Gemini confuso | Resolvido com evidência (seção 13) — escopo, fail-closed, status atual (ativo em produção desde 23/09/2026) |
| Números de teste (794 x 800) | Confirmado por execução real nesta sessão (seção 15): atual é 800 (650+150), não mais 794 |
| Nova fonte primária (Roteiro de Correções) | Lida integralmente nesta rodada (seção 19.1) — é de uma rodada anterior (TFC I), matriz de dependências já 100% implementada, sem pendência de código associada |

**Todos os pontos originalmente listados pelo usuário foram auditados.** O único item que não pôde ser fechado com uma resposta completa é o Diagrama de Arquitetura/Implantação (seção 19.2), por ausência física do arquivo-fonte no repositório — isso não é uma limitação da auditoria, é um fato constatado que precisa de decisão humana (localizar o `.rar`/`.drawio` original ou recriar o diagrama a partir do conteúdo técnico já levantado na seção 9).

---

## Observação final

Esta auditoria é somente leitura: nenhum arquivo de código, migration ou documento do TFC foi alterado. A única exceção é a correção pontual e explicitamente autorizada pelo usuário na `FIGURA_35` (seção 18.6), aplicada e revertível via Git. Os números de teste (800 = 650 backend + 150 frontend, 0 falhas) foram confirmados por execução real dos comandos nesta sessão, não apenas por leitura de documentação anterior. Divergências foram registradas explicitamente (seções 16, 18 e 19) e não foram resolvidas silenciosamente, conforme instruído.
