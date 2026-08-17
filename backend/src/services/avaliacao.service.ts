import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseAdminClient } from '../config/supabase.js';
import { env } from '../config/env.js';
import { sendTextMessage } from '../integrations/whatsapp/whatsappClient.js';
import { ConflictError, ExpiredLinkError, NotFoundError, ValidationError } from '../lib/errors.js';
import {
  CONTENT_TYPE_BY_FORMATO,
  EXTENSION_BY_FORMATO,
  detectVersaoArteFormato,
} from '../lib/fileSignature.js';
import { generateOpaqueToken, hashOpaqueToken } from '../lib/tokens.js';
import {
  generateAvaliacaoLinkToken,
  getAvaliacaoLinkState,
  getVersaoArtePreview,
  submitAvaliacao,
  type AvaliacaoLinkState,
} from '../repositories/avaliacao.repository.js';
import { findClienteById } from '../repositories/atendimento.repository.js';
import { getSolicitacaoDetail as getSolicitacaoDetailRepo } from '../repositories/solicitacao.repository.js';
import {
  createVersaoArteDownloadUrl,
  removeArquivoFromStorageBestEffort,
  uploadArquivoToStorage,
} from '../repositories/versaoArte.repository.js';

/**
 * RF009: prazo técnico de validade do link — não é regra de negócio
 * documentada (nenhum RN define prazo de resposta da avaliação, diferente
 * de RN05 para o atendimento WhatsApp). Escolha de implementação com folga
 * generosa para não bloquear o cliente, ajustável sem impacto em RF/RN.
 */
const LINK_EXPIRES_IN_MS = 7 * 24 * 60 * 60 * 1000;

/** Mesmo prazo de URL assinada já usado na Fase 8 (seção 12.5). */
const DOWNLOAD_URL_EXPIRES_IN_SECONDS = 300;

export interface GerarLinkAvaliacaoResult {
  url: string;
  expiresAt: string;
  whatsappNotified: boolean;
  whatsappError?: string;
}

/**
 * RF009/RN19: gera um novo token de avaliação (revoga qualquer token
 * anterior não usado da mesma versão, via RPC) e tenta notificar o cliente
 * pelo WhatsApp Cloud API oficial. A falha de notificação nunca é mascarada
 * (`whatsappNotified: false` + `whatsappError`) — o link em si continua
 * válido e pode ser compartilhado manualmente pelo designer.
 */
export async function gerarLinkAvaliacao(
  userClient: SupabaseClient,
  idSolicitacao: number,
  callerId: string,
): Promise<GerarLinkAvaliacaoResult> {
  const solicitacao = await getSolicitacaoDetailRepo(userClient, idSolicitacao);
  if (!solicitacao || solicitacao.idDesigner !== callerId) {
    throw new NotFoundError('Solicitação não encontrada.');
  }
  if (solicitacao.status !== 'Enviado para avaliação') {
    throw new ConflictError('Solicitação não está aguardando avaliação no momento.');
  }

  const cliente = await findClienteById(userClient, solicitacao.idCliente);
  if (!cliente) {
    throw new NotFoundError('Cliente não encontrado.');
  }

  const adminClient = getSupabaseAdminClient();
  const { raw, hash } = generateOpaqueToken();
  const expiresAt = new Date(Date.now() + LINK_EXPIRES_IN_MS);

  await generateAvaliacaoLinkToken(adminClient, {
    idSolicitacao,
    idDesigner: callerId,
    tokenHash: hash,
    expiresAt,
  });

  const url = `${env.FRONTEND_URL}/avaliacao/${raw}`;
  const message = `Olá! Sua arte está pronta para avaliação. Acesse o link para aprovar, pedir ajustes ou cancelar: ${url}`;

  let whatsappNotified = true;
  let whatsappError: string | undefined;
  try {
    await sendTextMessage(cliente.whatsapp, message);
  } catch (error) {
    whatsappNotified = false;
    // Nunca loga `message`/`url` (contêm o token bruto) — só o erro do SDK/HTTP, truncado.
    whatsappError = error instanceof Error ? error.message.slice(0, 200) : 'Erro desconhecido.';
    console.error('[designhub:avaliacao] falha ao notificar cliente via WhatsApp', {
      idSolicitacao,
      message: whatsappError,
    });
  }

  return {
    url,
    expiresAt: expiresAt.toISOString(),
    whatsappNotified,
    ...(whatsappError ? { whatsappError } : {}),
  };
}

