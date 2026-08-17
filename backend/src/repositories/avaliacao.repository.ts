import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { ConflictError, ExpiredLinkError, NotFoundError } from '../lib/errors.js';

const PG_NOT_FOUND_OR_REVOKED = 'P0002';
const PG_STATUS_INVALID = 'P0001';
const PG_EXPIRED = 'P0003';
const PG_ALREADY_USED = 'P0004';

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
  if (row.used_at) return { state: 'used', idVersao: null };
  if (new Date(row.expires_at).getTime() < Date.now()) return { state: 'expired', idVersao: null };
  return { state: 'valid', idVersao: row.id_versao };
}

const versaoPreviewRowSchema = z.object({
  id_solicitacao: z.number(),
  numero_versao: z.number(),
  formato: z.string(),
  observacoes: z.string().nullable(),
  arquivo_url: z.string(),
  solicitacao: z.union([
    z.object({ tema: z.string().nullable() }),
    z.array(z.object({ tema: z.string().nullable() })),
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
    .select('id_solicitacao, numero_versao, formato, observacoes, arquivo_url, solicitacao(tema)')
    .eq('id_versao', idVersao)
    .maybeSingle();
  const { data, error } = result as { data: unknown; error: { message: string } | null };
  if (error) throw new Error(`Falha ao buscar versão: ${error.message}`);
  if (!data) return null;

  const row = versaoPreviewRowSchema.parse(data);
  const solicitacao = Array.isArray(row.solicitacao) ? (row.solicitacao[0] ?? null) : row.solicitacao;
  return {
    idSolicitacao: row.id_solicitacao,
    numeroVersao: row.numero_versao,
    formato: row.formato,
    observacoes: row.observacoes,
    arquivoUrl: row.arquivo_url,
    tema: solicitacao?.tema ?? null,
  };
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

/** RF009/RF010: submete a decisão do cliente via RPC atômica. */
export async function submitAvaliacao(
  adminClient: SupabaseClient,
  params: {
    tokenHash: string;
    decisao: 'Aprovado' | 'Ajustes' | 'Cancelado';
    descricaoAjuste: string | undefined;
    observacoesAjuste: string | undefined;
    imagemReferenciaPath: string | undefined;
  },
): Promise<SubmitAvaliacaoResult> {
  const result: unknown = await adminClient.rpc('submit_avaliacao', {
    p_token_hash: params.tokenHash,
    p_decisao: params.decisao,
    p_descricao_ajuste: params.descricaoAjuste ?? null,
    p_observacoes_ajuste: params.observacoesAjuste ?? null,
    p_imagem_referencia_path: params.imagemReferenciaPath ?? null,
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
