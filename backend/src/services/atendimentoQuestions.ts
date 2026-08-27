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
 * Item 10 da rodada de correções: informa explicitamente que o atendimento
 * automatizado (questionário estruturado) terminou — a solicitação segue
 * para produção/avaliação/agendamento/publicação pelo DesignHub, não é
 * encerrada. Mensagens enviadas depois deste ponto não são processadas
 * pelo questionário (RN08/item 11) — só um novo atendimento aberto pelo
 * designer reabre a coleta estruturada.
 */
export const CLOSING_MESSAGE =
  'Obrigado! Seu atendimento automatizado desta solicitação foi concluído. As informações foram registradas e o processo continuará no DesignHub. Para solicitar uma nova arte, um novo atendimento deverá ser iniciado pelo designer.';
