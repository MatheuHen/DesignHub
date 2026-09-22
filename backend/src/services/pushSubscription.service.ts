import { getSupabaseAdminClient } from '../config/supabase.js';
import {
  deletePushSubscription,
  upsertPushSubscription,
} from '../repositories/pushSubscription.repository.js';
import type { SubscribePushInput } from '../schemas/pushSubscription.schemas.js';

/** Item 9: o designer autenticado registra a própria assinatura de push — nunca a de outro usuário. */
export async function subscribePush(callerId: string, input: SubscribePushInput): Promise<void> {
  const adminClient = getSupabaseAdminClient();
  await upsertPushSubscription(adminClient, {
    idUsuario: callerId,
    endpoint: input.endpoint,
    p256dh: input.keys.p256dh,
    authKey: input.keys.auth,
  });
}

export async function unsubscribePush(callerId: string, endpoint: string): Promise<void> {
  const adminClient = getSupabaseAdminClient();
  await deletePushSubscription(adminClient, callerId, endpoint);
}
