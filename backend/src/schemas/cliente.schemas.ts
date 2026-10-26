import { z } from 'zod';

const WHATSAPP_INVALIDO_MESSAGE =
  'Informe um celular válido com DDI 55, DDD e número iniciado por 9.';

/**
 * RF003 (rodada de correção — padrão brasileiro obrigatório): o DER/RN07
 * exigem WhatsApp do cliente; o RF004 depende do número normalizado para
 * casar com o que a Meta envia em `from` no webhook. Para reduzir ambiguidade
 * e perda silenciosa de resposta (RN09), passa a exigir exatamente o formato
 * `55` + DDD (2 dígitos) + celular (9 dígitos, iniciado por `9`) = 13
 * dígitos no total, após remover qualquer máscara/formatação. O 9º dígito
 * NUNCA é adicionado automaticamente — um número sem ele é rejeitado, não
 * corrigido, para não gravar um número que pode não existir.
 */
const whatsappSchema = z
  .string()
  .trim()
  .min(8)
  .max(25)
  // RF003/item 2.2: normaliza para somente dígitos antes de validar/gravar,
  // para que "+55 (64) 98403-5274" e "5564984035274" sejam tratados como o
  // mesmo número, independente da máscara/formatação digitada.
  .transform((value) => value.replace(/\D/g, ''))
  .refine((digits) => /^55[1-9][0-9]9[0-9]{8}$/.test(digits), {
    message: WHATSAPP_INVALIDO_MESSAGE,
  });

const observacaoSchema = z.string().trim().max(1000);

export const createClienteSchema = z.object({
  nome: z.string().trim().min(2).max(150),
  whatsapp: whatsappSchema,
  instagram: z.string().trim().max(60).optional(),
  observacao: observacaoSchema.optional(),
});
export type CreateClienteInput = z.infer<typeof createClienteSchema>;

export const updateClienteSchema = z
  .object({
    nome: z.string().trim().min(2).max(150).optional(),
    whatsapp: whatsappSchema.optional(),
    instagram: z.string().trim().max(60).nullable().optional(),
    observacao: observacaoSchema.nullable().optional(),
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
