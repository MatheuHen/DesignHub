import { z } from 'zod';
import { SOLICITACAO_STATUSES } from '../lib/statusTransitions.js';

export { SOLICITACAO_STATUSES };

/**
 * RF005/RF016: "listagem/filtros por cliente, designer, status e data" —
 * data é a data de criação (YYYY-MM-DD). `idDesigner` (QUADRO 59) só é
 * significativo na listagem admin de "Solicitações atribuídas" (RF016) —
 * na listagem do próprio designer é sempre o próprio, então o filtro é
 * redundante mas inofensivo.
 */
export const listSolicitacoesQuerySchema = z.object({
  status: z.enum(SOLICITACAO_STATUSES).optional(),
  idCliente: z.coerce.number().int().positive().optional(),
  idDesigner: z.string().uuid().optional(),
  clienteNome: z.string().trim().min(1).max(150).optional(),
  dataInicio: z.string().date().optional(),
  dataFim: z.string().date().optional(),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type ListSolicitacoesQuery = z.infer<typeof listSolicitacoesQuerySchema>;

/** RF005: a solicitação "reúne tema, cores, observações e referências" — descrição é um campo de apoio editável pelo designer. */
export const updateSolicitacaoSchema = z
  .object({
    tema: z.string().trim().max(150).nullable().optional(),
    cores: z.string().trim().max(150).nullable().optional(),
    observacoes: z.string().trim().max(2000).nullable().optional(),
    descricao: z.string().trim().max(2000).nullable().optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, { message: 'Nenhum campo para atualizar.' });
export type UpdateSolicitacaoInput = z.infer<typeof updateSolicitacaoSchema>;

export const solicitacaoIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

/** RF007: observação opcional que acompanha o envio de uma nova versão. */
export const uploadVersaoArteBodySchema = z.object({
  observacoes: z
    .string()
    .trim()
    .max(2000)
    .optional()
    .transform((value) => (value === '' ? undefined : value)),
});
export type UploadVersaoArteBody = z.infer<typeof uploadVersaoArteBodySchema>;

export const versaoArteParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
  versaoId: z.coerce.number().int().positive(),
});

export const ajusteParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
  ajusteId: z.coerce.number().int().positive(),
});
