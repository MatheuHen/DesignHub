import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { ConflictError, ExpiredLinkError, NotFoundError, ValidationError } from '../lib/errors.js';

const PG_NOT_FOUND_OR_REVOKED = 'P0002';
const PG_STATUS_INVALID = 'P0001';
const PG_EXPIRED = 'P0003';
const PG_ALREADY_USED = 'P0004';
/** `create_agendamento_cliente` reaproveita o código P0004 para "data/horário inválidos", não "link já usado". */
const PG_AGENDAMENTO_DATA_INVALIDA = 'P0004';

const generateTokenRowSchema = z.object({ id_versao: z.number(), numero_versao: z.number() });

/** RF009: gera (RPC atômica) um novo token de avaliação para a versão pendente da solicitação. */
export async function generateAvaliacaoLinkToken(
  adminClient: SupabaseClient,
  params: { idSolicitacao: number; idDesigner: string; tokenHash: string; expiresAt: Date },
): Promise<{ idVersao: number; numeroVersao: number }> {
  const result: unknown = await adminClient.rpc('generate_avaliacao_link_token', {
    p_id_solicitacao: params.idSolicitacao,
    p_id_designer: params.idDesigner,
    p_token_hash: params.tokenHash,
    p_expires_at: params.expiresAt.toISOString(),
  });
  const { data, error } = result as {
    data: unknown;
    error: { message: string; code?: string } | null;
  };

  if (error) {
    if (error.code === PG_NOT_FOUND_OR_REVOKED) throw new NotFoundError('Solicitação não encontrada.');
    if (error.code === PG_STATUS_INVALID) {
      throw new ConflictError('Solicitação não está aguardando avaliação no momento.');
    }
    throw new Error(`Falha ao gerar link de avaliação: ${error.message}`);
  }

  const rows = z.array(generateTokenRowSchema).parse(data ?? []);
  const row = rows[0];
  if (!row) throw new Error('Falha ao gerar link de avaliação: resposta vazia da função.');
  return { idVersao: row.id_versao, numeroVersao: row.numero_versao };
}

const linkPreviewRowSchema = z.object({
  expires_at: z.string(),
  revoked_at: z.string().nullable(),
  used_at: z.string().nullable(),
  id_versao: z.number(),
});

export type AvaliacaoLinkState = 'valid' | 'invalid' | 'expired' | 'used';

/**
 * RF009: leitura só-consulta (sem lock — nada é mutado aqui) para a tela
 * pública de avaliação decidir o que mostrar. O estado é resolvido no
 * mesmo formato de três buckets amigáveis usado por `submit_avaliacao`
 * (seção 12.1: "tratado de modo seguro e amigável").
 */
export async function getAvaliacaoLinkState(
  adminClient: SupabaseClient,
  tokenHash: string,
): Promise<{ state: AvaliacaoLinkState; idVersao: number | null }> {
  const result: unknown = await adminClient
    .from('avaliacao_link_token')
    .select('expires_at, revoked_at, used_at, id_versao')
    .eq('token_hash', tokenHash)
    .maybeSingle();
  const { data, error } = result as { data: unknown; error: { message: string } | null };
  if (error) throw new Error(`Falha ao consultar link de avaliação: ${error.message}`);
  if (!data) return { state: 'invalid', idVersao: null };

  const row = linkPreviewRowSchema.parse(data);
  if (row.revoked_at) return { state: 'invalid', idVersao: null };
  // RN13/RN14: um link já usado continua identificando a solicitação para
  // a visão de acompanhamento somente-leitura (não permite nova decisão,
  // isso é reforçado em `submit_avaliacao`/`P0004`) — por isso `idVersao`
  // não é mais ocultado neste estado, diferente de `invalid`/`expired`.
  if (row.used_at) return { state: 'used', idVersao: row.id_versao };
  if (new Date(row.expires_at).getTime() < Date.now()) return { state: 'expired', idVersao: null };
  return { state: 'valid', idVersao: row.id_versao };
}

/**
 * Item 7/7.1 (rodada final): marca que a WhatsApp Cloud API ACEITOU o envio
 * da mensagem contendo o link — nunca marcado só porque o token foi gerado
 * ("link gerado" ≠ "link enviado"). Chamado pelo service só depois de
 * `sendTextMessage` resolver com sucesso; falha de envio nunca chama isto,
 * então o histórico mostra corretamente "falha no envio" (nunca um falso
 * "enviado").
 */
