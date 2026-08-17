import { z } from 'zod';

export const createDesignerSchema = z.object({
  nomeCompleto: z.string().trim().min(3).max(150),
  email: z.string().trim().toLowerCase().email().max(180),
  whatsapp: z.string().trim().min(8).max(20),
});
export type CreateDesignerInput = z.infer<typeof createDesignerSchema>;

export const updateDesignerSchema = z
  .object({
    nomeCompleto: z.string().trim().min(3).max(150).optional(),
    whatsapp: z.string().trim().min(8).max(20).optional(),
    statusOperacional: z.string().trim().max(60).nullable().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'Nenhum campo para atualizar.' });
export type UpdateDesignerInput = z.infer<typeof updateDesignerSchema>;

export const setDesignerStatusSchema = z.object({
  status: z.enum(['ativo', 'inativo']),
});
export type SetDesignerStatusInput = z.infer<typeof setDesignerStatusSchema>;

export const listDesignersQuerySchema = z.object({
  search: z.string().trim().max(150).optional(),
  status: z.enum(['ativo', 'inativo']).optional(),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type ListDesignersQuery = z.infer<typeof listDesignersQuerySchema>;

export const reassignSolicitacaoSchema = z.object({
  novoDesignerId: z.string().uuid(),
});
export type ReassignSolicitacaoInput = z.infer<typeof reassignSolicitacaoSchema>;

export const designerIdParamSchema = z.object({ id: z.string().uuid() });
