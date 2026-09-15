import { z } from 'zod';

/**
 * Auditoria (RNF007): mínimo de 8 já existia, mas sem regra de complexidade
 * permitia senhas triviais (ex.: "aaaaaaaa") definidas pelo Administrador.
 * Exige ao menos 1 letra e 1 número — permanece compatível com qualquer
 * senha já definida anteriormente (validação só se aplica a novas senhas).
 */
const senhaSchema = z
  .string()
  .min(8)
  .max(72)
  .regex(/[A-Za-z]/, 'A senha deve conter ao menos uma letra.')
  .regex(/[0-9]/, 'A senha deve conter ao menos um número.');

export const createDesignerSchema = z.object({
  nomeCompleto: z.string().trim().min(3).max(150),
  email: z.string().trim().toLowerCase().email().max(180),
  whatsapp: z.string().trim().min(8).max(20),
  /** RF001/FIGURA 28 do protótipo: o Administrador define a senha inicial do designer. */
  senha: senhaSchema,
});
export type CreateDesignerInput = z.infer<typeof createDesignerSchema>;

export const updateDesignerSchema = z
  .object({
    nomeCompleto: z.string().trim().min(3).max(150).optional(),
    whatsapp: z.string().trim().min(8).max(20).optional(),
    statusOperacional: z.string().trim().max(60).nullable().optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, { message: 'Nenhum campo para atualizar.' });
export type UpdateDesignerInput = z.infer<typeof updateDesignerSchema>;

export const setDesignerStatusSchema = z.object({
  status: z.enum(['ativo', 'inativo']),
});

/** RF001/item 2.1: Admin altera a senha de um designer existente. */
export const changeDesignerPasswordSchema = z
  .object({
    novaSenha: senhaSchema,
    confirmarSenha: senhaSchema,
  })
  .refine((data) => data.novaSenha === data.confirmarSenha, {
    message: 'As senhas informadas não coincidem.',
    path: ['confirmarSenha'],
  });

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
