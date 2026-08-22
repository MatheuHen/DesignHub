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
  { key: 'cores', prompt: 'Você tem preferência de cores? Se sim, quais?' },
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

export const CLOSING_MESSAGE =
  'Obrigado! Suas respostas foram registradas e sua solicitação já está em produção. Em breve o designer entrará em contato.';