export async function marcarLinkAvaliacaoNotificado(adminClient: SupabaseClient, tokenHash: string): Promise<void> {
  const result: unknown = await adminClient
    .from('avaliacao_link_token')
    .update({ whatsapp_notificado_em: new Date().toISOString() })
    .eq('token_hash', tokenHash);
  const { error } = result as { error: { message: string } | null };
  if (error) throw new Error(`Falha ao registrar notificação do link de avaliação: ${error.message}`);
}

export type LinkAvaliacaoSituacao = 'aguardando_resposta' | 'respondido' | 'expirado' | 'revogado' | 'falha_envio';

export interface LinkAvaliacaoInfo {
  ultimoEnvioEm: string;
  whatsappNotificadoEm: string | null;
  situacao: LinkAvaliacaoSituacao;
  validoAte: string;
  /** Quantas vezes um link foi gerado para a versão atualmente aguardando avaliação (1 = nunca reenviado). */
  quantidadeEnvios: number;
}

const linkAvaliacaoAtualRowSchema = z.object({
  created_at: z.string(),
  expires_at: z.string(),
  revoked_at: z.string().nullable(),
  used_at: z.string().nullable(),
  whatsapp_notificado_em: z.string().nullable(),
});

function resolveLinkAvaliacaoSituacao(row: z.infer<typeof linkAvaliacaoAtualRowSchema>): LinkAvaliacaoSituacao {
  if (row.used_at) return 'respondido';
  if (row.revoked_at) return 'revogado';
  if (new Date(row.expires_at).getTime() < Date.now()) return 'expirado';
  if (!row.whatsapp_notificado_em) return 'falha_envio';
  return 'aguardando_resposta';
}

/**
 * Item 7 (rodada final): histórico do link de avaliação da versão
 * atualmente pendente (a mais recente da solicitação) — "Último envio",
 * situação real e quantidade de tentativas. `null` quando a solicitação
 * ainda não tem nenhuma versão enviada (nunca houve link a gerar).
 */
export async function getLinkAvaliacaoAtual(
  adminClient: SupabaseClient,
  idSolicitacao: number,
): Promise<LinkAvaliacaoInfo | null> {
  const versaoResult: unknown = await adminClient
    .from('versao_arte')
    .select('id_versao')
    .eq('id_solicitacao', idSolicitacao)
    .order('numero_versao', { ascending: false })
    .limit(1)
    .maybeSingle();
  const { data: versaoData, error: versaoError } = versaoResult as {
    data: unknown;
    error: { message: string } | null;
  };
  if (versaoError) throw new Error(`Falha ao buscar versão da solicitação: ${versaoError.message}`);
  if (!versaoData) return null;
  const { id_versao: idVersao } = z.object({ id_versao: z.number() }).parse(versaoData);

  const tokensResult: unknown = await adminClient
    .from('avaliacao_link_token')
    .select('created_at, expires_at, revoked_at, used_at, whatsapp_notificado_em')
    .eq('id_versao', idVersao)
    .order('created_at', { ascending: false });
  const { data: tokensData, error: tokensError } = tokensResult as { data: unknown; error: { message: string } | null };
  if (tokensError) throw new Error(`Falha ao buscar histórico do link de avaliação: ${tokensError.message}`);

  const tokens = z.array(linkAvaliacaoAtualRowSchema).parse(tokensData ?? []);
  const ultimo = tokens[0];
  if (!ultimo) return null;

  return {
    ultimoEnvioEm: ultimo.created_at,
    whatsappNotificadoEm: ultimo.whatsapp_notificado_em,
    situacao: resolveLinkAvaliacaoSituacao(ultimo),
    validoAte: ultimo.expires_at,
    quantidadeEnvios: tokens.length,
  };
}

const versaoPreviewRowSchema = z.object({
  id_solicitacao: z.number(),
  numero_versao: z.number(),
  formato: z.string(),
  observacoes: z.string().nullable(),
  arquivo_url: z.string(),
  solicitacao: z.union([
    z.object({ tema: z.string().nullable(), id_cliente: z.number() }),
    z.array(z.object({ tema: z.string().nullable(), id_cliente: z.number() })),
    z.null(),
  ]),
});

