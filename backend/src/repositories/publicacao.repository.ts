import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { ConflictError, NotFoundError } from '../lib/errors.js';

const PG_NOT_FOUND = 'P0002';
const PG_STATUS_INVALID = 'P0001';

function mapPublicacaoRpcError(error: { message: string; code?: string }): never {
  if (error.code === PG_NOT_FOUND) throw new NotFoundError('Agendamento não encontrado.');
  if (error.code === PG_STATUS_INVALID) throw new ConflictError(error.message);
  throw new Error(`Falha ao registrar publicação: ${error.message}`);
}

const agendamentoVencidoRowSchema = z.object({
  id_agendamento: z.number(),
  id_solicitacao: z.number(),
  legenda: z.string().nullable(),
});

export interface AgendamentoVencido {
  idAgendamento: number;
  idSolicitacao: number;
  legenda: string | null;
}

/** RF014/RN32: agendamentos ativos cujo horário planejado já passou (job de publicação). */
export async function listAgendamentosVencidos(adminClient: SupabaseClient): Promise<AgendamentoVencido[]> {
  const result: unknown = await adminClient
    .from('agendamento_publicacao')
    .select('id_agendamento, id_solicitacao, legenda')
    .eq('status', 'Agendado')
    .lte('data_hora_publicacao', new Date().toISOString());
  const { data, error } = result as { data: unknown; error: { message: string } | null };
  if (error) throw new Error(`Falha ao buscar agendamentos vencidos: ${error.message}`);

  const rows = z.array(agendamentoVencidoRowSchema).parse(data ?? []);
  return rows.map((row) => ({
    idAgendamento: row.id_agendamento,
    idSolicitacao: row.id_solicitacao,
    legenda: row.legenda,
  }));
}

const versaoAtualRowSchema = z.object({
  id_versao: z.number(),
  formato: z.string(),
  arquivo_url: z.string(),
});

export interface VersaoArteAtual {
  idVersao: number;
  formato: string;
  arquivoUrl: string;
}

/** RF014: versão mais recente da solicitação — é sempre a que foi aprovada/agendada. */
export async function getVersaoArteAtualDaSolicitacao(
  adminClient: SupabaseClient,
  idSolicitacao: number,
): Promise<VersaoArteAtual | null> {
  const result: unknown = await adminClient
    .from('versao_arte')
    .select('id_versao, formato, arquivo_url')
    .eq('id_solicitacao', idSolicitacao)
    .order('numero_versao', { ascending: false })
    .limit(1)
    .maybeSingle();
  const { data, error } = result as { data: unknown; error: { message: string } | null };
  if (error) throw new Error(`Falha ao buscar versão atual: ${error.message}`);
  if (!data) return null;

  const row = versaoAtualRowSchema.parse(data);
  return { idVersao: row.id_versao, formato: row.formato, arquivoUrl: row.arquivo_url };
}

const solicitacaoClienteRowSchema = z.object({ id_cliente: z.number() });

/** RF014/ADR 0005: id_cliente da solicitação — necessário para resolver a conexão Instagram daquele cliente específico. */
export async function getClienteIdDaSolicitacao(
  adminClient: SupabaseClient,
  idSolicitacao: number,
): Promise<number | null> {
  const result: unknown = await adminClient
    .from('solicitacao')
    .select('id_cliente')
    .eq('id_solicitacao', idSolicitacao)
    .maybeSingle();
  const { data, error } = result as { data: unknown; error: { message: string } | null };
  if (error) throw new Error(`Falha ao buscar cliente da solicitação: ${error.message}`);
  if (!data) return null;

  return solicitacaoClienteRowSchema.parse(data).id_cliente;
}

/**
 * RF014/RN29/Gate G: reserva atomicamente o agendamento antes de chamar a
 * Instagram API — evita publicar duas vezes quando o job roda de forma
 * sobreposta (cron atrasado, retry). `false` significa que outra execução
 * já reservou/publicou; o chamador deve tratar como pendente, não como erro.
 */
export async function claimAgendamentoParaPublicacao(
  adminClient: SupabaseClient,
  idAgendamento: number,
): Promise<boolean> {
  const result: unknown = await adminClient.rpc('claim_agendamento_publicacao', {
    p_id_agendamento: idAgendamento,
  });
  const { data, error } = result as { data: unknown; error: { message: string } | null };
  if (error) throw new Error(`Falha ao reservar agendamento para publicação: ${error.message}`);
  return data === true;
}

/** RF014/RN32-RN35: registra publicação bem-sucedida (RPC atômica). `atorId` é `null` para automática. */
export async function registerPublicacaoSucesso(
  adminClient: SupabaseClient,
  params: { idAgendamento: number; tipo: 'automatica' | 'manual'; atorId: string | null },
): Promise<void> {
  const result: unknown = await adminClient.rpc('register_publicacao_sucesso', {
    p_id_agendamento: params.idAgendamento,
    p_tipo: params.tipo,
    p_ator_id: params.atorId,
  });
  const { error } = result as { error: { message: string; code?: string } | null };
  if (error) mapPublicacaoRpcError(error);
}

/** RF014: registra tentativa de publicação automática falhada (RPC atômica) — nunca marca como publicado. */
export async function registerPublicacaoFalha(
  adminClient: SupabaseClient,
  params: { idAgendamento: number },
): Promise<void> {
  const result: unknown = await adminClient.rpc('register_publicacao_falha', {
    p_id_agendamento: params.idAgendamento,
  });
  const { error } = result as { error: { message: string; code?: string } | null };
  if (error) mapPublicacaoRpcError(error);
}
