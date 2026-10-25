# Guia completo — Como o DesignHub integrou a WhatsApp Cloud API e a Instagram API oficiais da Meta

> **Objetivo deste documento:** registrar, de forma didática e replicável, todos os passos reais seguidos para configurar e usar as APIs oficiais da Meta (WhatsApp Cloud API e Instagram API) neste projeto — linguagens usadas, formatos de mensagem, templates, custos e armadilhas encontradas — para que outros estudantes de TFC/projetos acadêmicos possam seguir o mesmo caminho sem repetir os mesmos erros.
>
> Este guia é **histórico/educacional**. Ele não é uma fonte de requisitos do TFC (essa é o `CLAUDE.md` da raiz) nem substitui os ADRs técnicos (`docs/decisions/0002-whatsapp-cloud-api.md`, `0003-instagram-oficial-fallback-manual.md`, `0005-instagram-autorizacao-por-cliente.md`, `docs/decisions/meta-whatsapp-templates-business-initiated.md`), que continuam sendo a referência formal das decisões arquiteturais.
>
> **Nenhum valor real de token, segredo ou credencial aparece neste documento** — apenas nomes de variáveis de ambiente, conforme exigido pelo `CLAUDE.md` (seção 8 e 3.6).

---

## 1. Visão geral do que foi integrado

| Integração | Produto Meta usado | Para quê serve no DesignHub | Custo |
|---|---|---|---|
| WhatsApp Cloud API | "WhatsApp" (Meta for Developers) | RF004 — coleta estruturada inicial do cliente; avisos de publicação/cancelamento | Gratuito na maior parte; ~R$0,04–0,05/mensagem só no template de aviso de publicação fora da janela de 24h |
| Instagram API | "Instagram API with Instagram Login" | RF014 — publicação automática da arte aprovada no Instagram do cliente | Gratuito |

Ambas são **APIs oficiais da Meta** — nenhuma automação de navegador (Selenium/Puppeteer/WhatsApp Web) foi usada, conforme decisão congelada no `CLAUDE.md` (seção 2.1).

---

## 2. Pré-requisitos antes de começar

