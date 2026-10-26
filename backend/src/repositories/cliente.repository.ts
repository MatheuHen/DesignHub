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
  observacao: string | null;
}

const clienteRowSchema = z.object({
  id_cliente: z.number(),
  id_designer: z.string(),
  nome: z.string(),
  whatsapp: z.string(),
  instagram: z.string().nullable(),
  observacao: z.string().nullable(),
});

function toCliente(row: z.infer<typeof clienteRowSchema>): Cliente {
  return {
    id: row.id_cliente,
    idDesigner: row.id_designer,
    nome: row.nome,
    whatsapp: row.whatsapp,
    instagram: row.instagram,
    observacao: row.observacao,
  };
}

/**
 * Bug real encontrado em smoke test de produção (busca por WhatsApp
 * mascarado, ex. "(64) 98403-5274", retornava 0 resultados mesmo existindo
 * o cliente): o PostgREST trata vírgula/parênteses como estruturais dentro
 * de um filtro `or()` — escapar com barra invertida não é a sintaxe
 * correta e corrompe o filtro inteiro. A sintaxe correta é envolver o
 * valor em aspas duplas; dentro delas, apenas aspas e barra invertida
 * literais precisam de escape (e os wildcards do ILIKE, % e _, para busca
 * literal).
 */
function escapeIlikeTerm(term: string): string {
  return term.replace(/[%_\\"]/g, (match) => `\\${match}`);
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
    .select('id_cliente, id_designer, nome, whatsapp, instagram, observacao', { count: 'exact' })
    .order('nome', { ascending: true });

  if (filters.search) {
    const term = escapeIlikeTerm(filters.search);
    // Item 2.2 (correções): whatsapp é gravado só com dígitos — normaliza o
    // termo de busca para esse formato também, senão buscar por
    // "(64) 98403-5274" não encontra o registro gravado como "5564984035274".
    const digitsOnlyTerm = escapeIlikeTerm(filters.search.replace(/\D/g, ''));
    const whatsappCondition = digitsOnlyTerm
      ? `whatsapp.ilike."%${digitsOnlyTerm}%"`
      : `whatsapp.ilike."%${term}%"`;
    // Rodada de correção (auditoria final): a busca também cobre a
    // Observação — um termo parcial dentro do texto livre (ex.: "farmácia"
    // dentro de "cliente da farmácia do centro") deve encontrar o cliente.
    query = query.or(
      `nome.ilike."%${term}%",${whatsappCondition},observacao.ilike."%${term}%"`,
    );
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
    .select('id_cliente, id_designer, nome, whatsapp, instagram, observacao')
    .eq('id_cliente', id)
    .maybeSingle();

  const { data, error } = result as { data: unknown; error: { message: string } | null };
  if (error) {
    throw new Error(`Falha ao buscar cliente: ${error.message}`);
  }
  if (!data) return null;

  return toCliente(clienteRowSchema.parse(data));
}

/**
 * RF003 (regra desta rodada): WhatsApp é único POR DESIGNER, nunca
 * globalmente — dois designers diferentes podem ter clientes com o mesmo
 * número. `whatsapp` já chega normalizado (schema Zod faz a transformação
 * antes de qualquer chamada ao repository), então a comparação aqui é
 * sempre entre valores já normalizados. `excludeId` permite a edição de um
 * cliente manter o próprio WhatsApp sem se bloquear.
 */
export async function findClienteDuplicadoPorWhatsapp(
  adminClient: SupabaseClient,
  idDesigner: string,
  whatsappNormalizado: string,
  excludeId?: number,
): Promise<number | null> {
  let query = adminClient
    .from('cliente')
    .select('id_cliente')
    .eq('id_designer', idDesigner)
    .eq('whatsapp', whatsappNormalizado);
  if (excludeId !== undefined) {
    query = query.neq('id_cliente', excludeId);
  }

  const result: unknown = await query.maybeSingle();
  const { data, error } = result as {
    data: { id_cliente: number } | null;
    error: { message: string; code?: string } | null;
  };
  // PGRST116 = "more than one row" do .maybeSingle(): já existe mais de um
  // duplicado antigo para este designer+número (ex.: os 4 pares conhecidos).
  // Qualquer um dos dois confirma duplicidade — não escolhemos qual.
  if (error && error.code !== 'PGRST116') {
    throw new Error(`Falha ao verificar WhatsApp duplicado: ${error.message}`);
  }
  if (error?.code === 'PGRST116') {
    return -1;
  }
  return data?.id_cliente ?? null;
}

const UNIQUE_VIOLATION = '23505';
const WHATSAPP_DUPLICADO_MESSAGE = 'Você já tem um cliente cadastrado com este WhatsApp.';

/**
 * RF003 (item 2.1 da rodada de WhatsApp único por designer): a checagem de
 * aplicação (`assertWhatsappNaoDuplicado`) é a primeira camada, mas tem uma
 * janela de corrida entre a consulta e o INSERT/UPDATE (TOCTOU). A
 * constraint `cliente_designer_whatsapp_unico` (migration
 * 20261025100000) é a segunda camada — isto aqui traduz a violação dela
 * (23505) na mesma mensagem amigável, para nunca vazar erro cru do
 * Postgres ao frontend.
 */
function isWhatsappUnicoViolation(error: { code?: string; message: string }): boolean {
  return (
    error.code === UNIQUE_VIOLATION && /cliente_designer_whatsapp_unico/.test(error.message)
  );
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
      observacao: input.observacao ?? null,
    })
    .select('id_cliente, id_designer, nome, whatsapp, instagram, observacao')
    .single();

  const { data, error } = result as {
    data: unknown;
    error: { code?: string; message: string } | null;
  };
  if (error) {
    if (isWhatsappUnicoViolation(error)) {
      throw new ConflictError(WHATSAPP_DUPLICADO_MESSAGE);
    }
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
  if (changes.observacao !== undefined) payload.observacao = changes.observacao;

  const result: unknown = await adminClient
    .from('cliente')
    .update(payload)
    .eq('id_cliente', id)
    .eq('id_designer', idDesigner)
    .select('id_cliente');
  const { data, error } = result as {
    data: unknown[] | null;
    error: { code?: string; message: string } | null;
  };
  if (error) {
    if (isWhatsappUnicoViolation(error)) {
      throw new ConflictError(WHATSAPP_DUPLICADO_MESSAGE);
    }
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