export interface VersaoArtePreview {
  idSolicitacao: number;
  numeroVersao: number;
  formato: string;
  observacoes: string | null;
  arquivoUrl: string;
  tema: string | null;
  /** Rodada correções (item 8): necessário para checar conexão de Instagram antes de oferecer "agendar automaticamente". */
  idCliente: number;
}

/**
 * RF009 ("visualiza a arte... como foco principal"): dados mínimos da
 * versão para a tela pública — nunca inclui identificação do
 * cliente/designer (RNF010/minimização). `arquivo_url` só sai daqui para
 * virar uma URL assinada de curta duração no service, nunca é devolvido cru
 * ao navegador.
 */
export async function getVersaoArtePreview(
  adminClient: SupabaseClient,
  idVersao: number,
): Promise<VersaoArtePreview | null> {
  const result: unknown = await adminClient
    .from('versao_arte')
    .select('id_solicitacao, numero_versao, formato, observacoes, arquivo_url, solicitacao(tema, id_cliente)')
    .eq('id_versao', idVersao)
    .maybeSingle();
  const { data, error } = result as { data: unknown; error: { message: string } | null };
  if (error) throw new Error(`Falha ao buscar versão: ${error.message}`);
  if (!data) return null;

  const row = versaoPreviewRowSchema.parse(data);
  const solicitacao = Array.isArray(row.solicitacao) ? (row.solicitacao[0] ?? null) : row.solicitacao;
  if (!solicitacao) return null;
  return {
    idSolicitacao: row.id_solicitacao,
    numeroVersao: row.numero_versao,
    formato: row.formato,
    observacoes: row.observacoes,
    arquivoUrl: row.arquivo_url,
    tema: solicitacao.tema,
    idCliente: solicitacao.id_cliente,
  };
}

const trackingSolicitacaoRowSchema = z.object({
  id_solicitacao: z.number(),
  status: z.string(),
  tema: z.string().nullable(),
});

export interface TrackingSolicitacao {
  idSolicitacao: number;
  status: string;
  tema: string | null;
}

/** RN13: status atual da solicitação, para a visão de acompanhamento público (somente leitura). */
export async function getTrackingSolicitacaoByVersao(
  adminClient: SupabaseClient,
  idVersao: number,
): Promise<TrackingSolicitacao | null> {
  const versaoResult: unknown = await adminClient
    .from('versao_arte')
    .select('id_solicitacao')
    .eq('id_versao', idVersao)
    .maybeSingle();
  const { data: versaoData, error: versaoError } = versaoResult as {
    data: unknown;
    error: { message: string } | null;
  };
  if (versaoError) throw new Error(`Falha ao buscar versão: ${versaoError.message}`);
  if (!versaoData) return null;
  const idSolicitacao = z.object({ id_solicitacao: z.number() }).parse(versaoData).id_solicitacao;

  const result: unknown = await adminClient
    .from('solicitacao')
    .select('id_solicitacao, status, tema')
    .eq('id_solicitacao', idSolicitacao)
    .maybeSingle();
  const { data, error } = result as { data: unknown; error: { message: string } | null };
  if (error) throw new Error(`Falha ao buscar solicitação: ${error.message}`);
  if (!data) return null;

  const row = trackingSolicitacaoRowSchema.parse(data);
  return { idSolicitacao: row.id_solicitacao, status: row.status, tema: row.tema };
}

const PG_AGENDAMENTO_NOT_FOUND = 'P0002';
const PG_CANCEL_WINDOW = 'P0005';

/**
 * Item 8.4 (correções 13/09/2026): cancelamento de agendamento pelo cliente.
 * `idSolicitacao` nunca vem direto do cliente — é sempre resolvido no
 * service a partir do token opaco (via `getTrackingSolicitacaoByVersao`),
 * o que evita IDOR (seção 12.1).
 */
