import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { ConflictError, NotFoundError } from '../lib/errors.js';
import { SOLICITACAO_STATUSES } from '../lib/statusTransitions.js';
import type { ListSolicitacoesQuery, UpdateSolicitacaoInput } from '../schemas/solicitacao.schemas.js';

/** RF005: `dataFim` do filtro é um dia (YYYY-MM-DD) inclusivo; `data_criacao` é datetime, então o limite superior é o início do dia seguinte. */
function nextDay(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

const solicitacaoRowSchema = z.object({
  id_solicitacao: z.number(),
  id_designer: z.string(),
  status: z.string(),
});

const solicitacaoStatusEnum = z.enum(SOLICITACAO_STATUSES);

export interface SolicitacaoSummary {
  id: number;
  idCliente: number;
  clienteNome: string;
  idDesigner: string;
  tema: string | null;
  status: z.infer<typeof solicitacaoStatusEnum>;
  dataCriacao: string;
  prazoPrimeiraVersao: string;
}

const clienteEmbedSchema = z.object({ nome: z.string() });

const solicitacaoListRowSchema = z.object({
  id_solicitacao: z.number(),
  id_cliente: z.number(),
  id_designer: z.string(),
  tema: z.string().nullable(),
  status: solicitacaoStatusEnum,
  data_criacao: z.string(),
  prazo_primeira_versao: z.string(),
  cliente: z
    .union([clienteEmbedSchema, z.array(clienteEmbedSchema), z.null()])
    .transform((value) => (Array.isArray(value) ? (value[0] ?? null) : value)),
});

function toSummary(row: z.infer<typeof solicitacaoListRowSchema>): SolicitacaoSummary {
  return {
    id: row.id_solicitacao,
    idCliente: row.id_cliente,
    clienteNome: row.cliente?.nome ?? '—',
    idDesigner: row.id_designer,
    tema: row.tema,
    status: row.status,
    dataCriacao: row.data_criacao,
    prazoPrimeiraVersao: row.prazo_primeira_versao,
  };
}

/** RF005/RN44: listagem/filtro por cliente e status; ownership via RLS (id_designer = auth.uid()). */
export async function listSolicitacoes(
  client: SupabaseClient,
  filters: ListSolicitacoesQuery,
): Promise<{ items: SolicitacaoSummary[]; total: number }> {
  let query = client
    .from('solicitacao')
    .select(
      'id_solicitacao, id_cliente, id_designer, tema, status, data_criacao, prazo_primeira_versao, cliente(nome)',
      { count: 'exact' },
    )
    .order('data_criacao', { ascending: false });

  if (filters.status) query = query.eq('status', filters.status);
  if (filters.idCliente) query = query.eq('id_cliente', filters.idCliente);
  if (filters.dataInicio) query = query.gte('data_criacao', filters.dataInicio);
  if (filters.dataFim) query = query.lt('data_criacao', nextDay(filters.dataFim));

  const from = (filters.page - 1) * filters.pageSize;
  const to = from + filters.pageSize - 1;

  const result: unknown = await query.range(from, to);
  const { data, error, count } = result as {
    data: unknown;
    error: { message: string } | null;
    count: number | null;
  };
  if (error) throw new Error(`Falha ao listar solicitações: ${error.message}`);

  const rows = z.array(solicitacaoListRowSchema).parse(data ?? []);
  return { items: rows.map(toSummary), total: count ?? rows.length };
}

export interface SolicitacaoDetail extends SolicitacaoSummary {
  descricao: string | null;
  cores: string | null;
  observacoes: string | null;
}

const solicitacaoDetailRowSchema = solicitacaoListRowSchema.extend({
  descricao: z.string().nullable(),
  cores: z.string().nullable(),
  observacoes: z.string().nullable(),
});

export async function getSolicitacaoDetail(
  client: SupabaseClient,
  id: number,
): Promise<SolicitacaoDetail | null> {
  const result: unknown = await client
    .from('solicitacao')
    .select(
      'id_solicitacao, id_cliente, id_designer, tema, cores, observacoes, descricao, status, data_criacao, prazo_primeira_versao, cliente(nome)',
    )
    .eq('id_solicitacao', id)
    .maybeSingle();

  const { data, error } = result as { data: unknown; error: { message: string } | null };
  if (error) throw new Error(`Falha ao buscar solicitação: ${error.message}`);
  if (!data) return null;

  const row = solicitacaoDetailRowSchema.parse(data);
  return {
    ...toSummary(row),
    descricao: row.descricao,
    cores: row.cores,
    observacoes: row.observacoes,
  };
}

const historicoRowSchema = z.object({
  id_historico: z.number(),
  acao: z.string(),
  status_anterior: z.string().nullable(),
  status_novo: z.string().nullable(),
  data_hora: z.string(),
});
export type HistoricoEntry = z.infer<typeof historicoRowSchema>;

export async function listHistoricoSolicitacao(
  client: SupabaseClient,
  idSolicitacao: number,
): Promise<HistoricoEntry[]> {
  const result: unknown = await client
    .from('historico_solicitacao')
    .select('id_historico, acao, status_anterior, status_novo, data_hora')
    .eq('id_solicitacao', idSolicitacao)
    .order('data_hora', { ascending: true });
  const { data, error } = result as { data: unknown; error: { message: string } | null };
  if (error) throw new Error(`Falha ao buscar histórico: ${error.message}`);
  return z.array(historicoRowSchema).parse(data ?? []);
}

const versaoArteRowSchema = z.object({
  id_versao: z.number(),
  numero_versao: z.number(),
  formato: z.string(),
  data_envio: z.string(),
  observacoes: z.string().nullable(),
});
export type VersaoArteEntry = z.infer<typeof versaoArteRowSchema>;

/**
 * RF005 ("detalhes com... versões"). `arquivo_url` é deliberadamente
 * omitido aqui — o download seguro via URL assinada é responsabilidade da
 * Fase 8 (RF007/RF008, seção 12.5), não deste endpoint de detalhe geral.
 */
export async function listVersoesArte(
  client: SupabaseClient,
  idSolicitacao: number,
): Promise<VersaoArteEntry[]> {
  const result: unknown = await client
    .from('versao_arte')
    .select('id_versao, numero_versao, formato, data_envio, observacoes')
    .eq('id_solicitacao', idSolicitacao)
    .order('numero_versao', { ascending: true });
  const { data, error } = result as { data: unknown; error: { message: string } | null };
  if (error) throw new Error(`Falha ao buscar versões: ${error.message}`);
  return z.array(versaoArteRowSchema).parse(data ?? []);
}

const respostaEntrySchema = z.object({
  pergunta: z.string(),
  resposta: z.string(),
  data_hora: z.string(),
});
export type RespostaEntry = z.infer<typeof respostaEntrySchema>;

/** RF005 ("detalhes com atendimento..."): respostas do questionário WhatsApp (RF004) que originou a solicitação. */
export async function listRespostasBySolicitacao(
  client: SupabaseClient,
  idSolicitacao: number,
): Promise<RespostaEntry[]> {
  const atendimentoResult: unknown = await client
    .from('atendimento')
    .select('id_atendimento')
    .eq('id_solicitacao', idSolicitacao)
    .maybeSingle();
  const { data: atendimentoData, error: atendimentoError } = atendimentoResult as {
    data: unknown;
    error: { message: string } | null;
  };
  if (atendimentoError) throw new Error(`Falha ao buscar atendimento: ${atendimentoError.message}`);
  if (!atendimentoData) return [];

  const idAtendimento = z.object({ id_atendimento: z.number() }).parse(atendimentoData).id_atendimento;

  const result: unknown = await client
    .from('resposta_cliente')
    .select('pergunta, resposta, data_hora')
    .eq('id_atendimento', idAtendimento)
    .order('id_resposta', { ascending: true });
  const { data, error } = result as { data: unknown; error: { message: string } | null };
  if (error) throw new Error(`Falha ao buscar respostas: ${error.message}`);
  return z.array(respostaEntrySchema).parse(data ?? []);
}

const ajusteRowSchema = z.object({
  id_ajuste: z.number(),
  descricao: z.string(),
  observacoes: z.string().nullable(),
  imagem_referencia_url: z.string().nullable(),
  created_at: z.string(),
  avaliacao: z.union([
    z.object({ versao_arte: z.union([z.object({ numero_versao: z.number() }), z.array(z.object({ numero_versao: z.number() })), z.null()]) }),
    z.array(z.object({ versao_arte: z.union([z.object({ numero_versao: z.number() }), z.array(z.object({ numero_versao: z.number() })), z.null()]) })),
    z.null(),
  ]),
});

export interface AjusteEntry {
  idAjuste: number;
  numeroVersao: number | null;
  descricao: string;
  observacoes: string | null;
  imagemReferenciaUrl: string | null;
  createdAt: string;
}

/**
 * RF010: "Designer deve visualizar claramente o solicitado" — descrição do
 * ajuste (RN21) do cliente, associada à versão avaliada, para consulta pelo
 * designer no detalhe da solicitação (RF005).
 */
export async function listAjustesBySolicitacao(
  client: SupabaseClient,
  idSolicitacao: number,
): Promise<AjusteEntry[]> {
  const result: unknown = await client
    .from('ajuste')
    .select(
      'id_ajuste, descricao, observacoes, imagem_referencia_url, created_at, avaliacao!inner(versao_arte!inner(id_solicitacao, numero_versao))',
    )
    .eq('avaliacao.versao_arte.id_solicitacao', idSolicitacao)
    .order('created_at', { ascending: true });
  const { data, error } = result as { data: unknown; error: { message: string } | null };
  if (error) throw new Error(`Falha ao buscar ajustes: ${error.message}`);

  const rows = z.array(ajusteRowSchema).parse(data ?? []);
  return rows.map((row) => {
    const avaliacao = Array.isArray(row.avaliacao) ? (row.avaliacao[0] ?? null) : row.avaliacao;
    const versaoArte = avaliacao
      ? Array.isArray(avaliacao.versao_arte)
        ? (avaliacao.versao_arte[0] ?? null)
        : avaliacao.versao_arte
      : null;
    return {
      idAjuste: row.id_ajuste,
      numeroVersao: versaoArte?.numero_versao ?? null,
      descricao: row.descricao,
      observacoes: row.observacoes,
      imagemReferenciaUrl: row.imagem_referencia_url,
      createdAt: row.created_at,
    };
  });
}

const ajusteReferenciaRowSchema = z.object({
  imagem_referencia_url: z.string().nullable(),
  avaliacao: z.union([
    z.object({ versao_arte: z.union([z.object({ id_solicitacao: z.number() }), z.array(z.object({ id_solicitacao: z.number() })), z.null()]) }),
    z.array(z.object({ versao_arte: z.union([z.object({ id_solicitacao: z.number() }), z.array(z.object({ id_solicitacao: z.number() })), z.null()]) })),
    z.null(),
  ]),
});

/**
 * RF010 + seção 12.5: busca o path privado da imagem de referência do
 * ajuste filtrando por `id_ajuste` **e** `id_solicitacao` simultaneamente
 * (mesmo padrão anti-IDOR de `getVersaoArteByIdAndSolicitacao`, Fase 8).
 */
export async function getAjusteReferenciaPath(
  client: SupabaseClient,
  idAjuste: number,
  idSolicitacao: number,
): Promise<string | null> {
  const result: unknown = await client
    .from('ajuste')
    .select('imagem_referencia_url, avaliacao!inner(versao_arte!inner(id_solicitacao))')
    .eq('id_ajuste', idAjuste)
    .eq('avaliacao.versao_arte.id_solicitacao', idSolicitacao)
    .maybeSingle();
  const { data, error } = result as { data: unknown; error: { message: string } | null };
  if (error) throw new Error(`Falha ao buscar referência do ajuste: ${error.message}`);
  if (!data) return null;

  const row = ajusteReferenciaRowSchema.parse(data);
  return row.imagem_referencia_url;
}

/**
 * Seção 12.1/12.4: mesmo padrão de defesa em profundidade já usado em
 * `cliente.repository.ts` — a escrita via service role também filtra por
 * `id_designer` (não só `id_solicitacao`), verificando que exatamente uma
 * linha foi afetada.
 */
export async function updateSolicitacaoFields(
  adminClient: SupabaseClient,
  id: number,
  idDesigner: string,
  changes: UpdateSolicitacaoInput,
): Promise<void> {
  const payload: Record<string, unknown> = {};
  if (changes.tema !== undefined) payload.tema = changes.tema;
  if (changes.cores !== undefined) payload.cores = changes.cores;
  if (changes.observacoes !== undefined) payload.observacoes = changes.observacoes;
  if (changes.descricao !== undefined) payload.descricao = changes.descricao;

  const result: unknown = await adminClient
    .from('solicitacao')
    .update(payload)
    .eq('id_solicitacao', id)
    .eq('id_designer', idDesigner)
    .select('id_solicitacao');
  const { data, error } = result as { data: unknown[] | null; error: { message: string } | null };
  if (error) throw new Error(`Falha ao atualizar solicitação: ${error.message}`);
  if (!data || data.length === 0) throw new NotFoundError('Solicitação não encontrada.');
}

/** RF006/RN11/RN12: recalcula e persiste designer.bloqueado; retorna o estado atual. */
export async function syncDesignerBloqueio(
  adminClient: SupabaseClient,
  idDesigner: string,
): Promise<boolean> {
  const result: unknown = await adminClient.rpc('sync_designer_bloqueio', {
    p_id_designer: idDesigner,
  });
  const { data, error } = result as { data: unknown; error: { message: string; code?: string } | null };
  if (error) {
    if (error.code === PG_NO_DATA_FOUND) {
      throw new NotFoundError('Designer não encontrado.');
    }
    throw new Error(`Falha ao sincronizar bloqueio do designer: ${error.message}`);
  }
  return z.boolean().parse(data);
}

export async function getSolicitacaoCore(
  client: SupabaseClient,
  id: number,
): Promise<{ idSolicitacao: number; idDesigner: string; status: string }> {
  const result: unknown = await client
    .from('solicitacao')
    .select('id_solicitacao, id_designer, status')
    .eq('id_solicitacao', id)
    .maybeSingle();

  const { data, error } = result as { data: unknown; error: { message: string } | null };
  if (error) {
    throw new Error(`Falha ao buscar solicitação: ${error.message}`);
  }
  if (!data) {
    throw new NotFoundError('Solicitação não encontrada.');
  }

  const row = solicitacaoRowSchema.parse(data);
  return { idSolicitacao: row.id_solicitacao, idDesigner: row.id_designer, status: row.status };
}

const PG_NO_DATA_FOUND = 'P0002';
const PG_RAISE_EXCEPTION = 'P0001';

/**
 * RF016/RN44/RN45/RN47/RN48: chama a função atômica que valida o designer
 * de destino (ativo) e grava `solicitacao.id_designer` + `historico_solicitacao`
 * numa única transação. A função também é a última linha de defesa (RF016
 * já foi checado no service antes de chegar aqui) — por isso traduzimos os
 * códigos de erro dela em vez de deixar sempre um 500 genérico.
 */
export async function reassignSolicitacaoRpc(
  adminClient: SupabaseClient,
  params: { idSolicitacao: number; novoDesignerId: string; atorId: string },
): Promise<void> {
  const result: unknown = await adminClient.rpc('reassign_solicitacao', {
    p_id_solicitacao: params.idSolicitacao,
    p_novo_designer_id: params.novoDesignerId,
    p_ator_id: params.atorId,
  });

  const { error } = result as { error: { message: string; code?: string } | null };
  if (!error) return;

  if (error.code === PG_NO_DATA_FOUND) {
    throw new NotFoundError(error.message);
  }
  if (error.code === PG_RAISE_EXCEPTION) {
    throw new ConflictError(error.message);
  }
  throw new Error(`Falha ao reatribuir solicitação: ${error.message}`);
}
