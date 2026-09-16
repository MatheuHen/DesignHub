# Templates WhatsApp Business-Initiated pendentes de aprovação Meta

Contexto: RF014/item 9.2-9.4 (aviso "arte publicada" ao cliente) e RF012-RF013/item 8.6
(alerta ao designer quando o cliente cancela um agendamento) precisam enviar
mensagem fora da janela de 24h de atendimento — a WhatsApp Cloud API exige um
template pré-aprovado no Meta Business Manager para esse caso (mensagem de
sessão/texto livre é rejeitada com o erro `131047`).

O código já está preparado para usar esses templates assim que forem
aprovados (fallback automático, `WhatsAppReengagementRequiredError`). Basta
submeter os textos abaixo no Business Manager e configurar o nome aprovado
nas variáveis de ambiente indicadas — **sem novo deploy de código**.

**Status em 2026-09-15 (checagem via Graph API `GET /{waba_id}/message_templates`): ambos `APPROVED`.**

| Template (nome final) | ID Meta | Categoria aprovada | Status |
|---|---|---|---|
| `designhub_arte_publicada` | `1047818271217084` | **MARKETING** (reclassificado, 2ª vez) | APPROVED |
| `agendamento_cancelado_cliente` | `1393053336343242` | UTILITY | APPROVED |

**Ativado em produção (15/09/2026): apenas `agendamento_cancelado_cliente`**
(`WHATSAPP_TEMPLATE_NAME_ALERTA_DESIGNER`, item 8.6 — alerta ao designer no
cancelamento de agendamento). Categoria `UTILITY` confirmada, sem risco de
custo identificado.

**`designhub_arte_publicada` (MARKETING) permanece NÃO ativado** — substituído
pela 3ª tentativa abaixo, que foi aprovada como `UTILITY` e é a que está em
uso em produção. `designhub_arte_publicada` continua existindo no Business
Manager mas nenhuma env var aponta para ele.

**3ª tentativa (submetida 15/09/2026, aprovada 16/09/2026)**: usuário optou
pela opção 1. Novo template submetido com nome distinto (não edita o já
aprovado como MARKETING, que permanece existente e inativo em produção):

- **Nome**: `designhub_publicacao_concluida` (ID `1279400890942154`)
- **Categoria declarada na submissão**: `UTILITY` — **status: `APPROVED`**
  (confirmado via Graph API `GET /{waba_id}/message_templates` em
  2026-09-16, categoria final manteve `UTILITY`, sem reclassificação desta
  vez).
- **Ativado em produção (16/09/2026)**: `WHATSAPP_TEMPLATE_NAME_PUBLICACAO=
  designhub_publicacao_concluida` configurado em `.env.local` e na Vercel
  (produção), backend rebuildado/redeployado; smoke test `GET /api/health`
  confirmou `whatsappSendingClient: configured`. Autorização de custo dada
  explicitamente pelo usuário nesta sessão (~R$0,04-0,05/mensagem, RF014/
  item 9.2-9.4 agora ativo fora da janela de 24h).
- **Corpo (Body) submetido** (mesmo estilo do único template de negócio já
  aprovado como `UTILITY`, `agendamento_cancelado_cliente`: cabeçalho de
  status + frase factual citando a entidade específica + ponteiro neutro
  para consultar a plataforma — sem agradecimento/linguagem de
  relacionamento, que é o suspeito mais provável de ter reclassificado as
  duas tentativas anteriores):

  ```
  ✅ Publicação concluída

  {{1}} foi publicada no Instagram do seu perfil.
  Consulte o andamento da solicitação no DesignHub.
  ```

- **Parâmetro `{{1}}`**: mesmo `artLabel` já usado pelo código
  (`a arte "Promoção de Verão" (versão 2)`, sem ID técnico) — **nenhuma
  mudança de código necessária**, só trocar o valor de
  `WHATSAPP_TEMPLATE_NAME_PUBLICACAO` para o novo nome quando aprovado.

**Se aprovado como `UTILITY`**: configurar
`WHATSAPP_TEMPLATE_NAME_PUBLICACAO=designhub_publicacao_concluida` (custo
~R$0,04-0,05/mensagem, mesma faixa do item 8.6, compatível com o espírito
de custo mínimo do TFC — não é R$0 puro, mas ordens de magnitude abaixo de
MARKETING).
**Se reclassificado `MARKETING` de novo**: registrar como decisão final do
usuário entre aceitar o custo de MARKETING (~R$0,31-0,38/mensagem) ou
manter apenas o aviso in-app — não tentar uma 4ª submissão automaticamente
sem confirmação, para não gerar ruído de histórico de templates.

