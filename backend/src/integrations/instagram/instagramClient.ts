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
  /**
   * `null` só no caso de recuperação em que a Meta informa que o container
   * JÁ foi publicado (`status_code = 'PUBLISHED'`) — o post existe, mas a
   * API não devolve o id da mídia por essa via. Ver `containerJaPublicado`.
   */
  mediaId: string | null;
  /** Item 9.1 (correções 13/09/2026): link público do post, quando a Meta o retorna ("permalink quando seguro"). */
  permalink: string | null;
  /**
   * Correção da publicação duplicada observada em produção: `true` quando o
   * container informado em `existingContainerId` já constava como publicado
   * na Meta, ou seja, uma tentativa anterior conseguiu publicar antes de o
   * processo ser interrompido. Nenhuma nova publicação foi feita nesta
   * chamada — o chamador deve apenas concluir o REGISTRO (RN34/RN35).
   */
  containerJaPublicado: boolean;
}

export interface PublishImageOptions {
  /**
   * Container de mídia criado numa tentativa anterior para este mesmo
   * agendamento. Quando presente, NUNCA se cria um container novo antes de
   * consultar o estado real deste na Meta — é o que impede o segundo post.
   */
  existingContainerId?: string | null;
  /**
   * Chamado logo após a Meta criar o container e ANTES de `media_publish`.
   * Se lançar, a publicação é abortada de propósito (fail closed): é
   * preferível não publicar a publicar sem deixar rastro recuperável, já que
   * é justamente a ausência desse rastro que produz o post duplicado.
   */
  onContainerCreated?: (containerId: string) => Promise<void>;
}

interface CreateContainerResponse {
  id?: string;
}

interface PublishContainerResponse {
  id?: string;
}

interface MediaPermalinkResponse {
  permalink?: string;
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
 * Correção da publicação duplicada: consulta o estado REAL de um container de
 * uma tentativa anterior, sem qualquer espera — é essa leitura que decide se
 * o post já existe (`PUBLISHED`, nada a republicar), se ainda pode ser
 * publicado a partir do mesmo container (`FINISHED`/`IN_PROGRESS`) ou se o
 * container se perdeu sem gerar post algum (`ERROR`/`EXPIRED`, único caso em
 * que criar outro é seguro). Um erro de rede aqui propaga de propósito: sem
 * saber o estado do container, publicar seria arriscar o segundo post.
 */
async function getContainerStatusCode(
  accessToken: string,
  creationId: string,
): Promise<ContainerStatusResponse['status_code'] | undefined> {
  const status = (await graphRequest(
    accessToken,
    'GET',
    `${creationId}?fields=status_code`,
  )) as ContainerStatusResponse;
  return status.status_code;
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
  options: PublishImageOptions = {},
): Promise<PublishImageResult> {
  const { accessToken, accountId } = credentials;

  /**
   * Retomada (correção do post duplicado): há um container de uma tentativa
   * anterior. O estado dele na Meta é a única fonte de verdade sobre o post
   * já existir ou não — consultado ANTES de qualquer escrita.
   */
  let creationId: string | null = null;
  if (options.existingContainerId) {
    const statusCode = await getContainerStatusCode(accessToken, options.existingContainerId);
    if (statusCode === 'PUBLISHED') {
      return { mediaId: null, permalink: null, containerJaPublicado: true };
    }
    if (statusCode !== 'ERROR' && statusCode !== 'EXPIRED') {
      // FINISHED / IN_PROGRESS / desconhecido: o MESMO container é
      // reaproveitado. Nunca se cria um segundo container para o mesmo
      // agendamento enquanto o primeiro ainda pode virar post.
      creationId = options.existingContainerId;
    }
    // ERROR/EXPIRED: nenhum post foi criado a partir dele — segue adiante e
    // cria um container novo, que é o único caso seguro para isso.
  }

  if (creationId === null) {
    const containerResult = (await graphPost(accessToken, `${accountId}/media`, {
      image_url: imageUrl,
      caption,
    })) as CreateContainerResponse;

    if (!containerResult.id) {
      throw new Error('Resposta inesperada da Instagram API: sem id de container de mídia.');
    }
    creationId = containerResult.id;

    /**
     * Persistência do rastro ANTES de publicar. Se isto lançar, a exceção
     * propaga e `media_publish` nunca é chamado: sem o rastro, uma
     * interrupção posterior produziria exatamente o post duplicado que esta
     * correção elimina. O container não publicado expira sozinho na Meta
     * (24h) sem nenhum efeito visível para o cliente.
     */
    await options.onContainerCreated?.(creationId);
  }

  await waitForContainerReady(accessToken, creationId);

  const publishResult = (await graphPost(accessToken, `${accountId}/media_publish`, {
    creation_id: creationId,
  })) as PublishContainerResponse;

  const mediaId = publishResult.id;
  if (!mediaId) {
    throw new Error('Resposta inesperada da Instagram API: sem id de mídia publicada.');
  }

  const permalink = await getMediaPermalinkBestEffort(accessToken, mediaId);
  return { mediaId, permalink, containerJaPublicado: false };
}

/**
 * Item 9.1: melhor esforço — a publicação já está feita nesse ponto; uma
 * falha ao buscar o permalink não pode desfazer/marcar erro na publicação
 * (RN34/RN35 continuam satisfeitas sem ele, o link é só um complemento).
 */
async function getMediaPermalinkBestEffort(accessToken: string, mediaId: string): Promise<string | null> {
  try {
    const result = (await graphRequest(accessToken, 'GET', `${mediaId}?fields=permalink`)) as MediaPermalinkResponse;
    return result.permalink ?? null;
  } catch {
    return null;
  }
}