1. Uma conta Meta (Facebook) pessoal que será dona do App.
2. Acesso a [developers.facebook.com](https://developers.facebook.com) para criar o App ("Meta for Developers").
3. Um **Business Manager** da Meta (criado automaticamente ao adicionar o produto WhatsApp, se ainda não existir).
4. Para o Instagram: uma conta Instagram **Profissional** (Criador ou Empresa) de teste, controlada pelos próprios autores do projeto — no DesignHub foi usada uma conta de teste chamada `designhub_26`.
5. Um número de telefone disponível para o WhatsApp de teste (a Meta também oferece um número de teste gratuito embutido no App, sem precisar de número próprio, com limite de poucos destinatários de teste cadastrados manualmente).
6. Backend com uma URL HTTPS pública (necessária para o webhook do WhatsApp e para o redirect OAuth do Instagram) — no DesignHub isso veio do deploy gratuito na Vercel.

> Observação importante: o passo a passo literal de cliques dentro do painel da Meta (criar App → Adicionar Produto → etc.) foi comunicado verbalmente durante o desenvolvimento e **não ficou gravado em texto no repositório**. O que está documentado e é 100% verificável são as *consequências técnicas* desses cliques (as variáveis de ambiente geradas, os endpoints usados, os erros encontrados). As seções abaixo reconstroem o passo a passo prático a partir disso.

---

## 3. Passo a passo — WhatsApp Cloud API

### 3.1. Criar o App e adicionar o produto WhatsApp

1. Em [developers.facebook.com/apps](https://developers.facebook.com/apps), criar um novo App do tipo "Business".
2. No painel do App, adicionar o produto **WhatsApp**. A Meta cria automaticamente:
   - um **número de teste gratuito** (com poucos destinatários de teste permitidos, cadastrados manualmente por número de telefone verificado);
   - um **WhatsApp Business Account (WABA)** vinculado ao App.
3. Anotar os seguintes valores (nunca commitá-los — vão para `.env.local`):
   - `META_APP_ID` e `META_APP_SECRET` (painel do App → Configurações básicas);
   - `WHATSAPP_PHONE_NUMBER_ID` (painel do produto WhatsApp → número de teste);
   - `WHATSAPP_BUSINESS_ACCOUNT_ID` (o WABA);
   - `WHATSAPP_ACCESS_TOKEN` (token temporário gerado no painel para testes; em produção real seria necessário um token de sistema/longa duração — o DesignHub usou o token padrão do painel de desenvolvimento, suficiente para o escopo do TFC).

### 3.2. Configurar o webhook

O webhook é a única rota do DesignHub sem autenticação JWT — ela é protegida por outro mecanismo, descrito abaixo.

1. Escolher um `WHATSAPP_VERIFY_TOKEN` qualquer (uma string aleatória própria, não fornecida pela Meta).
2. No painel do produto WhatsApp → Configuration → Webhook, informar:
   - **Callback URL**: `https://<seu-backend>/api/webhooks/whatsapp`;
   - **Verify token**: o mesmo valor de `WHATSAPP_VERIFY_TOKEN` configurado no backend.
3. A Meta faz uma chamada `GET` para essa URL com `hub.mode=subscribe`, `hub.verify_token=<valor>` e `hub.challenge=<texto aleatório>`. O backend deve responder **exatamente** o valor de `hub.challenge` em texto puro, só se o `verify_token` bater.
4. **Armadilha real encontrada no projeto**: configurar o webhook pela interface visual do painel *não* é suficiente sozinho — é preciso também **inscrever o App explicitamente** nos eventos do WABA. Isso foi descoberto quando mensagens reais do WhatsApp não chegavam ao backend mesmo com o handshake de verificação funcionando. A correção foi feita via chamada direta à Graph API (não há botão equivalente visível no painel para isso):
   ```
   POST https://graph.facebook.com/v21.0/{WABA_ID}/subscribed_apps
   POST https://graph.facebook.com/v21.0/{APP_ID}/subscriptions
     body: callback_url, verify_token, fields=messages
   ```
   Isso explicitamente "liga" o App para receber eventos `messages` daquele WABA.

### 3.3. Formato técnico (payloads reais)

- **Versão da Graph API usada:** `v21.0`.
- **Enviar mensagem de texto** (só dentro da janela de 24h aberta pelo último contato do cliente):
  ```
  POST https://graph.facebook.com/v21.0/{WHATSAPP_PHONE_NUMBER_ID}/messages
  {
    "messaging_product": "whatsapp",
    "to": "<numero_E164>",
    "type": "text",
    "text": { "body": "..." }
  }
  ```
- **Enviar mensagem de template** (fora da janela de 24h — ver seção 4):
  ```
  {
    "messaging_product": "whatsapp",
    "to": "<numero_E164>",
    "type": "template",
    "template": {
      "name": "<nome_aprovado>",
      "language": { "code": "pt_BR" },
      "components": [{ "type": "body", "parameters": [{ "type": "text", "text": "..." }] }]
    }
  }
  ```
- **Download de mídia enviada pelo cliente** (referências/anexos, RF004/RN08) exige dois passos oficiais:
  1. `GET /{media_id}` → retorna uma URL de curta duração;
  2. `GET` nessa URL com o mesmo Bearer token → baixa o arquivo.
  O backend valida que essa URL pertence de fato a domínios da Meta (`.fbsbx.com`, `.facebook.com`, `.cdninstagram.com`) antes de baixar, para evitar SSRF, e limita o tamanho a 15 MB.
- **Validação de assinatura do webhook** (toda requisição `POST` recebida):
  - Header `X-Hub-Signature-256: sha256=<hex>`.
  - Calcula-se HMAC-SHA256 do **corpo bruto** da requisição usando `META_APP_SECRET` como chave, e compara-se com comparação de tempo constante (`timingSafeEqual`) — nunca com `===` simples, para evitar timing attack.
  - Isso exige capturar o corpo bruto (raw body) **antes** do `express.json()` fazer o parse, porque depois de parseado o byte a byte original se perde.
- **Idempotência:** cada mensagem recebida da Meta tem um `wamid` único. O backend grava um registro de "evento de webhook" com esse ID antes de processar e usa um claim atômico no banco para garantir que, se a Meta reenviar o mesmo evento (comum em webhooks), ele não seja processado duas vezes.
- **Correção de número de celular brasileiro:** a Meta às vezes envia o `wa_id` do cliente sem o 9º dígito do celular (ex.: 12 dígitos em vez de 13). O backend normaliza para comparar os dois formatos antes de vincular a mensagem ao cliente certo.

### 3.4. Erro específico a conhecer: `131047` (re-engagement)

Fora da janela de 24h desde a última mensagem do cliente, a Cloud API rejeita mensagens de texto livre com o código de erro `131047`. O backend detecta esse código especificamente e, nesse caso, tenta reenviar automaticamente como mensagem de **template aprovado** em vez de simplesmente falhar — é por isso que templates (seção 4) são obrigatórios para avisos assíncronos (ex.: "sua arte foi publicada", que pode acontecer dias depois da última mensagem do cliente).

---

## 4. Templates de mensagem (Business-Initiated Messages)

### 4.1. Por que são necessários

Qualquer mensagem que o **sistema** inicia (não uma resposta dentro de 24h de uma mensagem do cliente) precisa usar um **template pré-aprovado** pela Meta no Business Manager. Texto livre é rejeitado com erro `131047`.

### 4.2. Como submeter um template

1. Business Manager → WhatsApp Manager → Message Templates → Create Template.
2. Escolher idioma (`pt_BR` no projeto).
3. Escrever o corpo com variáveis posicionais (`{{1}}`, `{{2}}`, ...).
4. Preencher um **exemplo de preenchimento** de cada variável (a Meta exige isso para avaliar o template).
5. Escolher/declarar uma **categoria**: `UTILITY` (atualização de status de um serviço já contratado, mais barata) ou `MARKETING` (promocional, mais cara). A Meta pode **reclassificar automaticamente** a categoria declarada, baseada no texto.
6. Submeter e aguardar aprovação (minutos a 24h, segundo a documentação da Meta).

### 4.3. Templates usados no DesignHub

| Template | Finalidade | Categoria final | Observação |
|---|---|---|---|
| `inicio_atendimento_designhub` | Abre o questionário estruturado (RF004) | — | Corpo foi corrompido uma vez no Business Manager (acentuação virou `?`) e precisou ser reenviado/corrigido via `POST /{template-id}` na Graph API; Meta reaprovou. |
| `agendamento_cancelado_cliente` | Alerta ao designer quando o cliente cancela um agendamento (item 8.6) | `UTILITY` | Aprovado de primeira. |
| `designhub_arte_publicada` (abandonado) → `designhub_publicacao_concluida` (ativo) | Aviso "arte publicada" ao cliente, fora da janela de 24h (RF014) | `UTILITY` (na 3ª tentativa) | Ver lição aprendida abaixo. |

### 4.4. Lição aprendida: evitar reclassificação para `MARKETING`

A primeira tentativa de template de aviso de publicação usava um texto com emoji e tom de relacionamento ("🎨 Sua arte foi publicada! Obrigado por confiar no DesignHub 💙"). A Meta reclassificou automaticamente essa categoria de `UTILITY` para `MARKETING` — que é cobrado por mensagem na maioria dos países, mesmo tendo sido declarado como `UTILITY` na submissão.

A correção foi reescrever o texto em tom **neutro e factual**, sem emoji, sem exclamação, sem linguagem de agradecimento/relacionamento — apenas um fato objetivo + um ponteiro neutro:

```
✅ Publicação concluída

{{1}} foi publicada no Instagram do seu perfil.
Consulte o andamento da solicitação no DesignHub.
```

Mesmo essa versão ainda sofreu uma 2ª reclassificação em uma tentativa anterior; só na 3ª submissão (com nome de template novo e texto ainda mais seco) a Meta manteve `UTILITY`. **Conclusão prática para quem for replicar**: evite qualquer linguagem de "obrigado", "agradecemos", frases de efeito ou emoji em templates que você quer que fiquem como `UTILITY` — a Meta tende a interpretar tom de relacionamento como indício de marketing.

### 4.5. Custo real observado

- Mensagens `UTILITY`: a ativação do template `designhub_publicacao_concluida` foi autorizada pelo usuário assumindo um custo estimado de **~R$0,04–0,05 por mensagem enviada**, mesma faixa do template `agendamento_cancelado_cliente`.
- As duas tentativas que foram reclassificadas como `MARKETING` (custo estimado de ~R$0,31–0,38/mensagem) **nunca chegaram a ser usadas em produção** — a variável de ambiente correspondente foi configurada e revertida na mesma sessão antes de qualquer envio real, para não gerar custo sem autorização explícita.
- Fora isso, o uso da Cloud API (envio dentro da janela de 24h, recebimento de mensagens, webhooks) é gratuito.

---

## 5. Passo a passo — Instagram API

### 5.1. Escolher o produto certo

A Meta tem mais de um caminho para publicar no Instagram. O DesignHub usa o produto **"Instagram API with Instagram Login"** — login direto com a conta profissional do Instagram, **sem precisar de uma Página do Facebook** vinculada (diferente do fluxo clássico "Facebook Login for Business").

**Armadilha real e mais cara do projeto**: o token gerado por esse produto só funciona contra o host `graph.instagram.com`. Usar `graph.facebook.com` (o host "clássico" que a maioria dos tutoriais antigos usa) resulta em erro de autenticação, mesmo com um token aparentemente válido. Essa diferença não é óbvia e só foi descoberta depois de **3 falhas reais em produção** (token errado → host errado → container ainda não pronto) antes da primeira publicação bem-sucedida. Nenhuma dessas falhas marcou a publicação como concluída — o sistema sempre registrou `status='falha'` e manteve o agendamento pendente, por desenho (ver RF014/RN34 no `CLAUDE.md`).

### 5.2. Conta de teste

Foi usada uma conta Instagram Profissional de teste (`designhub_26`), controlada pelos próprios autores, conforme exigido pela seção 16 do `CLAUDE.md` ("conta Instagram Professional de teste controlada pelos autores").

### 5.3. OAuth por cliente (não uma credencial global)

A primeira versão da integração usava uma única credencial global do Instagram para publicar a arte de **qualquer** cliente — o que é uma falha de autorização (publicaria a arte do Cliente A na conta do Cliente B). Isso foi corrigido com um fluxo de OAuth **por cliente**:

1. No DesignHub, o designer clica em "Conectar Instagram" para um cliente específico.
2. O backend gera um **token de estado opaco** (hash SHA-256, vinculado a cliente + designer + expiração de 10 minutos) e monta a URL de autorização:
   ```
   https://www.instagram.com/oauth/authorize
     ?client_id=<INSTAGRAM_APP_ID>
     &redirect_uri=<PUBLIC_BACKEND_URL>/api/instagram/oauth/callback
     &scope=instagram_business_basic,instagram_business_content_publish
     &response_type=code
     &state=<token_opaco>
   ```
3. O dono da conta Instagram (o cliente, ou quem administra a conta) faz login e aprova o acesso na tela oficial da Meta.
4. A Meta redireciona para `GET /api/instagram/oauth/callback?code=...&state=...`.
5. O backend valida o `state`, troca o `code` por um **token de curta duração**:
   ```
   POST https://api.instagram.com/oauth/access_token
   ```
6. Troca o token de curta duração por um **token de longa duração** (~60 dias):
   ```
   GET https://graph.instagram.com/access_token?grant_type=ig_exchange_token&...
   ```
7. Salva o token (cifrado em repouso com `pgcrypto`, chave `INSTAGRAM_TOKEN_ENC_KEY`) vinculado exclusivamente àquele `id_cliente`.

Esse fluxo garante que cada cliente autoriza a própria conta, e o backend nunca aceita um ID de conta informado livremente — só o que veio do `state` validado.

> **Nota de reprodutibilidade**: o `redirect_uri` precisa bater **byte a byte** com o que está cadastrado no painel do App ("Valid OAuth Redirect URIs"), senão a Meta rejeita o callback.

### 5.4. Publicar a arte (Content Publishing API)

Processo em 3 chamadas, todas contra `graph.instagram.com`, usando o token daquele cliente:

1. **Criar o container de mídia**:
   ```
   POST {accountId}/media
   { "image_url": "<url_publica_da_arte>", "caption": "<legenda>" }
   → { "id": "<creationId>" }
   ```
2. **Aguardar o container ficar pronto** (a Meta processa a imagem de forma assíncrona — publicar cedo demais dá erro "Media ID is not available"):
   ```
   GET {creationId}?fields=status_code
   ```
   Repetir (polling) até `status_code === "FINISHED"` — no projeto, até 5 tentativas com 1,5s de intervalo entre elas.
3. **Publicar**:
   ```
   POST {accountId}/media_publish
   { "creation_id": "<creationId>" }
   → { "id": "<mediaId>" }
   ```
4. (Opcional, melhor esforço) Buscar o link público do post: `GET {mediaId}?fields=permalink`.

### 5.5. Disparo automático e idempotência

- Um job agendado (`pg_cron` no Supabase, gratuito) chama a cada poucos minutos um endpoint interno protegido do backend que processa agendamentos vencidos.
- Antes de publicar, o backend verifica se aquele agendamento **já não foi publicado** — reprocessamento do job nunca publica duas vezes o mesmo conteúdo.
- Se o cliente daquela solicitação não tiver conexão Instagram válida (nunca conectou, ou o token expirou), o sistema **não tenta publicar automaticamente** — cai no caminho de publicação manual já previsto pelo RF014, sem nunca marcar falsamente como "Publicado".

---

## 6. Linguagens e tecnologias usadas na integração

| Camada | Tecnologia |
|---|---|
| Runtime/linguagem | Node.js + TypeScript (backend Express 5) |
| Cliente HTTP | `fetch` nativo do Node, com `AbortController` para timeout manual (10–15s por chamada) — não foi usado axios nem node-fetch |
| Validação de payload recebido | `zod` (schemas tipados para o corpo do webhook do WhatsApp e do callback OAuth do Instagram) |
| Assinatura/criptografia | Módulo nativo `node:crypto` (`createHmac`, `timingSafeEqual`) — webhook do WhatsApp e `signed_request` do Instagram (deauthorize/data deletion) |
| Cifragem do token do Instagram em repouso | `pgcrypto` (extensão do PostgreSQL/Supabase) |
| Rate limiting das rotas OAuth | `express-rate-limit` |
| Agendador de publicação | `pg_cron` + `pg_net` (Supabase), chamando um endpoint HTTP interno do próprio backend |

Nenhuma biblioteca de terceiros "SDK oficial da Meta" foi usada — toda a integração é feita com chamadas HTTP diretas à Graph API/Instagram Graph API, o que dá controle total sobre erros, timeouts e formato de payload (e também é mais fácil de auditar para fins do TFC).

---

## 7. Variáveis de ambiente envolvidas (nomes apenas, sem valores)

```
# WhatsApp Cloud API
META_APP_ID=
META_APP_SECRET=
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_BUSINESS_ACCOUNT_ID=
WHATSAPP_VERIFY_TOKEN=
WHATSAPP_TEMPLATE_NAME=
WHATSAPP_TEMPLATE_LANGUAGE=pt_BR
WHATSAPP_TEMPLATE_NAME_PUBLICACAO=
WHATSAPP_TEMPLATE_NAME_ALERTA_DESIGNER=

# Instagram API (OAuth por cliente — ADR 0005)
INSTAGRAM_APP_ID=
INSTAGRAM_APP_SECRET=
INSTAGRAM_TOKEN_ENC_KEY=

# Comum às duas integrações
PUBLIC_BACKEND_URL=
```

Veja `.env.example` na raiz do repositório para a lista completa e comentada (incluindo as demais variáveis do projeto que não são da Meta).

---

## 8. Bloqueios externos encontrados e como foram resolvidos

| Bloqueio | Causa | Como foi resolvido |
|---|---|---|
| `BLOCKED_EXTERNAL` inicial (WhatsApp) | Credenciais Meta ainda não configuradas | Resolvido ao configurar App/produto/token |
| `BLOCKED_EXTERNAL_META` (envio real RF004) | Template de início de atendimento ainda não aprovado | Resolvido após aprovação do `inicio_atendimento_designhub` |
| `BLOCKED_EXTERNAL_META` (publicação Instagram) | Token inválido (erro 190 da Graph API) | Resolvido ao corrigir o token **e** descobrir o host correto (`graph.instagram.com`) |
| `BLOCKED_EXTERNAL_WHATSAPP_PUBLICACAO` | Template de aviso de publicação reclassificado como `MARKETING` duas vezes | Resolvido com um 3º template, texto mais neutro, aprovado como `UTILITY` |
| `BLOCKED_EXTERNAL` (handshake OAuth completo do Instagram) | Exige um clique humano real em um navegador (aprovar o acesso na tela da Meta) | Mecanismo implementado e testado com mocks da Graph API; a validação ponta a ponta real depende de ação humana pontual, não de código |

Nenhum desses bloqueios foi "resolvido" simulando sucesso — em cada caso, o sistema continuou registrando o estado real (falha, pendência ou bloqueio) até a causa externa ser corrigida de verdade, conforme exigido pela seção 3.5 do `CLAUDE.md`.

---

## 9. Checklist resumido para quem for replicar

1. Criar App em developers.facebook.com, tipo "Business".
2. Adicionar produto **WhatsApp** → anotar App ID/Secret, Phone Number ID, WABA ID, token de teste.
3. Configurar webhook (callback URL + verify token) **e** inscrever o App explicitamente via `POST /{waba}/subscribed_apps` + `POST /{app}/subscriptions` (o painel sozinho não basta).
4. Implementar a validação HMAC-SHA256 do corpo bruto do webhook antes de confiar em qualquer payload recebido.
5. Submeter templates de mensagem com textos neutros/factuais (sem emoji, sem "obrigado") para maximizar a chance de ficarem como `UTILITY` em vez de `MARKETING`.
6. Adicionar produto **"Instagram API with Instagram Login"** (não o fluxo clássico via Página do Facebook) → usar sempre `graph.instagram.com` para esse token.
7. Implementar OAuth por cliente/tenant desde o início — nunca uma única credencial global de Instagram para múltiplos usuários/clientes.
8. Implementar o fluxo de container de mídia com polling de status antes de publicar — publicar cedo demais falha.
9. Tornar a publicação idempotente (checar se já foi publicado antes de tentar de novo) porque jobs agendados podem reexecutar.
10. Nunca marcar como "sucesso" uma publicação cuja chamada à Meta falhou — manter pendente e alertar.

---

## 10. Fontes internas para aprofundar

- `docs/decisions/0002-whatsapp-cloud-api.md` — decisão arquitetural WhatsApp Web → Cloud API.
- `docs/decisions/0003-instagram-oficial-fallback-manual.md` — decisão arquitetural Instagram + fallback manual, incluindo a descoberta do host correto.
- `docs/decisions/0005-instagram-autorizacao-por-cliente.md` — correção da falha de autorização (credencial global → OAuth por cliente).
- `docs/decisions/meta-whatsapp-templates-business-initiated.md` — histórico completo de submissão/reclassificação dos templates.
- Código: `backend/src/integrations/whatsapp/whatsappClient.ts`, `backend/src/integrations/whatsapp/webhookSignature.ts`, `backend/src/routes/whatsapp.routes.ts`, `backend/src/integrations/instagram/instagramClient.ts`, `backend/src/integrations/instagram/instagramOAuth.ts`, `backend/src/integrations/instagram/instagramSignedRequest.ts`, `backend/src/routes/instagramOAuth.routes.ts`, `backend/src/config/env.ts`.