export async function cancelAgendamentoCliente(
  adminClient: SupabaseClient,
  idSolicitacao: number,
): Promise<void> {
  const result: unknown = await adminClient.rpc('cancel_agendamento_cliente', {
    p_id_solicitacao: idSolicitacao,
  });
  const { error } = result as { error: { message: string; code?: string } | null };
  if (!error) return;
  if (error.code === PG_AGENDAMENTO_NOT_FOUND) {
    throw new NotFoundError('Agendamento não encontrado ou já não está mais ativo.');
  }
  if (error.code === PG_CANCEL_WINDOW) {
    throw new ConflictError('Cancelamento não permitido: faltam menos de 3 horas para a publicação.');
  }
  throw new Error(`Falha ao cancelar agendamento: ${error.message}`);
}

const trackingVersaoRowSchema = z.object({
  id_versao: z.number(),
  numero_versao: z.number(),
  formato: z.string(),
  data_envio: z.string(),
  arquivo_url: z.string(),
});

export interface TrackingVersao {
  idVersao: number;
  numeroVersao: number;
  formato: string;
  dataEnvio: string;
  arquivoUrl: string;
}

/** RN14/RN18: versões acessíveis ao cliente para consulta (arquivo_url convertido em URL assinada no service). */
export async function listTrackingVersoes(
  adminClient: SupabaseClient,
  idSolicitacao: number,
): Promise<TrackingVersao[]> {
  const result: unknown = await adminClient
    .from('versao_arte')
    .select('id_versao, numero_versao, formato, data_envio, arquivo_url')
    .eq('id_solicitacao', idSolicitacao)
    .order('numero_versao', { ascending: true });
  const { data, error } = result as { data: unknown; error: { message: string } | null };
  if (error) throw new Error(`Falha ao buscar versões: ${error.message}`);

  const rows = z.array(trackingVersaoRowSchema).parse(data ?? []);
  return rows.map((row) => ({
    idVersao: row.id_versao,
    numeroVersao: row.numero_versao,
    formato: row.formato,
    dataEnvio: row.data_envio,
    arquivoUrl: row.arquivo_url,
  }));
}

const trackingHistoricoRowSchema = z.object({
  acao: z.string(),
  status_novo: z.string().nullable(),
  data_hora: z.string(),
});

export interface TrackingHistoricoEntry {
  acao: string;
  statusNovo: string | null;
  dataHora: string;
}

/** RN14: evolução da solicitação (avaliação, ajustes, aprovação, cancelamento, agendamento, publicação). */
export async function listTrackingHistorico(
  adminClient: SupabaseClient,
  idSolicitacao: number,
): Promise<TrackingHistoricoEntry[]> {
  const result: unknown = await adminClient
    .from('historico_solicitacao')
    .select('acao, status_novo, data_hora')
    .eq('id_solicitacao', idSolicitacao)
    .order('data_hora', { ascending: true });
  const { data, error } = result as { data: unknown; error: { message: string } | null };
  if (error) throw new Error(`Falha ao buscar histórico: ${error.message}`);

  const rows = z.array(trackingHistoricoRowSchema).parse(data ?? []);
  return rows.map((row) => ({ acao: row.acao, statusNovo: row.status_novo, dataHora: row.data_hora }));
}

const trackingAgendamentoRowSchema = z.object({
  data_publicacao: z.string(),
  horario: z.string(),
  status: z.string(),
});

export interface TrackingAgendamento {
  dataPublicacao: string;
  horario: string;
  status: string;
}

/** RN14: situação do agendamento — o mais recente, ativo ou não (para refletir cancelamento/publicação). */
export async function getTrackingAgendamento(
  adminClient: SupabaseClient,
  idSolicitacao: number,
): Promise<TrackingAgendamento | null> {
  const result: unknown = await adminClient
    .from('agendamento_publicacao')
    .select('data_publicacao, horario, status')
    .eq('id_solicitacao', idSolicitacao)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  const { data, error } = result as { data: unknown; error: { message: string } | null };
  if (error) throw new Error(`Falha ao buscar agendamento: ${error.message}`);
  if (!data) return null;

  const row = trackingAgendamentoRowSchema.parse(data);
  return { dataPublicacao: row.data_publicacao, horario: row.horario, status: row.status };
}

const submitAvaliacaoRowSchema = z.object({
  id_solicitacao: z.number(),
  status_novo: z.string(),
  numero_versao: z.number(),
});

export interface SubmitAvaliacaoResult {
  idSolicitacao: number;
  statusNovo: string;
  numeroVersao: number;
}

