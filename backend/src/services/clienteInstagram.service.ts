import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseAdminClient } from '../config/supabase.js';
import { buildAuthorizeUrl, exchangeCodeForLongLivedToken } from '../integrations/instagram/instagramOAuth.js';
import { generateOpaqueToken, hashOpaqueToken } from '../lib/tokens.js';
import { ConflictError, NotFoundError } from '../lib/errors.js';
import { getClienteById } from '../repositories/cliente.repository.js';
import {
  consumeOAuthState,
  createOAuthState,
  deleteConexao,
  getStatusConexao,
  upsertConexao,
  type ClienteInstagramStatus,
} from '../repositories/clienteInstagram.repository.js';

/**
 * RF014/ADR 0005: designer inicia a conexão do Instagram de UM cliente
 * específico — a mesma checagem de ownership já usada em `cliente.service.ts`
 * (RLS via `userClient` prova posse antes de qualquer escrita pela service
 * role).
 */
async function assertOwnedCliente(userClient: SupabaseClient, idCliente: number): Promise<void> {
  const cliente = await getClienteById(userClient, idCliente);
  if (!cliente) throw new NotFoundError('Cliente não encontrado.');
}

/** RF014: gera a URL de autorização do Instagram para o cliente indicado. */
export async function gerarAutorizacaoInstagramUrl(
  userClient: SupabaseClient,
  idCliente: number,
  callerId: string,
): Promise<{ url: string }> {
  await assertOwnedCliente(userClient, idCliente);

  const { raw, hash } = generateOpaqueToken();
  const adminClient = getSupabaseAdminClient();
  await createOAuthState(adminClient, { stateHash: hash, idCliente, idDesigner: callerId });

  return { url: buildAuthorizeUrl(raw) };
}

/** RF014: status de conexão do cliente para exibição ao designer — nunca o token. */
export async function getInstagramStatus(
  userClient: SupabaseClient,
  idCliente: number,
): Promise<ClienteInstagramStatus> {
  await assertOwnedCliente(userClient, idCliente);
  const adminClient = getSupabaseAdminClient();
  return getStatusConexao(adminClient, idCliente);
}

/** RF014: remove a conexão do cliente (o designer decide desconectar). */
export async function removerInstagramConexao(userClient: SupabaseClient, idCliente: number): Promise<void> {
  await assertOwnedCliente(userClient, idCliente);
  const adminClient = getSupabaseAdminClient();
  await deleteConexao(adminClient, idCliente);
}

/**
 * RF014/ADR 0005: processa o callback público do OAuth — chamado pelo
 * redirect do instagram.com, sem sessão de usuário. A única prova de
 * autorização é o `state` opaco emitido em `gerarAutorizacaoInstagramUrl`;
 * o `id_cliente` gravado vem sempre do state validado no banco, nunca de um
 * parâmetro solto na URL.
 */
export async function processarCallbackInstagram(
  rawState: string,
  code: string,
): Promise<{ idCliente: number }> {
  const adminClient = getSupabaseAdminClient();
  const state = await consumeOAuthState(adminClient, hashOpaqueToken(rawState));
  if (!state) {
    throw new ConflictError('Link de conexão do Instagram inválido ou expirado. Gere um novo link e tente novamente.');
  }

  const token = await exchangeCodeForLongLivedToken(code);
  const tokenExpiraEm = new Date(Date.now() + token.expiresInSeconds * 1000).toISOString();

  await upsertConexao(adminClient, {
    idCliente: state.id_cliente,
    instagramUserId: token.instagramUserId,
    accessToken: token.accessToken,
    tokenExpiraEm,
  });

  return { idCliente: state.id_cliente };
}
