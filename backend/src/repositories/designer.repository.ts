import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { ConflictError, NotFoundError } from '../lib/errors.js';
import type { ListDesignersQuery, UpdateDesignerInput } from '../schemas/designer.schemas.js';

export interface DesignerSummary {
  id: string;
  nomeCompleto: string;
  email: string;
  status: 'ativo' | 'inativo';
  whatsapp: string | null;
  bloqueado: boolean;
  statusOperacional: string | null;
}

const designerEmbedSchema = z.object({
  whatsapp: z.string().nullable(),
  bloqueado: z.boolean(),
  status_operacional: z.string().nullable(),
});

const designerRowSchema = z.object({
  id_usuario: z.string(),
  nome_completo: z.string(),
  email: z.string(),
  status: z.enum(['ativo', 'inativo']),
  designer: z
    .union([designerEmbedSchema, z.array(designerEmbedSchema), z.null()])
    .transform((value) => (Array.isArray(value) ? (value[0] ?? null) : value)),
});

function toSummary(row: z.infer<typeof designerRowSchema>): DesignerSummary {
  return {
    id: row.id_usuario,
    nomeCompleto: row.nome_completo,
    email: row.email,
    status: row.status,
    whatsapp: row.designer?.whatsapp ?? null,
    bloqueado: row.designer?.bloqueado ?? false,
    statusOperacional: row.designer?.status_operacional ?? null,
  };
}

function escapeIlikeTerm(term: string): string {
  return term.replace(/[%,()]/g, (match) => `\\${match}`);
}

/** RF001/RF015: lista/pesquisa designers por nome, e-mail e status (leitura via RLS, admin vê todos). */
export async function listDesigners(
  client: SupabaseClient,
  filters: ListDesignersQuery,
): Promise<{ items: DesignerSummary[]; total: number }> {
  let query = client
    .from('usuario')
    .select('id_usuario, nome_completo, email, status, designer(whatsapp, bloqueado, status_operacional)', {
      count: 'exact',
    })
    .eq('perfil', 'designer')
    .order('nome_completo', { ascending: true });

  if (filters.search) {
    const term = escapeIlikeTerm(filters.search);
    query = query.or(`nome_completo.ilike.%${term}%,email.ilike.%${term}%`);
  }
  if (filters.status) {
    query = query.eq('status', filters.status);
  }

  const from = (filters.page - 1) * filters.pageSize;
  const to = from + filters.pageSize - 1;

  const result: unknown = await query.range(from, to);
  const { data, error, count } = result as {
    data: unknown;
    error: { message: string } | null;
    count: number | null;
  };

  if (error) {
    throw new Error(`Falha ao listar designers: ${error.message}`);
  }

  const rows = z.array(designerRowSchema).parse(data ?? []);
  return { items: rows.map(toSummary), total: count ?? rows.length };
}

export async function getDesignerById(
  client: SupabaseClient,
  id: string,
): Promise<DesignerSummary | null> {
  const result: unknown = await client
    .from('usuario')
    .select('id_usuario, nome_completo, email, status, designer(whatsapp, bloqueado, status_operacional)')
    .eq('perfil', 'designer')
    .eq('id_usuario', id)
    .maybeSingle();

  const { data, error } = result as { data: unknown; error: { message: string } | null };
  if (error) {
    throw new Error(`Falha ao buscar designer: ${error.message}`);
  }
  if (!data) return null;

  return toSummary(designerRowSchema.parse(data));
}

/** RN44/RN45: valida que o designer de destino existe e está ativo (RF016). */
export async function assertDesignerIsActive(client: SupabaseClient, id: string): Promise<void> {
  const designer = await getDesignerById(client, id);
  if (!designer) {
    throw new NotFoundError('Designer de destino não encontrado.');
  }
  if (designer.status !== 'ativo') {
    throw new ConflictError('Designer de destino precisa estar ativo para receber reatribuição.');
  }
}

/**
 * RF001/RNF009: criação real de credencial + perfil requer service role
 * (Supabase Auth Admin API). Os dois INSERTs (usuario + designer) são
 * feitos atomicamente via RPC `create_designer_profile` (uma falha em
 * qualquer um dos dois reverte ambos), evitando perfil órfão.
 */
export async function insertDesignerProfile(
  adminClient: SupabaseClient,
  input: { id: string; nomeCompleto: string; email: string; whatsapp: string },
): Promise<void> {
  const result: unknown = await adminClient.rpc('create_designer_profile', {
    p_id_usuario: input.id,
    p_nome_completo: input.nomeCompleto,
    p_email: input.email,
    p_whatsapp: input.whatsapp,
  });
  const { error } = result as { error: { message: string } | null };
  if (error) {
    throw new Error(`Falha ao criar perfil de designer: ${error.message}`);
  }
}

export async function updateDesignerProfile(
  adminClient: SupabaseClient,
  id: string,
  changes: UpdateDesignerInput,
): Promise<void> {
  if (changes.nomeCompleto) {
    const result: unknown = await adminClient
      .from('usuario')
      .update({ nome_completo: changes.nomeCompleto })
      .eq('id_usuario', id);
    const { error } = result as { error: { message: string } | null };
    if (error) throw new Error(`Falha ao atualizar usuário: ${error.message}`);
  }

  const designerChanges: Record<string, unknown> = {};
  if (changes.whatsapp !== undefined) designerChanges.whatsapp = changes.whatsapp;
  if (changes.statusOperacional !== undefined) {
    designerChanges.status_operacional = changes.statusOperacional;
  }

  if (Object.keys(designerChanges).length > 0) {
    const result: unknown = await adminClient
      .from('designer')
      .update(designerChanges)
      .eq('id_usuario', id);
    const { error } = result as { error: { message: string } | null };
    if (error) throw new Error(`Falha ao atualizar designer: ${error.message}`);
  }
}

export async function setDesignerStatus(
  adminClient: SupabaseClient,
  id: string,
  status: 'ativo' | 'inativo',
): Promise<void> {
  const result: unknown = await adminClient
    .from('usuario')
    .update({ status })
    .eq('id_usuario', id)
    .eq('perfil', 'designer');
  const { error } = result as { error: { message: string } | null };
  if (error) {
    throw new Error(`Falha ao atualizar status do designer: ${error.message}`);
  }
}

const FOREIGN_KEY_VIOLATION = '23503';

/**
 * RF001: exclusão respeita impedimentos históricos. As FKs de `cliente` e
 * `solicitacao` para `designer` são `on delete restrict`, então o próprio
 * banco rejeita a exclusão quando há histórico — aqui apenas traduzimos
 * esse erro em uma mensagem acionável (reatribuir antes de excluir).
 */
export async function deleteDesigner(adminClient: SupabaseClient, id: string): Promise<void> {
  const authResult: unknown = await adminClient.auth.admin.deleteUser(id);
  const { error } = authResult as { error: { message: string; code?: string } | null };

  if (error) {
    if (error.code === FOREIGN_KEY_VIOLATION || /foreign key/i.test(error.message)) {
      throw new ConflictError(
        'Não é possível excluir: designer possui clientes ou solicitações vinculados. Reatribua-os antes de excluir.',
      );
    }
    throw new Error(`Falha ao excluir designer: ${error.message}`);
  }
}
