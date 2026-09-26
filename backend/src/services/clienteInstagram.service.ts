import { randomBytes } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { env } from '../config/env.js';
import { getSupabaseAdminClient } from '../config/supabase.js';
import { buildAuthorizeUrl, exchangeCodeForLongLivedToken } from '../integrations/instagram/instagramOAuth.js';
import { verifyInstagramSignedRequest } from '../integrations/instagram/instagramSignedRequest.js';
import { sendTextMessage } from '../integrations/whatsapp/whatsappClient.js';
import { generateOpaqueToken, hashOpaqueToken } from '../lib/tokens.js';
import { BlockedExternalCredentialError, ConflictError, NotFoundError, ValidationError } from '../lib/errors.js';
import { getClienteById } from '../repositories/cliente.repository.js';
import {
  consumeOAuthState,
  createDataDeletionRequest,
  createOAuthState,
  deleteConexao,
  deleteConexaoByInstagramUserId,
  getDataDeletionRequestStatus,
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
  await createOAuthState(adminClient, { stateHash: hash, idCliente, idDesigner: callerId, origem: 'designer' });

  return { url: buildAuthorizeUrl(raw) };
}

export interface EnviarLinkInstagramResult {
  url: string;
  whatsappNotified: boolean;
  whatsappError?: string;
}

/**
 * Item 4 (rodada correções Instagram): mesmo link de autorização de
 * `gerarAutorizacaoInstagramUrl`, mas para o cliente abrir no PRÓPRIO
 * dispositivo — o designer nunca precisa das credenciais do Instagram do
 * cliente. Reaproveita o mesmo state opaco de uso único (ownership já
 * validado por `assertOwnedCliente`); a falha ao notificar via WhatsApp
 * nunca é mascarada (mesmo padrão de `gerarLinkAvaliacao`), o link em si
 * continua válido para o designer copiar e enviar manualmente.
 */
export async function enviarLinkConexaoInstagram(
  userClient: SupabaseClient,
  idCliente: number,
  callerId: string,
): Promise<EnviarLinkInstagramResult> {
  const cliente = await getClienteById(userClient, idCliente);
  if (!cliente) throw new NotFoundError('Cliente não encontrado.');

  const { raw, hash } = generateOpaqueToken();
  const adminClient = getSupabaseAdminClient();
  await createOAuthState(adminClient, { stateHash: hash, idCliente, idDesigner: callerId, origem: 'cliente_link' });
  const url = buildAuthorizeUrl(raw);

  const message =
    'Para habilitar a publicação pelo DesignHub, conecte sua conta do Instagram pelo link abaixo:\n\n' +
    `${url}\n\n` +
    'A autorização é feita diretamente pela Meta. O DesignHub não solicita sua senha.';

  let whatsappNotified = true;
  let whatsappError: string | undefined;
  try {
    await sendTextMessage(cliente.whatsapp, message);
  } catch (error) {
    whatsappNotified = false;
    // Nunca loga `message`/`url` (contêm o token bruto) — só o erro do SDK/HTTP, truncado.
    whatsappError = error instanceof Error ? error.message.slice(0, 200) : 'Erro desconhecido.';
    console.error('[designhub:instagram] falha ao enviar link de conexão via WhatsApp', {
      idCliente,
      message: whatsappError,
    });
  }

  return { url, whatsappNotified, ...(whatsappError ? { whatsappError } : {}) };
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
): Promise<{ idCliente: number; origem: 'designer' | 'cliente_link' }> {
  // Item N.5.5: nunca grava o access_token sem cifrar — falha explícita
  // (fail-closed) em vez de persistir em texto puro.
  if (!env.INSTAGRAM_TOKEN_ENC_KEY) {
    throw new BlockedExternalCredentialError('INSTAGRAM_TOKEN_ENC_KEY ausente.');
  }

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
    encKey: env.INSTAGRAM_TOKEN_ENC_KEY,
  });

  return { idCliente: state.id_cliente, origem: state.origem };
}

/**
 * Item A1 (Deauthorize Callback, exigido pela revisão do App da Meta):
 * o Instagram chama esta rota quando o usuário revoga o acesso do DesignHub
 * pelas próprias configurações do Instagram — sem isso o App não é aprovado.
 * Remove só a conexão (token) daquele `instagram_user_id`; cliente,
 * solicitações, artes e histórico permanecem intactos (nunca é o mesmo
 * conceito de "excluir o cliente").
 */
export async function processarDeauthorizeInstagram(signedRequest: string): Promise<void> {
  const payload = verifyInstagramSignedRequest(signedRequest);
  if (!payload) {
    throw new ValidationError('Assinatura inválida.');
  }
  if (!payload.user_id) return;

  const adminClient = getSupabaseAdminClient();
  await deleteConexaoByInstagramUserId(adminClient, String(payload.user_id));
}

export interface DataDeletionResult {
  confirmationCode: string;
  url: string;
}

/**
 * Item A2 (Data Deletion Request Callback, exigido pela revisão do App da
 * Meta): mesmo escopo de remoção do Deauthorize — só a conexão/token da
 * integração Instagram, nunca cliente/solicitação/arte/histórico. A
 * exclusão é síncrona (já ocorre aqui), e o `confirmation_code` emitido
 * permite ao usuário conferir o status depois pela URL devolvida.
 */
export async function processarSolicitacaoExclusaoInstagram(signedRequest: string): Promise<DataDeletionResult> {
  const payload = verifyInstagramSignedRequest(signedRequest);
  if (!payload) {
    throw new ValidationError('Assinatura inválida.');
  }
  const instagramUserId = payload.user_id ? String(payload.user_id) : null;

  const adminClient = getSupabaseAdminClient();
  const conexaoRemovida = instagramUserId ? await deleteConexaoByInstagramUserId(adminClient, instagramUserId) : false;

  const confirmationCode = randomBytes(16).toString('hex');
  await createDataDeletionRequest(adminClient, {
    confirmationCode,
    instagramUserId: instagramUserId ?? 'desconhecido',
    conexaoRemovida,
  });

  return {
    confirmationCode,
    url: `${env.PUBLIC_BACKEND_URL}/api/instagram/oauth/data-deletion/status?id=${confirmationCode}`,
  };
}

/** Item A2: endpoint de status que a URL devolvida ao usuário aponta — nunca expõe dado pessoal. */
export async function getStatusExclusaoInstagram(confirmationCode: string): Promise<'concluido' | 'nao_encontrado'> {
  const adminClient = getSupabaseAdminClient();
  return getDataDeletionRequestStatus(adminClient, confirmationCode);
}
