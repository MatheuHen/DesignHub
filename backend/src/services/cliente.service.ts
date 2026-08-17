import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseAdminClient } from '../config/supabase.js';
import { NotFoundError } from '../lib/errors.js';
import {
  deleteCliente as deleteClienteRow,
  getClienteById,
  insertCliente,
  listClientes as listClientesRepo,
  updateCliente as updateClienteRow,
  type Cliente,
} from '../repositories/cliente.repository.js';
import type {
  CreateClienteInput,
  ListClientesQuery,
  UpdateClienteInput,
} from '../schemas/cliente.schemas.js';

/** RF003/RN44: leitura via cliente escopado ao próprio designer (RLS garante ownership). */
export async function listClientes(
  userClient: SupabaseClient,
  query: ListClientesQuery,
): Promise<{ items: Cliente[]; total: number; page: number; pageSize: number }> {
  const { items, total } = await listClientesRepo(userClient, query);
  return { items, total, page: query.page, pageSize: query.pageSize };
}

async function assertOwnedCliente(userClient: SupabaseClient, id: number): Promise<Cliente> {
  const cliente = await getClienteById(userClient, id);
  if (!cliente) {
    throw new NotFoundError('Cliente não encontrado.');
  }
  return cliente;
}

export async function getCliente(userClient: SupabaseClient, id: number): Promise<Cliente> {
  return assertOwnedCliente(userClient, id);
}

/** RF003/RN07: nome e WhatsApp obrigatórios, Instagram opcional. */
export async function createCliente(
  idDesigner: string,
  input: CreateClienteInput,
): Promise<Cliente> {
  const adminClient = getSupabaseAdminClient();
  return insertCliente(adminClient, { idDesigner, ...input });
}

/**
 * Ownership é confirmado via `userClient` (RLS) antes de qualquer escrita
 * pela service role — nunca confia apenas no `:id` da rota (seção 12.1).
 */
export async function updateCliente(
  userClient: SupabaseClient,
  id: number,
  changes: UpdateClienteInput,
): Promise<void> {
  const owned = await assertOwnedCliente(userClient, id);
  const adminClient = getSupabaseAdminClient();
  await updateClienteRow(adminClient, id, owned.idDesigner, changes);
}

export async function removeCliente(userClient: SupabaseClient, id: number): Promise<void> {
  const owned = await assertOwnedCliente(userClient, id);
  const adminClient = getSupabaseAdminClient();
  await deleteClienteRow(adminClient, id, owned.idDesigner);
}
