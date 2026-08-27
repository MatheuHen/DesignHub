import { env } from '../../config/env.js';
import { BlockedExternalCredentialError } from '../../lib/errors.js';

/**
 * RF014/ADR 0005: handshake OAuth do produto "Instagram API with Instagram
 * Login" — autoriza a conta profissional do Instagram de UM cliente por
 * vez. Nunca publica nada por si só; só troca um "code" de autorização por
 * um token de acesso que o resto do sistema (`instagramClient.ts`) usa
 * depois, sempre resolvido por cliente (`cliente_instagram_conexao`).
 */

const OAUTH_AUTHORIZE_URL = 'https://www.instagram.com/oauth/authorize';
const OAUTH_TOKEN_URL = 'https://api.instagram.com/oauth/access_token';
const GRAPH_EXCHANGE_URL = 'https://graph.instagram.com/access_token';
const REQUEST_TIMEOUT_MS = 15_000;

/** Escopos mínimos necessários para publicar mídia via Content Publishing API. */
const OAUTH_SCOPES = ['instagram_business_basic', 'instagram_business_content_publish'].join(',');

function redirectUri(): string {
  return `${env.PUBLIC_BACKEND_URL}/api/instagram/oauth/callback`;
}

function assertOAuthClientConfigured(): void {
  if (!env.INSTAGRAM_APP_ID || !env.INSTAGRAM_APP_SECRET) {
    throw new BlockedExternalCredentialError(
      'INSTAGRAM_APP_ID/INSTAGRAM_APP_SECRET ausentes — conexão do Instagram indisponível até a credencial ser configurada.',
    );
  }
}

/** Monta a URL de autorização para o Cliente (ou quem administra a conta) aprovar o acesso. */
export function buildAuthorizeUrl(state: string): string {
  assertOAuthClientConfigured();
  const params = new URLSearchParams({
    client_id: env.INSTAGRAM_APP_ID!,
    redirect_uri: redirectUri(),
    scope: OAUTH_SCOPES,
    response_type: 'code',
    state,
  });
  return `${OAUTH_AUTHORIZE_URL}?${params.toString()}`;
}

interface ShortLivedTokenResponse {
  access_token?: string;
  user_id?: string | number;
  error_message?: string;
}

interface LongLivedTokenResponse {
  access_token?: string;
  expires_in?: number;
}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Timeout ao conectar com a Instagram API.');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export interface ExchangedInstagramToken {
  accessToken: string;
  instagramUserId: string;
  expiresInSeconds: number;
}

/**
 * Troca o `code` recebido no callback por um token de curta duração e, em
 * seguida, por um token de longa duração (~60 dias) — dois passos exigidos
 * pela API oficial (RF014/seção 2.1, sem automação/atalho não documentado).
 */
export async function exchangeCodeForLongLivedToken(code: string): Promise<ExchangedInstagramToken> {
  assertOAuthClientConfigured();

  const body = new URLSearchParams({
    client_id: env.INSTAGRAM_APP_ID!,
    client_secret: env.INSTAGRAM_APP_SECRET!,
    grant_type: 'authorization_code',
    redirect_uri: redirectUri(),
    code,
  });

  const shortLivedResponse = await fetchWithTimeout(OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const shortLived = (await shortLivedResponse.json()) as ShortLivedTokenResponse;
  if (!shortLivedResponse.ok || !shortLived.access_token || !shortLived.user_id) {
    throw new Error(
      `Falha ao trocar o código de autorização do Instagram (${shortLived.error_message ?? `status ${shortLivedResponse.status}`})`,
    );
  }

  const exchangeParams = new URLSearchParams({
    grant_type: 'ig_exchange_token',
    client_secret: env.INSTAGRAM_APP_SECRET!,
    access_token: shortLived.access_token,
  });
  const longLivedResponse = await fetchWithTimeout(`${GRAPH_EXCHANGE_URL}?${exchangeParams.toString()}`, {
    method: 'GET',
  });
  const longLived = (await longLivedResponse.json()) as LongLivedTokenResponse;
  if (!longLivedResponse.ok || !longLived.access_token || !longLived.expires_in) {
    throw new Error(`Falha ao obter token de longa duração do Instagram (status ${longLivedResponse.status})`);
  }

  return {
    accessToken: longLived.access_token,
    instagramUserId: String(shortLived.user_id),
    expiresInSeconds: longLived.expires_in,
  };
}
