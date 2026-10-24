import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseAdminClient } from '../config/supabase.js';
import { ConflictError, NotFoundError } from '../lib/errors.js';
import {
  deleteCliente as deleteClienteRow,
  findClienteDuplicadoPorWhatsapp,
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

/**
 * RF003 (regra desta rodada): WhatsApp é único por designer — não
 * globalmente. `whatsapp` já chega normalizado (transform do schema Zod),
 * então a checagem aqui é sempre contra o mesmo formato gravado no banco.
 *
 * Risco de concorrência conhecido e aceito nesta etapa: entre esta
 * consulta e o INSERT/UPDATE há uma janela em que duas requisições
 * simultâneas do mesmo designer, para o mesmo WhatsApp, poderiam ambas
 * passar a checagem (TOCTOU). Não há `UNIQUE (id_designer, whatsapp)` no
 * banco ainda — ver nota no relatório de entrega sobre por quê (4 pares
 * antigos duplicados impedem criar a constraint sem saneamento prévio). Em
 * volume normal de cadastro manual pelo designer (não é um endpoint de
 * alta concorrência), o risco residual é baixo; registrar como pendência
 * técnica para reforço no banco após o saneamento dos dados antigos.
 */
async function assertWhatsappNaoDuplicado(
  adminClient: SupabaseClient,
  idDesigner: string,
  whatsappNormalizado: string,
  excludeId?: number,
): Promise<void> {
  const duplicado = await findClienteDuplicadoPorWhatsapp(
    adminClient,
    idDesigner,
    whatsappNormalizado,
    excludeId,
  );
  if (duplicado !== null) {
    throw new ConflictError('Você já tem um cliente cadastrado com este WhatsApp.');
  }
}

/** RF003/RN07: nome e WhatsApp obrigatórios, Instagram opcional. */
export async function createCliente(
  idDesigner: string,
  input: CreateClienteInput,
): Promise<Cliente> {
  const adminClient = getSupabaseAdminClient();
  await assertWhatsappNaoDuplicado(adminClient, idDesigner, input.whatsapp);
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
  if (changes.whatsapp !== undefined && changes.whatsapp !== owned.whatsapp) {
    await assertWhatsappNaoDuplicado(adminClient, owned.idDesigner, changes.whatsapp, id);
  }
  await updateClienteRow(adminClient, id, owned.idDesigner, changes);
}

export async function removeCliente(userClient: SupabaseClient, id: number): Promise<void> {
  const owned = await assertOwnedCliente(userClient, id);
  const adminClient = getSupabaseAdminClient();
  await deleteClienteRow(adminClient, id, owned.idDesigner);
}
