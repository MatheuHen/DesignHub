import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

/**
 * RF014/ADR 0005: autorização do Instagram é sempre por cliente — nunca uma
 * credencial global. Toda leitura/escrita passa pelo admin client
 * (service_role); as tabelas não têm policy para anon/authenticated.
 */

/**
 * Item 4 (rodada correções Instagram): o mesmo state agora também é usado
 * pelo fluxo "enviar link ao cliente" via WhatsApp — o cliente pode demorar
 * para abrir a mensagem, diferente do clique do designer que abre o popup
 * imediatamente. 24h dá folga real de uso sem abrir mão de state opaco de
 * uso único + verificação de expiração (mesma garantia de segurança de
 * antes, só a janela de validade mudou).
 */
const OAUTH_STATE_TTL_SECONDS = 24 * 60 * 60;

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

/**
 * Conexão válida (existente e ainda não expirada) do cliente — usada para
 * decidir/executar publicação automática. `encKey` (item N.5.5) nunca é
 * persistida no banco: a RPC decifra `access_token_enc` só nesta chamada.
 */
export async function getConexaoAtiva(
  adminClient: SupabaseClient,
  idCliente: number,
  encKey: string,
): Promise<ClienteInstagramConexao | null> {
  const result: unknown = await adminClient.rpc('get_instagram_conexao_ativa', {
    p_id_cliente: idCliente,
    p_enc_key: encKey,
  });
  const { data, error } = result as { data: unknown; error: { message: string } | null };
  if (error) throw new Error(`Falha ao buscar conexão do Instagram: ${error.message}`);
  const rows = z.array(conexaoRowSchema).parse(data ?? []);
  const row = rows[0];
  if (!row) return null;

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

/**
 * Grava/atualiza a conexão do cliente — sempre chamado a partir de um state
 * OAuth já validado (nunca de um id_cliente vindo direto de parâmetro
 * externo não confiável). `encKey` (item N.5.5) nunca é persistida no
 * banco: a RPC cifra `access_token` só nesta chamada.
 */
export async function upsertConexao(
  adminClient: SupabaseClient,
  params: { idCliente: number; instagramUserId: string; accessToken: string; tokenExpiraEm: string; encKey: string },
): Promise<void> {
  const result: unknown = await adminClient.rpc('upsert_cliente_instagram_conexao', {
    p_id_cliente: params.idCliente,
    p_instagram_user_id: params.instagramUserId,
    p_access_token: params.accessToken,
    p_token_expira_em: params.tokenExpiraEm,
    p_enc_key: params.encKey,
  });
  const { error } = result as { error: { message: string } | null };
  if (error) throw new Error(`Falha ao salvar conexão do Instagram: ${error.message}`);
}

export async function deleteConexao(adminClient: SupabaseClient, idCliente: number): Promise<void> {
  const result: unknown = await adminClient.from('cliente_instagram_conexao').delete().eq('id_cliente', idCliente);
  const { error } = result as { error: { message: string } | null };
  if (error) throw new Error(`Falha ao remover conexão do Instagram: ${error.message}`);
}

/**
 * Item A1/A2 (Deauthorize/Data Deletion): os callbacks da Meta identificam a
 * conexão pelo `instagram_user_id` do `signed_request`, nunca por um
 * `id_cliente` vindo de fora. `.select('id_cliente')` no delete devolve as
 * linhas removidas — é o que torna a chamada idempotente e observável: uma
 * segunda entrega do mesmo callback (a Meta reentrega em caso de timeout)
 * não encontra nada para apagar e retorna array vazio, sem erro.
 */
export async function deleteConexaoByInstagramUserId(
  adminClient: SupabaseClient,
  instagramUserId: string,
): Promise<boolean> {
  const result: unknown = await adminClient
    .from('cliente_instagram_conexao')
    .delete()
    .eq('instagram_user_id', instagramUserId)
    .select('id_cliente');
  const { data, error } = result as { data: unknown[] | null; error: { message: string } | null };
  if (error) throw new Error(`Falha ao remover conexão do Instagram: ${error.message}`);
  return Boolean(data && data.length > 0);
}

/** Item A2: registra o pedido de exclusão de dados para responder depois ao endpoint de status. */
export async function createDataDeletionRequest(
  adminClient: SupabaseClient,
  params: { confirmationCode: string; instagramUserId: string; conexaoRemovida: boolean },
): Promise<void> {
  const result: unknown = await adminClient.from('instagram_data_deletion_request').insert({
    confirmation_code: params.confirmationCode,
    instagram_user_id: params.instagramUserId,
    conexao_removida: params.conexaoRemovida,
  });
  const { error } = result as { error: { message: string } | null };
  if (error) throw new Error(`Falha ao registrar pedido de exclusão de dados: ${error.message}`);
}

const dataDeletionStatusRowSchema = z.object({ completed_at: z.string() });

/** Item A2: status para o endpoint público de acompanhamento — nunca dado pessoal, só se está concluído. */
export async function getDataDeletionRequestStatus(
  adminClient: SupabaseClient,
  confirmationCode: string,
): Promise<'concluido' | 'nao_encontrado'> {
  const result: unknown = await adminClient
    .from('instagram_data_deletion_request')
    .select('completed_at')
    .eq('confirmation_code', confirmationCode)
    .maybeSingle();
  const { data, error } = result as { data: unknown; error: { message: string } | null };
  if (error) throw new Error(`Falha ao consultar status de exclusão de dados: ${error.message}`);
  if (!data) return 'nao_encontrado';
  dataDeletionStatusRowSchema.parse(data);
  return 'concluido';
}