/** RF009/RF010/RN22: submete a decisão do cliente via RPC atômica. */
export async function submitAvaliacao(
  adminClient: SupabaseClient,
  params: {
    tokenHash: string;
    decisao: 'Aprovado' | 'Ajustes' | 'Cancelado';
    descricaoAjuste: string | undefined;
    observacoesAjuste: string | undefined;
    imagemReferenciaPath: string | undefined;
    desejaAgendamento?: boolean | undefined;
    dataDesejada?: string | undefined;
    horarioDesejado?: string | undefined;
    opcaoPublicacao?: 'automatico' | 'designer_manual' | 'proprio_cliente' | undefined;
    legendaDesejada?: string | undefined;
  },
): Promise<SubmitAvaliacaoResult> {
  const result: unknown = await adminClient.rpc('submit_avaliacao', {
    p_token_hash: params.tokenHash,
    p_decisao: params.decisao,
    p_descricao_ajuste: params.descricaoAjuste ?? null,
    p_observacoes_ajuste: params.observacoesAjuste ?? null,
    p_imagem_referencia_path: params.imagemReferenciaPath ?? null,
    p_deseja_agendamento: params.desejaAgendamento ?? null,
    p_data_desejada: params.dataDesejada ?? null,
    p_horario_desejado: params.horarioDesejado ?? null,
    p_opcao_publicacao: params.opcaoPublicacao ?? null,
    p_legenda_desejada: params.legendaDesejada ?? null,
  });
  const { data, error } = result as {
    data: unknown;
    error: { message: string; code?: string } | null;
  };

  if (error) {
    if (error.code === PG_NOT_FOUND_OR_REVOKED) throw new NotFoundError('Link de avaliação inválido.');
    if (error.code === PG_ALREADY_USED) throw new ConflictError('Link de avaliação já utilizado.');
    if (error.code === PG_EXPIRED) throw new ExpiredLinkError('Link de avaliação expirado.');
    if (error.code === PG_STATUS_INVALID) {
      throw new ConflictError('Solicitação não está mais aguardando avaliação.');
    }
    throw new Error(`Falha ao registrar avaliação: ${error.message}`);
  }

  const rows = z.array(submitAvaliacaoRowSchema).parse(data ?? []);
  const row = rows[0];
  if (!row) throw new Error('Falha ao registrar avaliação: resposta vazia da função.');
  return { idSolicitacao: row.id_solicitacao, statusNovo: row.status_novo, numeroVersao: row.numero_versao };
}

const createAgendamentoClienteRowSchema = z.object({ id_agendamento: z.number() });

/**
 * Rodada correções (itens 7/8): opção "agendar automaticamente" — mesma
 * RPC atômica de `create_agendamento`, mas o dono é resolvido a partir da
 * própria solicitação (nunca comparado a um caller autenticado, já que
 * quem chama é um cliente sem sessão, só com o token de avaliação).
 */
export async function createAgendamentoCliente(
  adminClient: SupabaseClient,
  params: { idSolicitacao: number; dataPublicacao: string; horario: string; legenda: string | null },
): Promise<{ idAgendamento: number }> {
  const result: unknown = await adminClient.rpc('create_agendamento_cliente', {
    p_id_solicitacao: params.idSolicitacao,
    p_data_publicacao: params.dataPublicacao,
    p_horario: params.horario,
    p_legenda: params.legenda,
  });
  const { data, error } = result as {
    data: unknown;
    error: { message: string; code?: string } | null;
  };

  if (error) {
    if (error.code === PG_NOT_FOUND_OR_REVOKED) throw new NotFoundError('Solicitação não encontrada.');
    if (error.code === PG_STATUS_INVALID) throw new ConflictError(error.message);
    if (error.code === PG_AGENDAMENTO_DATA_INVALIDA) {
      throw new ValidationError('Data/horário do agendamento são obrigatórios e devem ser no futuro.');
    }
    throw new Error(`Falha ao agendar automaticamente: ${error.message}`);
  }

  const rows = z.array(createAgendamentoClienteRowSchema).parse(data ?? []);
  const row = rows[0];
  if (!row) throw new Error('Falha ao agendar automaticamente: resposta vazia da função.');
  return { idAgendamento: row.id_agendamento };
}