export interface AvaliacaoPreview {
  state: AvaliacaoLinkState;
  tema?: string | null;
  numeroVersao?: number;
  formato?: string;
  observacoes?: string | null;
  downloadUrl?: string;
  expiresInSeconds?: number;
}

/**
 * RF009 ("visualiza a arte... como foco principal"): leitura pública
 * (sem autenticação — a prova de acesso é o próprio token). Nunca inclui
 * dado pessoal de cliente/designer, só o necessário para decidir.
 */
export async function getAvaliacaoPreview(rawToken: string): Promise<AvaliacaoPreview> {
  const adminClient = getSupabaseAdminClient();
  const hash = hashOpaqueToken(rawToken);
  const linkState = await getAvaliacaoLinkState(adminClient, hash);
  if (linkState.state !== 'valid' || linkState.idVersao === null) {
    return { state: linkState.state };
  }

  const versao = await getVersaoArtePreview(adminClient, linkState.idVersao);
  if (!versao) {
    return { state: 'invalid' };
  }

  const downloadUrl = await createVersaoArteDownloadUrl(
    adminClient,
    versao.arquivoUrl,
    DOWNLOAD_URL_EXPIRES_IN_SECONDS,
    false,
  );

  return {
    state: 'valid',
    tema: versao.tema,
    numeroVersao: versao.numeroVersao,
    formato: versao.formato,
    observacoes: versao.observacoes,
    downloadUrl,
    expiresInSeconds: DOWNLOAD_URL_EXPIRES_IN_SECONDS,
  };
}

export interface SubmitAvaliacaoInput {
  decisao: 'Aprovado' | 'Ajustes' | 'Cancelado';
  descricao: string | undefined;
  observacoes: string | undefined;
  referenciaBuffer: Buffer | undefined;
}

export interface SubmitAvaliacaoOutcome {
  idSolicitacao: number;
  statusNovo: string;
}

/**
 * RF009/RF010/RN20/RN21/RN24: registra a decisão do cliente. Se houver
 * referência de ajuste, o arquivo é validado (formato real) e enviado ao
 * Storage ANTES da RPC atômica; se a RPC falhar, o objeto é removido
 * (compensação, mesmo padrão da Fase 8).
 */
export async function submitAvaliacaoDecisao(
  rawToken: string,
  input: SubmitAvaliacaoInput,
): Promise<SubmitAvaliacaoOutcome> {
  const adminClient = getSupabaseAdminClient();
  const hash = hashOpaqueToken(rawToken);

  const linkState = await getAvaliacaoLinkState(adminClient, hash);
  if (linkState.state === 'used') throw new ConflictError('Link de avaliação já utilizado.');
  if (linkState.state === 'expired') throw new ExpiredLinkError('Link de avaliação expirado.');
  if (linkState.state !== 'valid' || linkState.idVersao === null) {
    throw new NotFoundError('Link de avaliação inválido.');
  }

  let imagemReferenciaPath: string | undefined;
  if (input.referenciaBuffer) {
    const versao = await getVersaoArtePreview(adminClient, linkState.idVersao);
    if (!versao) throw new NotFoundError('Link de avaliação inválido.');

    const formato = detectVersaoArteFormato(input.referenciaBuffer);
    if (!formato) {
      throw new ValidationError('Formato de arquivo de referência não suportado. Envie PDF, JPG ou PNG.');
    }

    imagemReferenciaPath = `solicitacoes/${versao.idSolicitacao}/referencias/${randomUUID()}.${EXTENSION_BY_FORMATO[formato]}`;
    await uploadArquivoToStorage(
      adminClient,
      imagemReferenciaPath,
      input.referenciaBuffer,
      CONTENT_TYPE_BY_FORMATO[formato],
    );
  }

  try {
    const result = await submitAvaliacao(adminClient, {
      tokenHash: hash,
      decisao: input.decisao,
      descricaoAjuste: input.descricao,
      observacoesAjuste: input.observacoes,
      imagemReferenciaPath,
    });
    return { idSolicitacao: result.idSolicitacao, statusNovo: result.statusNovo };
  } catch (error) {
    if (imagemReferenciaPath) {
      await removeArquivoFromStorageBestEffort(adminClient, imagemReferenciaPath);
    }
    throw error;
  }
}
