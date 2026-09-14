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

Nenhum dos dois textos abaixo foi submetido ainda; são propostas para revisão
humana antes do envio à Meta (a aprovação e o texto final são decisão de
quem opera o Business Manager, não do agente).

---

## 1. Aviso "arte publicada" ao cliente

- **Variável de ambiente**: `WHATSAPP_TEMPLATE_NAME_PUBLICACAO`
- **Nome sugerido do template**: `arte_publicada`
- **Categoria**: `UTILITY` (atualização de status de um serviço já contratado,
  não é conteúdo promocional — evita a fila/custo mais alto de `MARKETING`)
- **Idioma**: Portuguese (BR) — `pt_BR`
- **Corpo (Body) sugerido**:

  ```
  🎨 Sua arte foi publicada!

  {{1}} já está no ar. Obrigado por utilizar o DesignHub!
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
- **Nome sugerido do template**: `agendamento_cancelado_cliente`
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
