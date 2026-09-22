# ADR 0006 — IA (Gemini) como classificador auxiliar de intenção na confirmação inicial do WhatsApp

- Status: aceita e implementada
- Data: 2026-09-22
- RF/RN/RNF relacionados: RF004, RN08, RN09, seções 2.2/12.2/12.9 do `CLAUDE.md`
- Autorização: explicitamente concedida pelo usuário nesta rodada de correções
  (item 16), que passou a permitir uso de IA generativa como
  **classificador/intérprete auxiliar**, nunca como executor de ações de
  negócio. Sem esta autorização explícita, a seção 2.2 do `CLAUDE.md` proíbe
  "IA generativa" por iniciativa do agente — esta ADR existe justamente para
  registrar o limite exato dessa autorização.

## Contexto

O questionário estruturado do WhatsApp (RF004/RN08) abre com uma pergunta de
confirmação (`ATENDIMENTO_QUESTIONS[0]`, chave `confirmacao`). A resposta do
cliente é classificada por regra determinística
(`classificarConfirmacaoRegex`, `atendimento.service.ts`) em `sim`, `nao` ou
`indefinido` via regex (`YES_PATTERN`/`NO_PATTERN`). Respostas fora desses
padrões (ex.: "por mim tudo certo", "acho que não quero agora", "pode ser")
caem em `indefinido`, o que hoje pede esclarecimento ao cliente e repete a
pergunta — funcionalmente correto (RN09: nunca inventa dado), mas gera
atrito desnecessário para respostas humanas comuns que um classificador de
linguagem natural reconheceria com segurança.

## Decisão

1. **Escopo estritamente delimitado**: a IA (Gemini) é usada **apenas** como
   segunda tentativa de classificação, e **apenas** quando a regra
   determinística já retornou `indefinido` para a pergunta de confirmação.
   Ela nunca é consultada para as demais perguntas do questionário (tema,
   cores, observações, referência) nem para o detector de intenção de
   cancelamento (`CANCEL_INTENT_PATTERN`), que permanece 100% determinístico
   — não há evidência de falha nele e ampliar o escopo sem necessidade
   violaria a disciplina de custo/escopo da seção 2.2/11.
2. **Nunca muta estado diretamente**: o resultado da IA só alimenta a mesma
   variável `ConfirmacaoClassificacao` que a regex já produzia — as mutações
   de estado (`markAtendimentoRecusado`, `registerRespostaEAvancar`,
   histórico) continuam exatamente no mesmo código já existente e revisado.
   A IA não tem acesso a nenhuma ferramenta/function-calling; só recebe texto
   e devolve um enum.
3. **Fail-closed por padrão**: sem `GEMINI_API_KEY` configurada (o caso
   padrão em desenvolvimento/nesta entrega — ver "Situação de credencial"
   abaixo), `classificarConfirmacaoComGemini` retorna `null`
   imediatamente sem chamar rede, e o fluxo se comporta **exatamente** como
   antes deste item. O mesmo vale para timeout (6s), erro HTTP, resposta
   fora do schema ou limite local de chamadas excedido — nenhum desses
   cenários lança exceção nem bloqueia o atendimento.
4. **Defesas contra prompt injection** (seção 12.2/12.9):
   - instrução de sistema fixa, nunca concatenada com texto do usuário;
   - texto do cliente isolado em bloco `<mensagem_cliente>...</mensagem_cliente>`,
     com instrução explícita de tratar qualquer conteúdo ali dentro
     (inclusive tentativas de comando) como dado a classificar, nunca como
     ordem;
   - saída restrita por `responseSchema` da própria API Gemini (enum de 3
     valores) — o modelo não tem como emitir texto livre;
   - validação Zod independente do resultado (nunca confia cegamente na
     resposta de terceiro, seção 12.3).
5. **Minimização de dados** (RNF010): texto do cliente truncado a 500
   caracteres antes do envio; nenhum dado além do texto da própria resposta
   (sem nome, WhatsApp, e-mail ou qualquer outro campo pessoal) é enviado à
   API externa.
6. **Controle de custo**: modelo da família Flash (`gemini-2.5-flash-lite`
   por padrão, configurável via `GEMINI_MODEL` sem novo deploy), camada
   gratuita do Google AI Studio, sem billing habilitado. Limite local
   best-effort de 20 chamadas/minuto por instância do processo (defesa em
   profundidade sobre o limite autoritativo da própria API, que responde
   com erro e cai no fallback sem custo). Chamada só ocorre quando a regra
   determinística já não conseguiu decidir — volume naturalmente baixo (no
   máximo 1 chamada por atendimento, na pior hipótese).

## Situação de credencial

`GEMINI_API_KEY` **não está configurada** em `.env.local` nesta entrega.
Toda a implementação (`backend/src/integrations/ai/geminiClient.ts`,
`backend/src/services/atendimento.service.ts`) está pronta, testada
(`geminiClient.test.ts`, casos dedicados em `atendimento.service.test.ts`) e
gated corretamente pela chave — mas a verificação de chamada real à API
Gemini fica `BLOCKED_EXTERNAL_CREDENTIAL: GEMINI_API_KEY`. Isso não impede
nenhuma funcionalidade do RF004: o fluxo de confirmação continua
funcionando com a regra determinística, exatamente como antes deste item.

Para ativar: gerar uma chave gratuita em https://aistudio.google.com/apikey
e definir `GEMINI_API_KEY` em `.env.local` — nenhum deploy de código é
necessário.

## Consequências

- Redução esperada de atrito na confirmação inicial para respostas humanas
  fora do padrão regex, sem qualquer mudança de comportamento observável
  quando a IA está indisponível.
- Nenhum novo requisito, tela, entidade ou fluxo foi criado — apenas uma
  classificação mais tolerante de uma resposta que já existia.
- Superfície de segurança nova (chamada a serviço externo) mitigada pelas
  defesas listadas acima; revisão de segurança dedicada cobre este ponto no
  item 17 da rodada.
