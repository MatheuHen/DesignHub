/**
 * RN08: perguntas predefinidas do questionário estruturado do WhatsApp —
 * confirmação, tema, preferência de cores, observações e referências.
 * Ordem fixa; o índice da próxima pergunta é sempre
 * `count(resposta_cliente do atendimento)`, sem estado adicional a
 * persistir.
 */
export type QuestionKey = 'confirmacao' | 'tema' | 'cores' | 'observacoes' | 'referencia';

export interface QuestionDefinition {
  key: QuestionKey;
  prompt: string;
}

export const ATENDIMENTO_QUESTIONS: readonly QuestionDefinition[] = [
  {
    key: 'confirmacao',
    prompt:
      'Olá! Vamos iniciar o atendimento para uma nova arte. Suas respostas (tema, cores, observações e referências) serão usadas apenas para produzir e avaliar a sua arte, conforme a LGPD (Lei nº 13.709/2018). Podemos continuar? Responda para confirmar.',
  },
  { key: 'tema', prompt: 'Qual é o tema da arte que você deseja?' },
  {
    key: 'cores',
    prompt: 'Qual a sua preferência de cores para a arte? Se não tiver preferência, responda "não tenho".',
  },
  {
    key: 'observacoes',
    prompt: "Escreva uma observação sobre a arte ou responda \"não tenho\".",
  },
  {
    key: 'referencia',
    prompt:
      'Se tiver alguma imagem de referência, envie agora. Se não tiver, responda "não tenho".',
  },
] as const;

/**
 * Item 27 (rodada correções): a primeira mensagem do questionário (pergunta
 * de confirmação, RN08) passa a identificar o designer responsável pelo
 * atendimento — só o nome de exibição, nunca e-mail/ID (RNF010). Só usada no
 * envio inicial (`iniciarAtendimento`); reenvios da mesma pergunta em outros
 * pontos do fluxo (ex.: retomada após cancelamento abortado) usam o texto
 * genérico de `ATENDIMENTO_QUESTIONS[0].prompt` — o cliente já viu o nome na
 * primeira mensagem.
 */
export function buildConfirmacaoPromptComDesigner(designerNomeCompleto: string): string {
  return (
    `Olá! Aqui é o DesignHub. O atendimento da sua solicitação está sendo realizado por ${designerNomeCompleto}. ` +
    'Suas respostas (tema, cores, observações e referências) serão usadas apenas para produzir e avaliar a sua ' +
    'arte, conforme a LGPD (Lei nº 13.709/2018). Podemos continuar? Responda para confirmar.'
  );
}

/**
 * Item 10 da rodada de correções: informa explicitamente que o atendimento
 * automatizado (questionário estruturado) terminou — a solicitação segue
 * para produção/avaliação/agendamento/publicação pelo DesignHub, não é
 * encerrada. Mensagens enviadas depois deste ponto não são processadas
 * pelo questionário (RN08/item 11) — só um novo atendimento aberto pelo
 * designer reabre a coleta estruturada.
 */
export const CLOSING_MESSAGE =
  'Obrigado! Seu atendimento automatizado desta solicitação foi concluído. As informações foram registradas e o processo continuará no DesignHub. Para solicitar uma nova arte, um novo atendimento deverá ser iniciado pelo designer.';

/**
 * Item 3.1 (correções 13/09/2026): resposta "Não" à pergunta de
 * confirmação inicial não pode continuar o fluxo (nem perguntar tema, nem
 * criar solicitação) — encerra o atendimento de forma amigável.
 */
export const RECUSA_MESSAGE =
  'Entendido, não vamos continuar com esta solicitação agora. Se quiser iniciar novamente, peça ao seu designer para abrir um novo atendimento.';

/** Item 3.2: resposta à confirmação não reconhecida como "sim" nem "não". */
export const CONFIRMACAO_INVALIDA_MESSAGE =
  'Não entendi sua resposta. Por favor, responda "Sim" para continuar ou "Não" para não continuar.';

/** Item 3.3: cancelamento explícito exige confirmação antes de efetivar. */
export const CANCELAMENTO_CONFIRMACAO_PROMPT =
  'Você quer cancelar este atendimento e não continuar com esta solicitação agora? Responda "Cancelar" para confirmar ou "Continuar" para seguir de onde paramos.';

export const CANCELAMENTO_CONFIRMADO_MESSAGE =
  'Atendimento cancelado a seu pedido. Nenhuma solicitação de arte foi criada a partir dele. Para começar de novo, peça ao seu designer para abrir um novo atendimento.';

/**
 * Item 28 (rodada correções): figurinha, reação, áudio, vídeo, localização,
 * contato ou mensagem interativa não podem ser aceitos como resposta de
 * texto de uma pergunta livre (tema/cores/observações) — antes disso caía
 * no fallback genérico `extractAnswerText` e avançava o questionário com um
 * texto de placeholder sem informação real (RN09).
 */
export const TIPO_MENSAGEM_NAO_SUPORTADA_MESSAGE =
  'Não consegui entender esse conteúdo (figurinha, reação, áudio, vídeo ou outro tipo não suportado). Responda com uma mensagem de texto.';

/** Mesma ideia, mas para a pergunta de referência (RF004/item 14), que também aceita imagem/PDF. */
export const TIPO_MENSAGEM_NAO_SUPORTADA_REFERENCIA_MESSAGE =
  'Não consegui usar esse conteúdo como referência (figurinha, reação, áudio, vídeo ou outro tipo não suportado). Envie uma imagem/PDF, ou responda em texto.';

export const CANCELAMENTO_ABORTADO_MESSAGE = 'Certo, vamos continuar de onde paramos.';
