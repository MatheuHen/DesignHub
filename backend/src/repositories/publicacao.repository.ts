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
  instagram_media_id_pendente: z.string().nullable(),
  instagram_permalink_pendente: z.string().nullable(),
});

export interface AgendamentoVencido {
  idAgendamento: number;
  idSolicitacao: number;
  legenda: string | null;
  /**
   * Auditoria (achado HIGH — janela de publicação duplicada): quando não
   * nulo, uma tentativa anterior já publicou de fato no Instagram mas caiu
   * antes de `registerPublicacaoSucesso` confirmar. O chamador deve pular a
   * chamada à Instagram API e ir direto para o registro, usando este
   * permalink — nunca publicar de novo.
   */
  instagramMediaIdPendente: string | null;
  instagramPermalinkPendente: string | null;
}

/** RF014/RN32: agendamentos ativos cujo horário planejado já passou (job de publicação). */
export async function listAgendamentosVencidos(adminClient: SupabaseClient): Promise<AgendamentoVencido[]> {
  const result: unknown = await adminClient
    .from('agendamento_publicacao')
    .select('id_agendamento, id_solicitacao, legenda, instagram_media_id_pendente, instagram_permalink_pendente')
    .eq('status', 'Agendado')
    .lte('data_hora_publicacao', new Date().toISOString());
  const { data, error } = result as { data: unknown; error: { message: string } | null };
  if (error) throw new Error(`Falha ao buscar agendamentos vencidos: ${error.message}`);

  const rows = z.array(agendamentoVencidoRowSchema).parse(data ?? []);
  return rows.map((row) => ({
    idAgendamento: row.id_agendamento,
    idSolicitacao: row.id_solicitacao,
    legenda: row.legenda,
    instagramMediaIdPendente: row.instagram_media_id_pendente,
    instagramPermalinkPendente: row.instagram_permalink_pendente,
  }));
}

const agendamentoParaNotificarRowSchema = z.object({
  id_agendamento: z.number(),
  id_solicitacao: z.number(),
  data_publicacao: z.string(),
  horario: z.string(),
});

export interface AgendamentoParaNotificar {
  idAgendamento: number;
  idSolicitacao: number;
  dataPublicacao: string;
  horario: string;
}

/**
 * Item 9: "reivindica" (marca `notificado_2h = true`) os agendamentos cujo
 * horário cai dentro da janela informada — um único UPDATE...RETURNING é
 * atômico no Postgres/PostgREST, então dois ciclos do cron rodando quase
 * juntos nunca reivindicam a mesma linha duas vezes (mesmo sem lock
 * explícito). O envio do push em si é best-effort e nunca reprocessado pelo
 * mesmo agendamento, mesmo se falhar.
 */
export async function claimAgendamentosParaNotificar(
  adminClient: SupabaseClient,
  windowStart: string,
  windowEnd: string,
): Promise<AgendamentoParaNotificar[]> {
  const result: unknown = await adminClient
    .from('agendamento_publicacao')
    .update({ notificado_2h: true })
    .eq('status', 'Agendado')
    .eq('notificado_2h', false)
    .gte('data_hora_publicacao', windowStart)
    .lte('data_hora_publicacao', windowEnd)
    .select('id_agendamento, id_solicitacao, data_publicacao, horario');
  const { data, error } = result as { data: unknown; error: { message: string } | null };
  if (error) throw new Error(`Falha ao reivindicar agendamentos para notificar: ${error.message}`);

  const rows = z.array(agendamentoParaNotificarRowSchema).parse(data ?? []);
  return rows.map((row) => ({
    idAgendamento: row.id_agendamento,
    idSolicitacao: row.id_solicitacao,
    dataPublicacao: row.data_publicacao,
    horario: row.horario,
  }));
}

const versaoAtualRowSchema = z.object({
  id_versao: z.number(),
  numero_versao: z.number(),
  formato: z.string(),
  arquivo_url: z.string(),
});

export interface VersaoArteAtual {
  idVersao: number;
  numeroVersao: number;
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
    .select('id_versao, numero_versao, formato, arquivo_url')
    .eq('id_solicitacao', idSolicitacao)
    .order('numero_versao', { ascending: false })
    .limit(1)
    .maybeSingle();
  const { data, error } = result as { data: unknown; error: { message: string } | null };
  if (error) throw new Error(`Falha ao buscar versão atual: ${error.message}`);
  if (!data) return null;