Histórico: a primeira submissão do aviso de publicação usou o nome
`arte_publicada` e texto com emoji ("🎨 Sua arte foi publicada!..."), mas a
Meta reclassificou automaticamente para `MARKETING` (cobrado por mensagem na
maioria dos países — incompatível com o custo zero exigido pelo TFC). Essa
versão foi excluída (`DELETE`) e ressubmetida com nome novo
(`designhub_arte_publicada`, para evitar o lock de exclusão em andamento) e
texto neutro/factual ("Atualização do DesignHub: {{1}} foi publicada.
Obrigado por utilizar o DesignHub."), sem emoji nem exclamação — manteve
`UTILITY` na submissão. **Confirmar categoria final após a aprovação
efetiva** (a reclassificação da Meta pode ocorrer depois do `PENDING`
inicial, como aconteceu na primeira tentativa).

A aprovação/rejeição é decisão exclusiva da Meta (normalmente minutos a 24h).
Assim que aprovado (`status: APPROVED`), configurar
`WHATSAPP_TEMPLATE_NAME_PUBLICACAO=designhub_arte_publicada` e
`WHATSAPP_TEMPLATE_NAME_ALERTA_DESIGNER=agendamento_cancelado_cliente` na
Vercel — sem novo deploy de código, o fallback já está pronto.

---

## 1. Aviso "arte publicada" ao cliente

- **Variável de ambiente**: `WHATSAPP_TEMPLATE_NAME_PUBLICACAO`
- **Nome do template submetido**: `designhub_arte_publicada` (ID `1047818271217084`)
- **Categoria**: `UTILITY` (atualização de status de um serviço já contratado,
  não é conteúdo promocional — evita a cobrança por mensagem de `MARKETING`).
  Texto neutro/factual escolhido deliberadamente (sem emoji/exclamação) porque
  a primeira tentativa (nome `arte_publicada`, com emoji) foi reclassificada
  pela Meta para `MARKETING` — ver histórico no topo deste arquivo.
- **Idioma**: Portuguese (BR) — `pt_BR`
- **Corpo (Body) submetido**:

  ```
  Atualização do DesignHub: {{1}} foi publicada. Obrigado por utilizar o DesignHub.
  ```

- **Exemplo de preenchimento de `{{1}}`** (para o formulário de exemplo da Meta):
  `a arte "Promoção de Verão" (versão 2)`
- **Parâmetro enviado pelo código**: um único texto (`artLabel`), já no formato
  `a arte "{tema}" (versão {N})` ou `sua arte (versão {N})` quando não há tema
  — nunca inclui ID técnico.
- **Observação**: o permalink do Instagram (quando existir) só é incluído na
  mensagem de **sessão** (texto livre), não neste template — a Meta não
  permite variação condicional dentro de um template aprovado. Se quiser o
  permalink também no fallback por template, é preciso registrar um segundo
  parâmetro `{{2}}` opcional (ex.: sempre enviado, vazio quando não houver
  permalink) — decisão de produto, não implementada até aprovação explícita.

---

## 2. Alerta ao designer — cliente cancelou agendamento

- **Variável de ambiente**: `WHATSAPP_TEMPLATE_NAME_ALERTA_DESIGNER`
- **Nome do template submetido**: `agendamento_cancelado_cliente` (ID `1393053336343242`)
- **Categoria**: `UTILITY`
- **Idioma**: Portuguese (BR) — `pt_BR`
- **Corpo (Body) sugerido**:

  ```
  ⚠️ Agendamento cancelado

  O cliente {{1}} cancelou o agendamento de publicação da arte "{{2}}".
  Consulte a solicitação no DesignHub para mais detalhes.
  ```

- **Exemplo de preenchimento**: `{{1}}` = `Maria Oliveira`, `{{2}}` = `Promoção de Verão`
- **Parâmetros enviados pelo código**: `[clienteNome, tema]`, nessa ordem —
  nunca inclui ID técnico de cliente/solicitação/agendamento.

---

## Como ativar depois da aprovação

1. Submeter o texto (ajustado se necessário) no Meta Business Manager →
   WhatsApp Manager → Message Templates.
2. Aguardar aprovação (`APPROVED`).
3. Configurar a variável de ambiente correspondente na Vercel (nome do
   template aprovado, sem valor sensível) e redeployar (ou apenas atualizar a
   env var, se o runtime já ler em cada invocação — confirmar antes de supor).
4. Sem a variável configurada, o comportamento atual (`BLOCKED_EXTERNAL_*`,
   log claro, nenhuma falha silenciosa, publicação/cancelamento nunca
   revertidos) continua válido e seguro.
