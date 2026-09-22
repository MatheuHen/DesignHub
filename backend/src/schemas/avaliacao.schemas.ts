import { z } from 'zod';

/** RF009: o token bruto é sempre 64 caracteres hex (256 bits, `lib/tokens.ts`). */
export const avaliacaoTokenParamSchema = z.object({
  token: z.string().regex(/^[0-9a-f]{64}$/, 'Token inválido.'),
});

const AVALIACAO_DECISOES = ['Aprovado', 'Ajustes', 'Cancelado'] as const;

/**
 * Rodada correções (itens 7/8/19, RN22/RN27/RN29): ao aprovar, o cliente
 * escolhe exatamente uma das três opções — nunca um booleano genérico.
 * `automatico` agenda de verdade na hora (exige Instagram conectado,
 * validado no service); `designer_manual` é a mesma preferência (texto) que
 * já existia; `proprio_cliente` não cria agendamento nenhum.
 */
const OPCAO_PUBLICACAO = ['automatico', 'designer_manual', 'proprio_cliente'] as const;

/**
 * RF009/RF010/RN20/RN21: descrição obrigatória apenas quando a decisão é
 * "Ajustes". RN22: quando a decisão é "Aprovado", o cliente escolhe uma das
 * três opções de publicação; "automatico"/"designer_manual" exigem data e
 * horário desejados juntos, "proprio_cliente" não.
 */
export const submitAvaliacaoBodySchema = z
  .object({
    decisao: z.enum(AVALIACAO_DECISOES),
    descricao: z
      .string()
      .trim()
      .max(2000)
      .optional()
      .transform((value) => (value === '' ? undefined : value)),
    observacoes: z
      .string()
      .trim()
      .max(2000)
      .optional()
      .transform((value) => (value === '' ? undefined : value)),
    opcaoPublicacao: z.enum(OPCAO_PUBLICACAO).optional(),
    dataDesejada: z
      .string()
      .regex(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, 'Data inválida (use AAAA-MM-DD).')
      .optional(),
    horarioDesejado: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Horário inválido (use HH:MM).')
      .optional(),
    legendaDesejada: z
      .string()
      .trim()
      .max(2200)
      .optional()
      .transform((value) => (value === '' ? undefined : value)),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (data.decisao === 'Ajustes' && !data.descricao) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Descrição do ajuste é obrigatória ao solicitar ajustes.',
        path: ['descricao'],
      });
    }
    if (data.decisao === 'Aprovado') {
      if (!data.opcaoPublicacao) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Escolha uma opção de publicação: agendar automaticamente, o designer agendar manualmente, ou publicar por conta própria.',
          path: ['opcaoPublicacao'],
        });
      } else if (
        (data.opcaoPublicacao === 'automatico' || data.opcaoPublicacao === 'designer_manual') &&
        (!data.dataDesejada || !data.horarioDesejado)
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Informe a data e o horário desejados.',
          path: ['dataDesejada'],
        });
      }
    }
  });
