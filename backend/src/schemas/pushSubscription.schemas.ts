import { z } from 'zod';

/** Item 9: shape padrão do `PushSubscriptionJSON` do navegador (Web Push API). */
export const subscribePushSchema = z
  .object({
    endpoint: z.string().trim().url().max(2000),
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
