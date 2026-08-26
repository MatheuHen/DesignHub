import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseAdminClient } from '../config/supabase.js';
import { ConflictError, NotFoundError, ValidationError } from '../lib/errors.js';
import {
  CONTENT_TYPE_BY_FORMATO,
  EXTENSION_BY_FORMATO,
  detectVersaoArteFormato,
} from '../lib/fileSignature.js';
import { getSolicitacaoCore, syncDesignerBloqueio } from '../repositories/solicitacao.repository.js';
import {
  createVersaoArteDownloadUrl,
  getVersaoArteByIdAndSolicitacao,
  registerVersaoArte,
  removeArquivoFromStorageBestEffort,
  uploadArquivoToStorage,
} from '../repositories/versaoArte.repository.js';

const DOWNLOAD_URL_EXPIRES_IN_SECONDS = 300;

/** RF007/RN26: status a partir dos quais é permitido enviar uma nova versão. */
const UPLOADABLE_STATUSES = new Set(['Em produção', 'Ajustes']);

export interface UploadVersaoArteInput {
  buffer: Buffer;
  observacoes: string | undefined;
}

export interface VersaoArteUploadResult {
  idVersao: number;
  numeroVersao: number;
  status: 'Enviado para avaliação';
}

/**
 * RF007/RF008: valida o formato real do arquivo (assinatura de bytes, não o
 * Content-Type declarado — seção 12.2), confirma que o chamador é o
 * designer dono da solicitação e que o status atual permite envio, envia o
 * arquivo ao Storage privado e registra a versão de forma atômica via RPC.
 * Se o registro falhar depois do upload, o objeto órfão é removido
 * (compensação, mesmo padrão de `createDesigner`/Fase 4).
 */
export async function uploadVersaoArte(
  userClient: SupabaseClient,
  idSolicitacao: number,
  callerId: string,
  input: UploadVersaoArteInput,
): Promise<VersaoArteUploadResult> {
  const formato = detectVersaoArteFormato(input.buffer);
  if (!formato) {
    throw new ValidationError('Formato de arquivo não suportado. Envie PDF, JPG ou PNG.');
  }

  const solicitacao = await getSolicitacaoCore(userClient, idSolicitacao);
  if (solicitacao.idDesigner !== callerId) {
    throw new NotFoundError('Solicitação não encontrada.');
  }
  if (!UPLOADABLE_STATUSES.has(solicitacao.status)) {
    throw new ConflictError(
      `Solicitação não está em um status que permite envio de nova versão (status atual: ${solicitacao.status}).`,
    );
  }

  const adminClient = getSupabaseAdminClient();
  const path = `solicitacoes/${idSolicitacao}/versoes/${randomUUID()}.${EXTENSION_BY_FORMATO[formato]}`;

  await uploadArquivoToStorage(adminClient, path, input.buffer, CONTENT_TYPE_BY_FORMATO[formato]);

  try {
    const registered = await registerVersaoArte(adminClient, {
      idSolicitacao,
      idDesigner: callerId,
      arquivoPath: path,
      formato,
      observacoes: input.observacoes,
    });

    // RF006/RN12: se esta era a solicitação vencida que bloqueava o
    // designer, o envio da 1ª versão resolve a pendência — atualiza o
    // cache de bloqueio agora (melhor-esforço: se falhar, se autocorrige
    // na próxima chamada real de gate, mesmo comportamento já documentado
    // em `sync_designer_bloqueio`).
    try {
      await syncDesignerBloqueio(adminClient, callerId);
    } catch (error) {
      console.error('[designhub:versao-arte] falha ao sincronizar bloqueio do designer', {
        idDesigner: callerId,
        message: error instanceof Error ? error.message : 'erro desconhecido',
      });
    }

    return {
      idVersao: registered.idVersao,
      numeroVersao: registered.numeroVersao,
      status: 'Enviado para avaliação',
    };
  } catch (error) {
    await removeArquivoFromStorageBestEffort(adminClient, path);
    throw error;
  }
}

export interface VersaoArteDownloadUrl {
  url: string;
  expiresInSeconds: number;
}

/**
 * RF008 + seção 12.5: URL assinada de curta duração, só para o designer dono
 * da solicitação. `inline=true` gera `Content-Disposition: inline` (botão
 * "Visualizar" — RF008 exige "visualização e download" da versão), mantendo
 * `forceDownload: true` como padrão para o botão "Baixar".
 */
export async function getVersaoArteDownloadUrl(
  userClient: SupabaseClient,
  idSolicitacao: number,
  idVersao: number,
  callerId: string,
  inline = false,
): Promise<VersaoArteDownloadUrl> {
  const solicitacao = await getSolicitacaoCore(userClient, idSolicitacao);
  if (solicitacao.idDesigner !== callerId) {
    throw new NotFoundError('Solicitação não encontrada.');
  }

  const versao = await getVersaoArteByIdAndSolicitacao(userClient, idVersao, idSolicitacao);
  if (!versao) {
    throw new NotFoundError('Versão não encontrada.');
  }

  const adminClient = getSupabaseAdminClient();
  const url = await createVersaoArteDownloadUrl(
    adminClient,
    versao.arquivoUrl,
    DOWNLOAD_URL_EXPIRES_IN_SECONDS,
    !inline,
  );
  return { url, expiresInSeconds: DOWNLOAD_URL_EXPIRES_IN_SECONDS };
}
