import { z } from 'zod';

/** RF009: o token bruto é sempre 64 caracteres hex (256 bits, `lib/tokens.ts`). */
export const avaliacaoTokenParamSchema = z.object({
  token: z.string().regex(/^[0-9a-f]{64}$/, 'Token inválido.'),
});

const AVALIACAO_DECISOES = ['Aprovado', 'Ajustes', 'Cancelado'] as const;

/** RF009/RF010/RN20/RN21: descrição obrigatória apenas quando a decisão é "Ajustes". */
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
  });
export type SubmitAvaliacaoBody = z.infer<typeof submitAvaliacaoBodySchema>;
