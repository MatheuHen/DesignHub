import { env, instagramConfigStatus } from '../../config/env.js';
import { BlockedExternalCredentialError } from '../../lib/errors.js';

const GRAPH_API_VERSION = 'v21.0';
const REQUEST_TIMEOUT_MS = 15_000;

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

async function graphPost(path: string, body: Record<string, unknown>): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${path}`;
    const response = await fetch(url, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${env.INSTAGRAM_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
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
export async function publishImage(imageUrl: string, caption: string): Promise<PublishImageResult> {
  if (!instagramConfigStatus.hasPublishingClient) {
    throw new BlockedExternalCredentialError(
      'INSTAGRAM_ACCESS_TOKEN/INSTAGRAM_ACCOUNT_ID ausentes — publicação automática indisponível até a credencial ser configurada.',
    );
  }

  const containerResult = (await graphPost(`${env.INSTAGRAM_ACCOUNT_ID}/media`, {
    image_url: imageUrl,
    caption,
  })) as CreateContainerResponse;

  const creationId = containerResult.id;
  if (!creationId) {
    throw new Error('Resposta inesperada da Instagram API: sem id de container de mídia.');
  }

  const publishResult = (await graphPost(`${env.INSTAGRAM_ACCOUNT_ID}/media_publish`, {
    creation_id: creationId,
  })) as PublishContainerResponse;

  const mediaId = publishResult.id;
  if (!mediaId) {
    throw new Error('Resposta inesperada da Instagram API: sem id de mídia publicada.');
  }

  return { mediaId };
}
