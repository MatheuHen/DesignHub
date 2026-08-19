import { z } from 'zod';

// Seção 12.3: mesmo com a assinatura HMAC já validada antes do parse,
// limites de tamanho/quantidade são defesa em profundidade contra um App
// Secret comprometido ou payload anômalo. A WhatsApp Cloud API limita
// mensagens de texto a 4096 caracteres e normalmente envia poucas
// mensagens por entrega de webhook — os limites abaixo são generosos o
// suficiente para tráfego legítimo.
/** RF004/item 14: mídia (imagem/documento) enviada pelo cliente como referência (RN08). */
const whatsappMediaSchema = z.object({
  id: z.string().max(128),
  mime_type: z.string().max(128).optional(),
});

const whatsappMessageSchema = z.object({
  from: z.string().max(32),
  id: z.string().max(128),
  type: z.string().max(32),
  text: z.object({ body: z.string().max(4096) }).optional(),
  image: whatsappMediaSchema.optional(),
  document: whatsappMediaSchema.optional(),
});

const whatsappChangeValueSchema = z.object({
  messages: z.array(whatsappMessageSchema).max(50).optional(),
});

const whatsappChangeSchema = z.object({
  field: z.string().max(64),
  value: whatsappChangeValueSchema,
});

const whatsappEntrySchema = z.object({
  changes: z.array(whatsappChangeSchema).max(50),
});

/** Payload oficial do webhook da WhatsApp Cloud API (campos usados pelo DesignHub). */
export const whatsappWebhookPayloadSchema = z.object({
  object: z.string().max(64),
  entry: z.array(whatsappEntrySchema).max(50),
});
export type WhatsAppWebhookPayload = z.infer<typeof whatsappWebhookPayloadSchema>;
export type WhatsAppInboundMessage = z.infer<typeof whatsappMessageSchema>;

export const iniciarAtendimentoParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});
