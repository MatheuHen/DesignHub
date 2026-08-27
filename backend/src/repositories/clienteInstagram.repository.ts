import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

/**
 * RF014/ADR 0005: autorização do Instagram é sempre por cliente — nunca uma
 * credencial global. Toda leitura/escrita passa pelo admin client
 * (service_role); as tabelas não têm policy para anon/authenticated.
 */

const OAUTH_STATE_TTL_SECONDS = 10 * 60;

interface OAuthStateRow {
  id_cliente: number;
  id_designer: string;
}

/** Persiste o estado (hash) do handshake OAuth, vinculado ao cliente/designer que iniciaram a conexão. */
export async function createOAuthState(
  adminClient: SupabaseClient,
  params: { stateHash: string; idCliente: number; idDesigner: string },
): Promise<void> {
  const expiresAt = new Date(Date.now() + OAUTH_STATE_TTL_SECONDS * 1000).toISOString();
  const result: unknown = await adminClient.from('instagram_oauth_state').insert({
    state_hash: params.stateHash,
    id_cliente: params.idCliente,
    id_designer: params.idDesigner,
    expires_at: expiresAt,
  });
  const { error } = result as { error: { message: string } | null };
  if (error) throw new Error(`Falha ao iniciar conexão com o Instagram: ${error.message}`);
}

const oauthStateRowSchema = z.object({ id_cliente: z.number(), id_designer: z.string() });

/**
 * Consome (marca como usado) um estado ainda válido e não expirado — update
 * condicional atômico via `.is('used_at', null)` + filtro de expiração,
 * mesmo raciocínio de single-use já aplicado a `avaliacao_link_token`
 * (Fase 9): duas tentativas concorrentes de consumir o mesmo state, só uma
 * ganha a corrida (a segunda não encontra linha para atualizar).
 */
export async function consumeOAuthState(
  adminClient: SupabaseClient,
  stateHash: string,
): Promise<OAuthStateRow | null> {
  const result: unknown = await adminClient
    .from('instagram_oauth_state')
    .update({ used_at: new Date().toISOString() })
    .eq('state_hash', stateHash)
    .is('used_at', null)
    .gt('expires_at', new Date().toISOString())
    .select('id_cliente, id_designer')
    .maybeSingle();
  const { data, error } = result as { data: unknown; error: { message: string } | null };
  if (error) throw new Error(`Falha ao validar conexão com o Instagram: ${error.message}`);
  if (!data) return null;

  const row = oauthStateRowSchema.parse(data);
  return { id_cliente: row.id_cliente, id_designer: row.id_designer };
}

export interface ClienteInstagramConexao {
  instagramUserId: string;
  accessToken: string;
  tokenExpiraEm: string;
}

const conexaoRowSchema = z.object({
  instagram_user_id: z.string(),
  access_token: z.string(),
  token_expira_em: z.string(),
});

/** Conexão válida (existente e ainda não expirada) do cliente — usada para decidir/ executar publicação automática. */
export async function getConexaoAtiva(
  adminClient: SupabaseClient,
  idCliente: number,
): Promise<ClienteInstagramConexao | null> {
  const result: unknown = await adminClient
    .from('cliente_instagram_conexao')
    .select('instagram_user_id, access_token, token_expira_em')
    .eq('id_cliente', idCliente)
    .gt('token_expira_em', new Date().toISOString())
    .maybeSingle();
  const { data, error } = result as { data: unknown; error: { message: string } | null };
  if (error) throw new Error(`Falha ao buscar conexão do Instagram: ${error.message}`);
  if (!data) return null;

  const row = conexaoRowSchema.parse(data);
  return { instagramUserId: row.instagram_user_id, accessToken: row.access_token, tokenExpiraEm: row.token_expira_em };
}

export interface ClienteInstagramStatus {
  conectado: boolean;
  conectadoEm: string | null;
  expiraEm: string | null;
}

const statusRowSchema = z.object({
  created_at: z.string(),
  token_expira_em: z.string(),
});

/** Status para exibição ao designer — nunca o token. */
export async function getStatusConexao(
  adminClient: SupabaseClient,
  idCliente: number,
): Promise<ClienteInstagramStatus> {
  const result: unknown = await adminClient
    .from('cliente_instagram_conexao')
    .select('created_at, token_expira_em')
    .eq('id_cliente', idCliente)
    .maybeSingle();
  const { data, error } = result as { data: unknown; error: { message: string } | null };
  if (error) throw new Error(`Falha ao consultar status do Instagram: ${error.message}`);
  if (!data) return { conectado: false, conectadoEm: null, expiraEm: null };

  const row = statusRowSchema.parse(data);
  const expirado = new Date(row.token_expira_em).getTime() <= Date.now();
  return { conectado: !expirado, conectadoEm: row.created_at, expiraEm: row.token_expira_em };
}

/** Grava/atualiza a conexão do cliente — sempre chamado a partir de um state OAuth já validado (nunca de um id_cliente vindo direto de parâmetro externo não confiável). */
export async function upsertConexao(
  adminClient: SupabaseClient,
  params: { idCliente: number; instagramUserId: string; accessToken: string; tokenExpiraEm: string },
): Promise<void> {
  const result: unknown = await adminClient.from('cliente_instagram_conexao').upsert(
    {
      id_cliente: params.idCliente,
      instagram_user_id: params.instagramUserId,
      access_token: params.accessToken,
      token_expira_em: params.tokenExpiraEm,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'id_cliente' },
  );
  const { error } = result as { error: { message: string } | null };
  if (error) throw new Error(`Falha ao salvar conexão do Instagram: ${error.message}`);
}

export async function deleteConexao(adminClient: SupabaseClient, idCliente: number): Promise<void> {
  const result: unknown = await adminClient.from('cliente_instagram_conexao').delete().eq('id_cliente', idCliente);
  const { error } = result as { error: { message: string } | null };
  if (error) throw new Error(`Falha ao remover conexão do Instagram: ${error.message}`);
}
