import { z } from 'zod';

/** RF009: o token bruto é sempre 64 caracteres hex (256 bits, `lib/tokens.ts`). */
export const avaliacaoTokenParamSchema = z.object({
  token: z.string().regex(/^[0-9a-f]{64}$/, 'Token inválido.'),
});

const AVALIACAO_DECISOES = ['Aprovado', 'Ajustes', 'Cancelado'] as const;

/**
 * RF009/RF010/RN20/RN21: descrição obrigatória apenas quando a decisão é
 * "Ajustes". RN22: quando a decisão é "Aprovado", o cliente pode
 * opcionalmente informar se deseja o agendamento da publicação e, se sim,
 * data/horário desejados (obrigatórios juntos nesse caso).
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
    // multipart/form-data (mesmo POST que aceita a referência opcional em
    // Ajustes) sempre entrega campos de texto como string — nunca boolean
    // nativo — por isso 'true'/'false' explícitos em vez de z.coerce.boolean()
    // (que trataria qualquer string não vazia, incluindo 'false', como true).
    desejaAgendamento: z
      .enum(['true', 'false'])
      .optional()
      .transform((value) => (value === undefined ? undefined : value === 'true')),
    dataDesejada: z
      .string()
      .regex(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, 'Data inválida (use AAAA-MM-DD).')
      .optional(),
    horarioDesejado: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Horário inválido (use HH:MM).')
      .optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (data.decisao === 'Ajustes' && !data.descricao) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Descrição do ajuste é obrigatória ao solicitar ajustes (RF010).',
        path: ['descricao'],
      });
    }
    if (data.decisao === 'Aprovado' && data.desejaAgendamento && (!data.dataDesejada || !data.horarioDesejado)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Informe a data e o horário desejados (RN22).',
        path: ['dataDesejada'],
      });
    }
  });
export type SubmitAvaliacaoBody = z.infer<typeof submitAvaliacaoBodySchema>;
