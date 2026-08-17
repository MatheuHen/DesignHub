import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { ConflictError, NotFoundError } from '../lib/errors.js';
import type { VersaoArteFormato } from '../lib/fileSignature.js';

/** RF007/RF008/RNF008: bucket privado dedicado a versões de arte e referências (Fase 2). */
export const ARTES_BUCKET = 'artes';

const PG_NO_DATA_FOUND = 'P0002';
const PG_RAISE_EXCEPTION = 'P0001';

/** RF007: envia o arquivo já validado (formato real + tamanho) ao Storage privado. */
export async function uploadArquivoToStorage(
  adminClient: SupabaseClient,
  path: string,
  buffer: Buffer,
  contentType: string,
): Promise<void> {
  const { error } = await adminClient.storage.from(ARTES_BUCKET).upload(path, buffer, {
    contentType,
    upsert: false,
  });
  if (error) {
    throw new Error(`Falha ao enviar arquivo para o Storage: ${error.message}`);
  }
}

/**
 * Compensação (mesmo padrão de `createDesigner`, Fase 4): remove o objeto
 * órfão do Storage quando o registro atômico da versão falha depois do
 * upload. Melhor-esforço — o erro original de `registerVersaoArte` é o que
 * deve chegar ao chamador, não uma falha desta limpeza.
 */
export async function removeArquivoFromStorageBestEffort(
  adminClient: SupabaseClient,
  path: string,
): Promise<void> {
  try {
    await adminClient.storage.from(ARTES_BUCKET).remove([path]);
  } catch (error) {
    console.error('[designhub:storage] falha ao remover arquivo órfão', {
      path,
      message: error instanceof Error ? error.message : 'erro desconhecido',
    });
  }
}

const registerVersaoArteRowSchema = z.object({
  id_versao: z.number(),
  numero_versao: z.number(),
  status_anterior: z.string(),
});

/**
 * RF007/RF008/RN17/RN26: chama a função atômica que numera a versão,
 * atualiza o status da solicitação para "Enviado para avaliação" e grava o
 * histórico numa única transação (`register_versao_arte`, Fase 8).
 */
export async function registerVersaoArte(
  adminClient: SupabaseClient,
  params: {
    idSolicitacao: number;
    idDesigner: string;
    arquivoPath: string;
    formato: VersaoArteFormato;
    observacoes: string | undefined;
  },
): Promise<{ idVersao: number; numeroVersao: number; statusAnterior: string }> {
  const result: unknown = await adminClient.rpc('register_versao_arte', {
    p_id_solicitacao: params.idSolicitacao,
    p_id_designer: params.idDesigner,
    p_arquivo_path: params.arquivoPath,
    p_formato: params.formato,
    p_observacoes: params.observacoes ?? null,
  });
  const { data, error } = result as {
    data: unknown;
    error: { message: string; code?: string } | null;
  };

  if (error) {
    if (error.code === PG_NO_DATA_FOUND) {
      throw new NotFoundError('Solicitação não encontrada.');
    }
    if (error.code === PG_RAISE_EXCEPTION) {
      throw new ConflictError(error.message);
    }
    throw new Error(`Falha ao registrar versão da arte: ${error.message}`);
  }

  const rows = z.array(registerVersaoArteRowSchema).parse(data ?? []);
  const row = rows[0];
  if (!row) {
    throw new Error('Falha ao registrar versão da arte: resposta vazia da função.');
  }
  return { idVersao: row.id_versao, numeroVersao: row.numero_versao, statusAnterior: row.status_anterior };
}

const versaoArteCoreRowSchema = z.object({
  id_versao: z.number(),
  arquivo_url: z.string(),
});

/**
 * RF008: busca a versão filtrando por `id_versao` **e** `id_solicitacao`
 * simultaneamente — evita que um `id_versao` válido de outra solicitação
 * seja aceito quando combinado com um `:id` de path diferente (IDOR).
 * Usa o cliente do próprio usuário (RLS já restringe por ownership); o
 * service ainda compara `id_designer` explicitamente antes de chegar aqui
 * (mesma defesa em profundidade da Fase 7).
 */
export async function getVersaoArteByIdAndSolicitacao(
  client: SupabaseClient,
  idVersao: number,
  idSolicitacao: number,
): Promise<{ idVersao: number; arquivoUrl: string } | null> {
  const result: unknown = await client
    .from('versao_arte')
    .select('id_versao, arquivo_url')
    .eq('id_versao', idVersao)
    .eq('id_solicitacao', idSolicitacao)
    .maybeSingle();
  const { data, error } = result as { data: unknown; error: { message: string } | null };
  if (error) throw new Error(`Falha ao buscar versão: ${error.message}`);
  if (!data) return null;
  const row = versaoArteCoreRowSchema.parse(data);
  return { idVersao: row.id_versao, arquivoUrl: row.arquivo_url };
}

/**
 * RF008 + seção 12.5: URL assinada de curta duração. Por padrão
 * (`forceDownload: true`, usada pelo download autenticado do designer)
 * força `Content-Disposition: attachment` — o arquivo nunca é exibido
 * inline pelo navegador, independentemente de como o cliente/servidor
 * interpretariam o Content-Type (seção 12.2, defesa adicional contra
 * conteúdo enviado pelo usuário). RF009 usa `forceDownload: false`: a tela
 * pública de avaliação precisa exibir a arte inline (`<img>`/`<iframe>`,
 * "arte como foco principal" — seção 1) e `attachment` faria o navegador
 * baixar o PDF em vez de renderizá-lo no iframe.
 */
export async function createVersaoArteDownloadUrl(
  adminClient: SupabaseClient,
  path: string,
  expiresInSeconds: number,
  forceDownload = true,
): Promise<string> {
  const { data, error } = await adminClient.storage
    .from(ARTES_BUCKET)
    .createSignedUrl(path, expiresInSeconds, { download: forceDownload });
  if (error || !data?.signedUrl) {
    throw new Error(`Falha ao gerar URL assinada: ${error?.message ?? 'resposta vazia'}`);
  }
  return data.signedUrl;
}
