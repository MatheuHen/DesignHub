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

/**
 * Observabilidade de entrega: a Cloud API confirma o ENVIO com HTTP 200 +
 * `wamid`, mas o resultado real da ENTREGA chega depois, neste array
 * `statuses` (`sent`/`delivered`/`read`/`failed`). Até aqui o campo era
 * descartado no parse, então falha de entrega — inclusive a recusa 131047
 * por janela de atendimento fechada — era completamente silenciosa: o log
 * dizia "mensagem enviada" para mensagens que nunca chegaram.
 *
 * Só os campos técnicos necessários ao diagnóstico; `recipient_id`
 * (telefone do cliente) é aceito no parse mas nunca registrado em log
 * (RNF010/seção 12.5).
 */
const whatsappStatusSchema = z.object({
  id: z.string().max(128),
  status: z.string().max(32),
  recipient_id: z.string().max(32).optional(),
  errors: z
    .array(
      z.object({
        code: z.number().optional(),
        title: z.string().max(256).optional(),
      }),
    )
    .max(10)
    .optional(),
});

const whatsappChangeValueSchema = z.object({
  messages: z.array(whatsappMessageSchema).max(50).optional(),
  statuses: z.array(whatsappStatusSchema).max(50).optional(),
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
export type WhatsAppDeliveryStatus = z.infer<typeof whatsappStatusSchema>;
