import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

/** Item 9: assinaturas Web Push do designer — nunca contém dado pessoal do cliente. */
export interface PushSubscriptionRow {
  idUsuario: string;
  endpoint: string;
  p256dh: string;
  authKey: string;
}

const subscriptionRowSchema = z.object({
  endpoint: z.string(),
  p256dh: z.string(),
  auth_key: z.string(),
});

/** Upsert idempotente (mesmo endpoint do mesmo designer não duplica linha). */
export async function upsertPushSubscription(
  adminClient: SupabaseClient,
  params: { idUsuario: string; endpoint: string; p256dh: string; authKey: string },
): Promise<void> {
  const result: unknown = await adminClient.from('push_subscription').upsert(
    {
      id_usuario: params.idUsuario,
      endpoint: params.endpoint,
      p256dh: params.p256dh,
      auth_key: params.authKey,
    },
    { onConflict: 'id_usuario,endpoint' },
  );
  const { error } = result as { error: { message: string } | null };
  if (error) throw new Error(`Falha ao salvar assinatura de push: ${error.message}`);
}

export async function deletePushSubscription(
  adminClient: SupabaseClient,
  idUsuario: string,
  endpoint: string,
): Promise<void> {
  const result: unknown = await adminClient
    .from('push_subscription')
    .delete()
    .eq('id_usuario', idUsuario)
    .eq('endpoint', endpoint);
  const { error } = result as { error: { message: string } | null };
  if (error) throw new Error(`Falha ao remover assinatura de push: ${error.message}`);
}

/** Chamado pelo job de notificação quando o navegador revoga/expira a assinatura (404/410). */
export async function deletePushSubscriptionByEndpoint(
  adminClient: SupabaseClient,
  endpoint: string,
): Promise<void> {
  const result: unknown = await adminClient.from('push_subscription').delete().eq('endpoint', endpoint);
  const { error } = result as { error: { message: string } | null };
  if (error) throw new Error(`Falha ao remover assinatura de push expirada: ${error.message}`);
}

export async function listPushSubscriptionsByDesigner(
  adminClient: SupabaseClient,
  idDesigner: string,
): Promise<PushSubscriptionRow[]> {
  const result: unknown = await adminClient
    .from('push_subscription')
    .select('endpoint, p256dh, auth_key')
    .eq('id_usuario', idDesigner);
  const { data, error } = result as { data: unknown; error: { message: string } | null };
  if (error) throw new Error(`Falha ao listar assinaturas de push: ${error.message}`);

  const rows = z.array(subscriptionRowSchema).parse(data ?? []);
  return rows.map((row) => ({
    idUsuario: idDesigner,
    endpoint: row.endpoint,
    p256dh: row.p256dh,
    authKey: row.auth_key,
  }));
}
