import { z } from 'zod';

/**
 * Item 9: shape padrão do `PushSubscriptionJSON` do navegador (Web Push API).
 *
 * Rodada correções (item 10.3): `PushSubscription.toJSON()` da especificação
 * Push API serializa SEMPRE `{ endpoint, expirationTime, keys }` — Chrome,
 * Edge e Firefox incluem `expirationTime: null` mesmo sem expiração. Um
 * `.strict()` que ignorasse esse campo rejeitava (400) a assinatura legítima
 * de todo navegador real, e o erro chegava ao designer como a mensagem
 * genérica "não foi possível ativar as notificações". O campo é declarado
 * explicitamente (em vez de afrouxar para `.passthrough()`) para continuar
 * barrando qualquer propriedade desconhecida (seção 12.2, mass assignment).
 */
export const subscribePushSchema = z
  .object({
    endpoint: z.string().trim().url().max(2000),
    expirationTime: z.number().nullable().optional(),
    keys: z.object({
      p256dh: z.string().trim().min(1).max(500),
      auth: z.string().trim().min(1).max(500),
    }),
  })
  .strict();
export type SubscribePushInput = z.infer<typeof subscribePushSchema>;

export const unsubscribePushSchema = z
  .object({
    endpoint: z.string().trim().url().max(2000),
  })
  .strict();
