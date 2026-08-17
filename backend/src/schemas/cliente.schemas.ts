import { z } from 'zod';

/**
 * RF004: o matching do webhook do WhatsApp compara dígitos normalizados
 * (código do país + DDD + número) contra o que a Meta envia em `from`.
 * Exigir um número plausível de dígitos aqui evita que um cadastro sem
 * código do país (ex.: "11999999999" em vez de "5511999999999") gere
 * perda silenciosa de resposta por não encontrar o atendimento
 * correspondente (RN09: toda resposta deve ficar registrada).
 */
const whatsappSchema = z
  .string()
  .trim()
  .min(8)
  .max(20)
  .refine((value) => value.replace(/\D/g, '').length >= 10, {
    message: 'Informe o WhatsApp com código do país (ex.: 5511999999999).',
  });

export const createClienteSchema = z.object({
  nome: z.string().trim().min(2).max(150),
  whatsapp: whatsappSchema,
  instagram: z.string().trim().max(60).optional(),
});
export type CreateClienteInput = z.infer<typeof createClienteSchema>;

export const updateClienteSchema = z
  .object({
    nome: z.string().trim().min(2).max(150).optional(),
    whatsapp: whatsappSchema.optional(),
    instagram: z.string().trim().max(60).nullable().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'Nenhum campo para atualizar.' });
export type UpdateClienteInput = z.infer<typeof updateClienteSchema>;

export const listClientesQuerySchema = z.object({
  search: z.string().trim().max(150).optional(),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type ListClientesQuery = z.infer<typeof listClientesQuerySchema>;

export const clienteIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});
