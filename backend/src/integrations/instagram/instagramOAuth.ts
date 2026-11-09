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

/**
 * Rodada correções (item 3.1): a Meta exige que este valor bata BYTE A BYTE
 * com o "Valid OAuth Redirect URI" cadastrado no App — qualquer divergência
 * (host, esquema, path, barra final) devolve "Invalid redirect_uri" na tela
 * de autorização, sem detalhe utilizável. Como é gerado a partir de uma
 * variável de ambiente, o valor efetivo em produção precisa ser observável
 * para conferência (é público por construção: aparece na barra de endereços
 * do próprio usuário durante o OAuth) — ver `instagramOAuthRedirectUri` em
 * `/api/health`. Uma única função monta o URI, garantindo que authorize e
 * token exchange usem exatamente a mesma string.
 */
export function getInstagramRedirectUri(): string {
  return `${env.PUBLIC_BACKEND_URL}/api/instagram/oauth/callback`;
}

function redirectUri(): string {
  return getInstagramRedirectUri();
}

function assertOAuthClientConfigured(): void {
  if (!env.INSTAGRAM_APP_ID || !env.INSTAGRAM_APP_SECRET) {
    throw new BlockedExternalCredentialError(
      'INSTAGRAM_APP_ID/INSTAGRAM_APP_SECRET ausentes — conexão do Instagram indisponível até a credencial ser configurada.',
    );
  }

  /**
   * CAUSA RAIZ da vinculação "não funcionar": o produto "Instagram API with
   * Instagram Login" exige um Valid OAuth Redirect URI **HTTPS** cadastrado
   * no App. Como `PUBLIC_BACKEND_URL` tem default de desenvolvimento
   * (`http://localhost:3001`), quando ela não está definida o sistema montava
   * silenciosamente um `redirect_uri` que a Meta sempre rejeita, e o usuário
   * só via uma tela de erro genérica do instagram.com — sem nenhuma pista do
   * que corrigir.
   *
   * Falhar aqui, com o nome da variável a configurar, é estritamente melhor
   * do que gerar uma URL que nunca pode funcionar. O valor efetivo continua
   * observável em `/api/health` (`instagramOAuthRedirectUri`) para conferir
   * byte a byte contra o cadastrado no App da Meta.
   */
  const uri = getInstagramRedirectUri();
  if (!uri.startsWith('https://') || /localhost|127\.0\.0\.1/.test(uri)) {
    throw new BlockedExternalCredentialError(
      'PUBLIC_BACKEND_URL precisa ser uma URL HTTPS pública para a conexão do Instagram: a Meta só aceita Valid OAuth Redirect URI em HTTPS e rejeita endereços locais. Configure PUBLIC_BACKEND_URL e cadastre o mesmo valor de /api/health (instagramOAuthRedirectUri) no App da Meta.',
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

interface MeResponse {
  id?: string;
}

/**
 * CAUSA RAIZ da publicação automática falhar sempre com "Object with ID
 * '...' does not exist, cannot be loaded due to missing permissions"
 * (produção: 268 tentativas no agendamento 45).
 *
 * O `user_id` que `oauth/access_token` devolve vem como NÚMERO no JSON
 * (ex.: 40108102008836949) e é maior que `Number.MAX_SAFE_INTEGER` (2^53-1).
 * `JSON.parse` representa isso como double e arredonda: o id gravado virava
 * 40108102008836950 — um objeto que não existe na Meta. A conta estava
 * correta (BUSINESS, token válido, permissão concedida); o id é que estava
 * corrompido por um dígito, e reconectar só regravaria o mesmo erro.
 *
 * Correção: extrair `user_id` do corpo BRUTO como texto, sem passar pelo
 * parser numérico. Qualquer id da Meta é tratado como string de ponta a
 * ponta — é assim que a própria documentação da Graph API recomenda.
 */
function extrairUserIdSemPerdaDePrecisao(rawBody: string): string | null {
  const match = rawBody.match(/"user_id"\s*:\s*"?(\d+)"?/);
  return match?.[1] ?? null;
}

/**
 * Fonte de verdade do id da conta para publicar: `graph.instagram.com/me`
 * devolve `id` como string, então não há como perder precisão. Usado para
 * confirmar/corrigir o valor vindo do endpoint de token — é exatamente o id
 * que `instagramClient.publishImage` usa em `{accountId}/media`.
 */
async function fetchInstagramUserId(accessToken: string): Promise<string | null> {
  try {
    const response = await fetchWithTimeout(`https://graph.instagram.com/v21.0/me?fields=id`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) return null;
    const body = (await response.json()) as MeResponse;
    return typeof body.id === 'string' && /^\d+$/.test(body.id) ? body.id : null;
  } catch {
    return null;
  }
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
  // Corpo lido como TEXTO antes de qualquer parse: é o que permite extrair o
  // `user_id` sem o arredondamento de `JSON.parse` (ver comentário acima).
  const shortLivedRaw = await shortLivedResponse.text();
  let shortLived: ShortLivedTokenResponse = {};
  try {
    shortLived = JSON.parse(shortLivedRaw) as ShortLivedTokenResponse;
  } catch {
    // resposta não-JSON — cai na validação abaixo com o status HTTP
  }
  const shortLivedUserId = extrairUserIdSemPerdaDePrecisao(shortLivedRaw);
  if (!shortLivedResponse.ok || !shortLived.access_token || !shortLivedUserId) {
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

  /**
   * Confirmação do id pela própria Meta (string, sem risco de precisão). Se
   * `/me` estiver indisponível no momento, usa o id extraído do corpo bruto
   * do token — ambos são corretos; o que nunca é usado é o número parseado.
   */
  const instagramUserId = (await fetchInstagramUserId(longLived.access_token)) ?? shortLivedUserId;

  return {
    accessToken: longLived.access_token,
    instagramUserId,
    expiresInSeconds: longLived.expires_in,
  };
}
