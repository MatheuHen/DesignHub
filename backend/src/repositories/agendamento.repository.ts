import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { ConflictError, NotFoundError, ValidationError } from '../lib/errors.js';
import type { AgendamentoBody, ListAgendamentosQuery } from '../schemas/agendamento.schemas.js';

const PG_NOT_FOUND_OR_REVOKED = 'P0002';
const PG_STATUS_INVALID = 'P0001';
const PG_DATE_IN_PAST = 'P0004';
const PG_CANCEL_WINDOW = 'P0005';
const PG_LEGENDA_OBRIGATORIA = 'P0006';

function mapAgendamentoRpcError(error: { message: string; code?: string }): never {
  if (error.code === PG_NOT_FOUND_OR_REVOKED) throw new NotFoundError('Agendamento não encontrado.');
  if (error.code === PG_STATUS_INVALID) throw new ConflictError(error.message);
  if (error.code === PG_DATE_IN_PAST) {
    throw new ValidationError('Data/horário do agendamento deve ser no futuro.');
  }
  if (error.code === PG_LEGENDA_OBRIGATORIA) {
    throw new ValidationError('Informe a legenda da publicação.');
  }
  if (error.code === PG_CANCEL_WINDOW) {
    throw new ConflictError('Cancelamento não permitido: faltam menos de 3 horas para a publicação.');
  }
  throw new Error(`Falha ao processar agendamento: ${error.message}`);
}

const createAgendamentoRowSchema = z.object({ id_agendamento: z.number() });

/** RF012/RN27/RN30: cria o agendamento (RPC atômica); só aceita solicitação com status = Aprovado. */
export async function createAgendamentoRpc(
  adminClient: SupabaseClient,
  params: { idSolicitacao: number; idDesigner: string; body: AgendamentoBody },
): Promise<{ idAgendamento: number }> {
  const result: unknown = await adminClient.rpc('create_agendamento', {
    p_id_solicitacao: params.idSolicitacao,
    p_id_designer: params.idDesigner,
    p_data_publicacao: params.body.dataPublicacao,
    p_horario: params.body.horario,
    p_legenda: params.body.legenda,
  });
  const { data, error } = result as {
    data: unknown;
    error: { message: string; code?: string } | null;
  };
  if (error) mapAgendamentoRpcError(error);

  const rows = z.array(createAgendamentoRowSchema).parse(data ?? []);
  const row = rows[0];
  if (!row) throw new Error('Falha ao criar agendamento: resposta vazia da função.');
  return { idAgendamento: row.id_agendamento };
}

/** RF012: edição do agendamento (RPC atômica); só enquanto ainda está ativo. */
export async function updateAgendamentoRpc(
  adminClient: SupabaseClient,
  params: { idAgendamento: number; idDesigner: string; body: AgendamentoBody },
): Promise<void> {
  const result: unknown = await adminClient.rpc('update_agendamento', {
    p_id_agendamento: params.idAgendamento,
    p_id_designer: params.idDesigner,
    p_data_publicacao: params.body.dataPublicacao,
    p_horario: params.body.horario,
    p_legenda: params.body.legenda,
  });
  const { error } = result as { error: { message: string; code?: string } | null };
  if (error) mapAgendamentoRpcError(error);
}

/** RF013/RN31: cancela o agendamento (RPC atômica); só se faltarem >= 3h para o horário planejado. */
export async function cancelAgendamentoRpc(
  adminClient: SupabaseClient,
  params: { idAgendamento: number; idDesigner: string },
): Promise<void> {
  const result: unknown = await adminClient.rpc('cancel_agendamento', {
    p_id_agendamento: params.idAgendamento,
    p_id_designer: params.idDesigner,
  });
  const { error } = result as { error: { message: string; code?: string } | null };
  if (error) mapAgendamentoRpcError(error);
}

const agendamentoCoreRowSchema = z.object({
  id_agendamento: z.number(),
  id_solicitacao: z.number(),
  status: z.enum(['Agendado', 'Cancelado', 'Publicado']),
  solicitacao: z.union([
    z.object({ id_designer: z.string() }),
    z.array(z.object({ id_designer: z.string() })),
    z.null(),
  ]),
});

const activeAgendamentoSummaryRowSchema = z.object({
  id_agendamento: z.number(),
  data_publicacao: z.string(),
  horario: z.string(),
  legenda: z.string().nullable(),
});

export interface ActiveAgendamentoSummary {
  idAgendamento: number;
  dataPublicacao: string;
  horario: string;
  legenda: string | null;
}

/** RF005/RF012: dados mínimos do agendamento ativo para exibir no detalhe da solicitação. */
export async function getActiveAgendamentoSummary(
  client: SupabaseClient,
  idSolicitacao: number,
): Promise<ActiveAgendamentoSummary | null> {
  const result: unknown = await client
    .from('agendamento_publicacao')
    .select('id_agendamento, data_publicacao, horario, legenda')
    .eq('id_solicitacao', idSolicitacao)
    .eq('status', 'Agendado')
    .maybeSingle();
  const { data, error } = result as { data: unknown; error: { message: string } | null };
  if (error) throw new Error(`Falha ao buscar agendamento: ${error.message}`);
  if (!data) return null;

  const row = activeAgendamentoSummaryRowSchema.parse(data);
  return {
    idAgendamento: row.id_agendamento,
    dataPublicacao: row.data_publicacao,
    horario: row.horario,
    legenda: row.legenda,
  };
}

