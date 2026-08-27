# ADR 0005 — Autorização do Instagram passa a ser por Cliente (correção de escopo compartilhado)

- Status: aceita e implementada
- Data: 2026-08-26
- RF/RN/RNF relacionados: RF014, RN29, RN32-RN35, seção 12.1/12.5 do
  `CLAUDE.md`
- Supersede parcialmente o ADR 0003 (mecanismo de credencial), sem alterar
  RF014/fluxo automático x manual documentado ali.

## Contexto

A implementação original de RF014 (ADR 0003) usava uma única credencial
global (`INSTAGRAM_ACCESS_TOKEN`/`INSTAGRAM_ACCOUNT_ID`, conta de teste
`designhub_26`) para decidir e executar a publicação automática de **qualquer**
solicitação aprovada+agendada, independentemente de qual Cliente era o dono
da solicitação (`publicacao.service.ts`, `processarUmAgendamento`:
`elegivel = instagramConfigStatus.hasPublishingClient && formato elegível`).

Isso é uma falha real de autorização por objeto (seção 12.1/12.9, OWASP API
Security — "Broken Object Level Authorization" aplicado a uma integração
externa): a arte aprovada de **qualquer** cliente seria publicada na mesma
conta Instagram configurada globalmente, nunca na conta do cliente
correspondente. RF014/RN29 exigem que a publicação automática dependa de
"acesso à conta Instagram do Cliente" daquela solicitação especificamente —
não de uma credencial genérica do sistema.

## Decisão

1. Nova tabela `cliente_instagram_conexao` (migration
   `20260826120000_cliente_instagram_conexao.sql`) guarda, por
   `id_cliente`, o token de acesso e o ID da conta Instagram autorizados —
   nunca compartilhados entre clientes. RLS habilitada sem policies para
   `anon`/`authenticated` (mesmo padrão de `whatsapp_webhook_evento`): só o
   backend (service role) lê/escreve; o token nunca é exposto ao frontend.
2. Autorização obtida via **OAuth oficial da Meta** (produto "Instagram API
   with Instagram Login", mesmo produto já usado pelo ADR 0003):
   - Designer, na tela de Clientes, aciona "Conectar Instagram" para um
     cliente específico → backend gera um token opaco de estado (mesmo
     padrão de `avaliacao_link_token`/`lib/tokens.ts`, hash SHA-256
     persistido em `instagram_oauth_state`, vinculado a
     `id_cliente`+`id_designer`+expiração de 10 min) e devolve a URL de
     autorização do Instagram.
   - O dono da conta Instagram (o Cliente, ou quem administra a conta em
     nome dele) aprova o acesso na tela oficial da Meta.
   - A Meta redireciona para `GET /api/instagram/oauth/callback` (única
     rota pública deste mecanismo — comparável à rota pública de avaliação
     do RF009), que valida o estado, troca o `code` por um token de curta
     duração e depois por um token de longa duração (~60 dias, endpoint
     oficial `graph.instagram.com/access_token?grant_type=ig_exchange_token`),
     e grava a conexão vinculada exclusivamente ao `id_cliente` do estado
     validado — nunca a um ID informado livremente na URL.
3. `publishImage` (`instagramClient.ts`) deixou de ler
   `INSTAGRAM_ACCESS_TOKEN`/`INSTAGRAM_ACCOUNT_ID` globais — passa a
   receber a credencial (token + account id) por chamada, resolvida a
   partir da conexão do Cliente da solicitação sendo processada.
4. `processarUmAgendamento` (job RF014) passa a resolver `id_cliente` a
   partir da solicitação e só considera a publicação automática elegível
   quando **aquele cliente** tem conexão válida e não expirada. Sem
   conexão (ou expirada): cai no mesmo caminho já existente de "pendente
   para publicação manual" — nunca tenta outra conta, nunca marca como
   falha inesperada, nunca marca como Publicado.
5. Endpoints novos, todos designer-only + ownership do cliente (mesmo
   padrão de `cliente.routes.ts`):
   - `POST /api/clientes/:id/instagram/authorize-url`
   - `GET /api/clientes/:id/instagram/status` (conectado/quando — nunca o
     token)
   - `DELETE /api/clientes/:id/instagram/conexao`
6. `INSTAGRAM_ACCESS_TOKEN`/`INSTAGRAM_ACCOUNT_ID` (credencial global) e
   `instagramConfigStatus.hasPublishingClient` foram removidos — deixaram
   de ter uso depois da migração para credencial por cliente. Novas
   variáveis: `INSTAGRAM_APP_ID`/`INSTAGRAM_APP_SECRET` (já presentes no
   `.env.local`, usadas para o handshake OAuth do app, não para publicar
   diretamente) e `PUBLIC_BACKEND_URL` (redirect URI do OAuth).

## Consequências

- Nenhum RF/RN/RNF, ator, estado ou fluxo documentado foi alterado — RF014
  continua "publicação automática quando há acesso; manual quando não há".
  A mudança é só **como** o sistema decide/obtém esse acesso, corrigindo
  uma falha de autorização entre clientes.
- A conta de teste `designhub_26` (validada no ADR 0003) precisa passar
  pelo mesmo fluxo de conexão (um clique humano em "Conectar Instagram" na
  tela de Clientes) para voltar a publicar automaticamente — o token global
  antigo não é reaproveitado automaticamente. Até isso ser feito, aquela
  solicitação cai no caminho manual (comportamento correto, não um bug).
- Teste end-to-end real do handshake OAuth completo (redirecionamento real
  para instagram.com + aprovação humana) não pode ser exercitado nesta
  sessão automatizada — depende de um clique humano num navegador real.
  Registrado como `BLOCKED_EXTERNAL`. O mecanismo foi validado por testes
  unitários/integração com mocks da Graph API (troca de código, troca para
  token de longa duração, persistência da conexão, decisão automático x
  manual).

## Alternativas rejeitadas

- Manter uma única credencial global e apenas comparar `cliente.instagram`
  (texto/@handle) contra o `INSTAGRAM_ACCOUNT_ID` configurado: rejeitado —
  não prova posse/autorização real da conta, só coincidência de texto
  digitado pelo designer; não atende "acesso à conta Instagram do Cliente"
  de forma verificável tecnicamente.
- Pedir usuário/senha do Instagram do cliente e automatizar login via
  navegador: rejeitado pela seção 2.1 (proibição de automação não oficial).