  const row = versaoAtualRowSchema.parse(data);
  return { idVersao: row.id_versao, numeroVersao: row.numero_versao, formato: row.formato, arquivoUrl: row.arquivo_url };
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

/**
 * Auditoria (achado HIGH — janela de publicação duplicada): grava a marca de
 * recuperação imediatamente após o sucesso real da chamada à Instagram API,
 * antes de qualquer outra operação que possa falhar. Se o processo cair
 * logo em seguida, a próxima tentativa detecta a marca e não republica.
 */
export async function setInstagramMediaPendente(
  adminClient: SupabaseClient,
  idAgendamento: number,
  mediaId: string,
  permalink: string | null,
): Promise<void> {
  const result: unknown = await adminClient.rpc('set_instagram_media_pendente', {
    p_id_agendamento: idAgendamento,
    p_media_id: mediaId,
    p_permalink: permalink,
  });
  const { error } = result as { error: { message: string } | null };
  if (error) throw new Error(`Falha ao gravar marca de recuperação da publicação: ${error.message}`);
}

/**
 * RF014/RN32-RN35: registra publicação bem-sucedida (RPC atômica). `atorId`
 * é `null` para automática. Item 9.1: `permalink` é melhor esforço, sempre
 * `null` em manual (a Meta não é chamada nesse caminho).
 */
export async function registerPublicacaoSucesso(
  adminClient: SupabaseClient,
  params: { idAgendamento: number; tipo: 'automatica' | 'manual'; atorId: string | null; permalink?: string | null },
): Promise<void> {
  const result: unknown = await adminClient.rpc('register_publicacao_sucesso', {
    p_id_agendamento: params.idAgendamento,
    p_tipo: params.tipo,
    p_ator_id: params.atorId,
    p_permalink: params.permalink ?? null,
  });
  const { error } = result as { error: { message: string; code?: string } | null };
  if (error) mapPublicacaoRpcError(error);
}

const publicacaoRowSchema = z.object({
  id_publicacao: z.number(),
  data_publicada: z.string(),
  tipo: z.enum(['automatica', 'manual']),
  permalink: z.string().nullable(),
  comprovante_url: z.string().nullable(),
  versao_arte: z.union([
    z.object({ numero_versao: z.number() }),
    z.array(z.object({ numero_versao: z.number() })),
    z.null(),
  ]),
});

export interface PublicacaoInfo {
  idPublicacao: number;
  dataPublicada: string;
  tipo: 'automatica' | 'manual';
  permalink: string | null;
  comprovanteUrl: string | null;
  numeroVersao: number | null;
}

/**
 * RF014/item 9.1/9.3: dados da publicação concluída da solicitação (RF005
 * "detalhes com... status") — sempre a mais recente, para cobrir o caso raro
 * de reagendamento após um `agendamento_publicacao` cancelado/expirado ter
 * ficado com `publicacao` de uma tentativa anterior.
 */
export async function getPublicacaoBySolicitacao(
  client: SupabaseClient,
  idSolicitacao: number,
): Promise<PublicacaoInfo | null> {
  const result: unknown = await client
    .from('publicacao')
    .select(
      'id_publicacao, data_publicada, tipo, permalink, comprovante_url, versao_arte(numero_versao), agendamento_publicacao!inner(id_solicitacao)',
    )
    .eq('agendamento_publicacao.id_solicitacao', idSolicitacao)
    .order('data_publicada', { ascending: false })
    .limit(1)
    .maybeSingle();
  const { data, error } = result as { data: unknown; error: { message: string } | null };
  if (error) throw new Error(`Falha ao buscar publicação: ${error.message}`);
  if (!data) return null;

  const row = publicacaoRowSchema.parse(data);
  const versaoArte = Array.isArray(row.versao_arte) ? (row.versao_arte[0] ?? null) : row.versao_arte;
  return {
    idPublicacao: row.id_publicacao,
    dataPublicada: row.data_publicada,
    tipo: row.tipo,
    permalink: row.permalink,
    comprovanteUrl: row.comprovante_url,
    numeroVersao: versaoArte?.numero_versao ?? null,
  };
}

/**
 * Item 14 (rodada correções): reivindica atomicamente o direito de enviar o
 * aviso automático "ARTE PUBLICADA!" — um único UPDATE...WHERE IS
 * NULL...RETURNING é atômico por linha no PostgREST, então duas chamadas
 * concorrentes (por qualquer motivo: job sobreposto, retry de
 * infraestrutura) nunca conseguem reivindicar a mesma publicação duas
 * vezes. `force=true` (reenvio manual explícito) sempre atualiza a marca e
 * retorna true, sem checar se já foi enviada antes — é uma ação humana
 * deliberada, não deve ser bloqueada pela idempotência do envio automático.
 */
export async function claimNotificacaoPublicacao(
  adminClient: SupabaseClient,
  idPublicacao: number,
  options: { force?: boolean | undefined } = {},
): Promise<boolean> {
  let query = adminClient.from('publicacao').update({ notificado_arte_publicada_em: new Date().toISOString() });
  query = query.eq('id_publicacao', idPublicacao);
  if (!options.force) {
    query = query.is('notificado_arte_publicada_em', null);
  }
  const result: unknown = await query.select('id_publicacao');
  const { data, error } = result as { data: unknown[] | null; error: { message: string } | null };
  if (error) throw new Error(`Falha ao reivindicar aviso de publicação: ${error.message}`);
  return (data?.length ?? 0) > 0;
}

/** Item 9.3: vincula o comprovante/print (path privado no Storage) à publicação já concluída. */
export async function setPublicacaoComprovante(
  adminClient: SupabaseClient,
  idPublicacao: number,
  comprovanteUrl: string,
): Promise<void> {
  const result: unknown = await adminClient
    .from('publicacao')
    .update({ comprovante_url: comprovanteUrl })
    .eq('id_publicacao', idPublicacao);
  const { error } = result as { error: { message: string } | null };
  if (error) throw new Error(`Falha ao vincular comprovante à publicação: ${error.message}`);
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
