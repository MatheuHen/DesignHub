const GRAPH_API_VERSION = 'v21.0';
const REQUEST_TIMEOUT_MS = 15_000;

/**
 * A conta usa o produto "Instagram API with Instagram Login" (login direto
 * pela conta profissional do Instagram, sem Página do Facebook) — os
 * tokens desse fluxo só são válidos em graph.instagram.com, não em
 * graph.facebook.com (fluxo clássico via Facebook Login for Business).
 * `accountId` precisa ser o id retornado por `graph.instagram.com/.../me`
 * para esse mesmo token, não o ID de conta comercial do Graph API clássico.
 *
 * RF014/ADR 0005: a credencial (token + account id) é sempre resolvida pelo
 * chamador a partir da conexão do Cliente dono da solicitação
 * (`cliente_instagram_conexao`) — esta função nunca lê configuração global,
 * então nunca publica na conta de um cliente errado.
 */

export interface InstagramCredentials {
  accessToken: string;
  accountId: string;
}

export interface PublishImageResult {
  mediaId: string;
}

interface CreateContainerResponse {
  id?: string;
}

interface PublishContainerResponse {
  id?: string;
}

interface GraphErrorResponse {
  error?: { message?: string };
}

async function graphRequest(
  accessToken: string,
  method: 'GET' | 'POST',
  path: string,
  body?: Record<string, unknown>,
): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const url = `https://graph.instagram.com/${GRAPH_API_VERSION}/${path}`;
    const response = await fetch(url, {
      method,
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });

    if (!response.ok) {
      let message = `status ${response.status}`;
      try {
        const errorBody = (await response.json()) as GraphErrorResponse;
        if (errorBody.error?.message) message = errorBody.error.message;
      } catch {
        // resposta de erro sem corpo JSON — mantém a mensagem genérica com status
      }
      throw new Error(`Falha na chamada à Instagram API (${message})`);
    }

    return await response.json();
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Timeout ao chamar a Instagram API.');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function graphPost(accessToken: string, path: string, body: Record<string, unknown>): Promise<unknown> {
  return graphRequest(accessToken, 'POST', path, body);
}

interface ContainerStatusResponse {
  status_code?: 'EXPIRED' | 'ERROR' | 'FINISHED' | 'IN_PROGRESS' | 'PUBLISHED';
}

const CONTAINER_POLL_ATTEMPTS = 5;
const CONTAINER_POLL_INTERVAL_MS = 1_500;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * A Content Publishing API processa a mídia de forma assíncrona depois de
 * criar o container — chamar `media_publish` antes de `status_code` virar
 * `FINISHED` retorna o erro oficial "Media ID is not available"
 * (documentado pela própria Meta). O intervalo/tentativas aqui são só a
 * espera exigida pela API oficial, não uma regra de negócio nova.
 */
async function waitForContainerReady(accessToken: string, creationId: string): Promise<void> {
  for (let attempt = 0; attempt < CONTAINER_POLL_ATTEMPTS; attempt++) {
    await sleep(CONTAINER_POLL_INTERVAL_MS);
    const status = (await graphRequest(
      accessToken,
      'GET',
      `${creationId}?fields=status_code`,
    )) as ContainerStatusResponse;
    if (status.status_code === 'FINISHED') return;
    if (status.status_code === 'ERROR' || status.status_code === 'EXPIRED') {
      throw new Error(`Falha na chamada à Instagram API (container de mídia com status ${status.status_code})`);
    }
  }
  throw new Error('Falha na chamada à Instagram API (container de mídia não ficou pronto a tempo)');
}

/**
 * RF014/RN32/seção 2.1: publica uma imagem no feed do Instagram via API
 * oficial da Meta (Content Publishing API), nunca automação não oficial.
 * `imageUrl` precisa ser publicamente acessível o suficiente para os
 * servidores da Meta buscarem o arquivo (URL assinada de curta duração do
 * Storage privado, seção 12.5) — nunca o path interno do bucket.
 * Só publica imagens (JPG/PNG); PDF não é um formato suportado pelo
 * Instagram e é filtrado antes desta chamada (seção "elegibilidade
 * automática", `publicacao.service.ts`).
 */
export async function publishImage(
  credentials: InstagramCredentials,
  imageUrl: string,
  caption: string,
): Promise<PublishImageResult> {
  const { accessToken, accountId } = credentials;

  const containerResult = (await graphPost(accessToken, `${accountId}/media`, {
    image_url: imageUrl,
    caption,
  })) as CreateContainerResponse;

  const creationId = containerResult.id;
  if (!creationId) {
    throw new Error('Resposta inesperada da Instagram API: sem id de container de mídia.');
  }

  await waitForContainerReady(accessToken, creationId);

  const publishResult = (await graphPost(accessToken, `${accountId}/media_publish`, {
    creation_id: creationId,
  })) as PublishContainerResponse;

  const mediaId = publishResult.id;
  if (!mediaId) {
    throw new Error('Resposta inesperada da Instagram API: sem id de mídia publicada.');
  }

  return { mediaId };
}