/**
 * RF012/RF013: as rotas de edição/cancelamento são aninhadas em
 * `solicitacao` (no máx. um agendamento ativo por solicitação, já
 * garantido por `agendamento_ativo_unico_idx` desde a Fase 2) — resolve o
 * `id_agendamento` ativo a partir do `id_solicitacao`, evitando que o
 * frontend precise rastrear o ID do agendamento separadamente.
 */
export async function getActiveAgendamentoBySolicitacao(
  client: SupabaseClient,
  idSolicitacao: number,
): Promise<{ idAgendamento: number; idSolicitacao: number; idDesigner: string; status: string } | null> {
  const result: unknown = await client
    .from('agendamento_publicacao')
    .select('id_agendamento, id_solicitacao, status, solicitacao(id_designer)')
    .eq('id_solicitacao', idSolicitacao)
    .eq('status', 'Agendado')
    .maybeSingle();
  const { data, error } = result as { data: unknown; error: { message: string } | null };
  if (error) throw new Error(`Falha ao buscar agendamento: ${error.message}`);
  if (!data) return null;

  const row = agendamentoCoreRowSchema.parse(data);
  const solicitacao = Array.isArray(row.solicitacao) ? (row.solicitacao[0] ?? null) : row.solicitacao;
  if (!solicitacao) return null;
  return {
    idAgendamento: row.id_agendamento,
    idSolicitacao: row.id_solicitacao,
    idDesigner: solicitacao.id_designer,
    status: row.status,
  };
}

const clienteEmbedSchema = z.object({ nome: z.string() });
const solicitacaoEmbedSchema = z.object({
  tema: z.string().nullable(),
  id_cliente: z.number(),
  cliente: z.union([clienteEmbedSchema, z.array(clienteEmbedSchema), z.null()]),
});

const agendamentoRowSchema = z.object({
  id_agendamento: z.number(),
  id_solicitacao: z.number(),
  data_publicacao: z.string(),
  horario: z.string(),
  legenda: z.string().nullable(),
  status: z.enum(['Agendado', 'Cancelado', 'Publicado']),
  created_at: z.string(),
  solicitacao: z.union([solicitacaoEmbedSchema, z.array(solicitacaoEmbedSchema), z.null()]),
});

export interface AgendamentoSummary {
  idAgendamento: number;
  idSolicitacao: number;
  tema: string | null;
  clienteNome: string;
  dataPublicacao: string;
  horario: string;
  legenda: string | null;
  status: 'Agendado' | 'Cancelado' | 'Publicado';
  createdAt: string;
}

/** RF012: listagem com filtros — via userClient, RLS já restringe a "próprio designer ou admin". */
export async function listAgendamentos(
  client: SupabaseClient,
  query: ListAgendamentosQuery,
): Promise<{ items: AgendamentoSummary[]; total: number }> {
  let builder = client
    .from('agendamento_publicacao')
    .select(
      'id_agendamento, id_solicitacao, data_publicacao, horario, legenda, status, created_at, solicitacao!inner(tema, id_cliente, cliente(nome))',
      { count: 'exact' },
    )
    .order('data_publicacao', { ascending: true })
    .order('horario', { ascending: true });

  if (query.status) builder = builder.eq('status', query.status);
  if (query.idCliente) builder = builder.eq('solicitacao.id_cliente', query.idCliente);
  if (query.dataInicio) builder = builder.gte('data_publicacao', query.dataInicio);
  if (query.dataFim) builder = builder.lte('data_publicacao', query.dataFim);

  const from = (query.page - 1) * query.pageSize;
  const to = from + query.pageSize - 1;

  const result: unknown = await builder.range(from, to);
  const { data, error, count } = result as {
    data: unknown;
    error: { message: string } | null;
    count: number | null;
  };
  if (error) throw new Error(`Falha ao listar agendamentos: ${error.message}`);

  const rows = z.array(agendamentoRowSchema).parse(data ?? []);
  const items = rows.map((row) => {
    const solicitacao = Array.isArray(row.solicitacao) ? (row.solicitacao[0] ?? null) : row.solicitacao;
    const cliente = solicitacao
      ? Array.isArray(solicitacao.cliente)
        ? (solicitacao.cliente[0] ?? null)
        : solicitacao.cliente
      : null;
    return {
      idAgendamento: row.id_agendamento,
      idSolicitacao: row.id_solicitacao,
      tema: solicitacao?.tema ?? null,
      clienteNome: cliente?.nome ?? '—',
      dataPublicacao: row.data_publicacao,
      horario: row.horario,
      legenda: row.legenda,
      status: row.status,
      createdAt: row.created_at,
    };
  });

  return { items, total: count ?? items.length };
}
