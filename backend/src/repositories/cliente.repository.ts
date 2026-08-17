import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { ConflictError, NotFoundError } from '../lib/errors.js';
import type {
  CreateClienteInput,
  ListClientesQuery,
  UpdateClienteInput,
} from '../schemas/cliente.schemas.js';

export interface Cliente {
  id: number;
  idDesigner: string;
  nome: string;
  whatsapp: string;
  instagram: string | null;
}

const clienteRowSchema = z.object({
  id_cliente: z.number(),
  id_designer: z.string(),
  nome: z.string(),
  whatsapp: z.string(),
  instagram: z.string().nullable(),
});

function toCliente(row: z.infer<typeof clienteRowSchema>): Cliente {
  return {
    id: row.id_cliente,
    idDesigner: row.id_designer,
    nome: row.nome,
    whatsapp: row.whatsapp,
    instagram: row.instagram,
  };
}

function escapeIlikeTerm(term: string): string {
  return term.replace(/[%,()]/g, (match) => `\\${match}`);
}

/**
 * RF003/RN44: lista/pesquisa clientes do próprio designer. Usa o cliente
 * escopado ao token do usuário — RLS (`id_designer = auth.uid()`) já
 * restringe o resultado à própria carteira do designer, sem precisar de
 * filtro manual de ownership aqui.
 */
export async function listClientes(
  client: SupabaseClient,
  filters: ListClientesQuery,
): Promise<{ items: Cliente[]; total: number }> {
  let query = client
    .from('cliente')
    .select('id_cliente, id_designer, nome, whatsapp, instagram', { count: 'exact' })
    .order('nome', { ascending: true });

  if (filters.search) {
    const term = escapeIlikeTerm(filters.search);
    query = query.or(`nome.ilike.%${term}%,whatsapp.ilike.%${term}%`);
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
    throw new Error(`Falha ao listar clientes: ${error.message}`);
  }

  const rows = z.array(clienteRowSchema).parse(data ?? []);
  return { items: rows.map(toCliente), total: count ?? rows.length };
}

/** Ownership implícito: só retorna a linha se `id_designer = auth.uid()` (RLS) ou perfil admin. */
export async function getClienteById(client: SupabaseClient, id: number): Promise<Cliente | null> {
  const result: unknown = await client
    .from('cliente')
    .select('id_cliente, id_designer, nome, whatsapp, instagram')
    .eq('id_cliente', id)
    .maybeSingle();

  const { data, error } = result as { data: unknown; error: { message: string } | null };
  if (error) {
    throw new Error(`Falha ao buscar cliente: ${error.message}`);
  }
  if (!data) return null;

  return toCliente(clienteRowSchema.parse(data));
}

export async function insertCliente(
  adminClient: SupabaseClient,
  input: CreateClienteInput & { idDesigner: string },
): Promise<Cliente> {
  const result: unknown = await adminClient
    .from('cliente')
    .insert({
      id_designer: input.idDesigner,
      nome: input.nome,
      whatsapp: input.whatsapp,
      instagram: input.instagram ?? null,
    })
    .select('id_cliente, id_designer, nome, whatsapp, instagram')
    .single();

  const { data, error } = result as { data: unknown; error: { message: string } | null };
  if (error) {
    throw new Error(`Falha ao criar cliente: ${error.message}`);
  }
  return toCliente(clienteRowSchema.parse(data));
}

/**
 * Seção 12.1/12.4: mesmo com ownership já confirmado via RLS antes da
 * chamada (assertOwnedCliente em cliente.service.ts), a escrita usa service
 * role (ignora RLS) — por isso a query também filtra por `id_designer`
 * aqui, como segunda trava independente contra regressão futura que
 * chamasse este repository sem o pré-check (defesa em profundidade).
 */
export async function updateCliente(
  adminClient: SupabaseClient,
  id: number,
  idDesigner: string,
  changes: UpdateClienteInput,
): Promise<void> {
  const payload: Record<string, unknown> = {};
  if (changes.nome !== undefined) payload.nome = changes.nome;
  if (changes.whatsapp !== undefined) payload.whatsapp = changes.whatsapp;
  if (changes.instagram !== undefined) payload.instagram = changes.instagram;

  const result: unknown = await adminClient
    .from('cliente')
    .update(payload)
    .eq('id_cliente', id)
    .eq('id_designer', idDesigner)
    .select('id_cliente');
  const { data, error } = result as { data: unknown[] | null; error: { message: string } | null };
  if (error) {
    throw new Error(`Falha ao atualizar cliente: ${error.message}`);
  }
  if (!data || data.length === 0) {
    throw new NotFoundError('Cliente não encontrado.');
  }
}

const FOREIGN_KEY_VIOLATION = '23503';

/**
 * RF003: exclusão é bloqueada pelo banco (FK `solicitacao.id_cliente`
 * `on delete restrict`) quando o cliente já tem solicitações — traduzimos
 * isso numa mensagem acionável em vez de vazar o erro do Postgres. O
 * filtro por `id_designer` segue o mesmo racional de defesa em
 * profundidade do `updateCliente` acima.
 */
export async function deleteCliente(
  adminClient: SupabaseClient,
  id: number,
  idDesigner: string,
): Promise<void> {
  const result: unknown = await adminClient
    .from('cliente')
    .delete()
    .eq('id_cliente', id)
    .eq('id_designer', idDesigner)
    .select('id_cliente');
  const { data, error } = result as {
    data: unknown[] | null;
    error: { message: string; code?: string } | null;
  };

  if (error) {
    if (error.code === FOREIGN_KEY_VIOLATION || /foreign key/i.test(error.message)) {
      throw new ConflictError(
        'Não é possível excluir: cliente possui solicitações vinculadas.',
      );
    }
    throw new Error(`Falha ao excluir cliente: ${error.message}`);
  }
  if (!data || data.length === 0) {
    throw new NotFoundError('Cliente não encontrado.');
  }
}
