import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseAdminClient } from '../config/supabase.js';
import {
  ConflictError,
  NotFoundError,
  ValidationError,
  translateSupabaseAuthErrorMessage,
} from '../lib/errors.js';
import {
  assertDesignerIsActive,
  deleteDesigner as deleteDesignerRow,
  getDesignerById,
  insertDesignerProfile,
  listDesigners as listDesignersRepo,
  setDesignerStatus,
  updateDesignerPassword as updateDesignerPasswordRow,
  updateDesignerProfile,
  type DesignerSummary,
} from '../repositories/designer.repository.js';
import {
  adminCancelarPendenciasDesignerRpc,
  getSolicitacaoCore,
  listPendenciasByDesigner,
  reassignSolicitacaoRpc,
  syncDesignerBloqueio,
  type PendenciaDesignerRow,
} from '../repositories/solicitacao.repository.js';
import type {
  CreateDesignerInput,
  ListDesignersQuery,
  ReassignSolicitacaoInput,
  SetDesignerStatusInput,
  UpdateDesignerInput,
} from '../schemas/designer.schemas.js';

/** RF001/RF015: leitura via cliente do próprio admin (RLS: is_admin() vê todos). */
export async function listDesigners(
  userClient: SupabaseClient,
  query: ListDesignersQuery,
): Promise<{ items: DesignerSummary[]; total: number; page: number; pageSize: number }> {
  const { items, total } = await listDesignersRepo(userClient, query);
  return { items, total, page: query.page, pageSize: query.pageSize };
}

export async function getDesigner(userClient: SupabaseClient, id: string): Promise<DesignerSummary> {
  const designer = await getDesignerById(userClient, id);
  if (!designer) throw new NotFoundError('Designer não encontrado.');
  return designer;
}

/**
 * RF001/RNF009/FIGURA 28: cria a identidade no Supabase Auth com a senha
 * inicial definida pelo Administrador (protótipo oficial do TFC mostra os
 * campos "Nova Senha"/"Confirma Senha" na própria tela de cadastro — não
 * um convite por e-mail) e o perfil vinculado (public.usuario +
 * public.designer, atomicamente via RPC). `email_confirm: true` porque o
 * Admin já validou o e-mail ao digitá-lo; o designer consegue logar
 * imediatamente com a senha recebida, sem depender do serviço de e-mail
 * do Supabase (que tem cota baixa no plano gratuito, seção 2.1). A senha
 * só trafega deste ponto até a API do Supabase Auth — nunca é logada,
 * persistida em texto puro ou devolvida na resposta (RNF007).
 * Se o perfil falhar depois do usuário Auth já ter sido criado, compensa
 * excluindo-o — evita deixar uma identidade órfã sem perfil, que
 * bloquearia uma nova tentativa com o mesmo e-mail.
 */
export async function createDesigner(input: CreateDesignerInput): Promise<DesignerSummary> {
  const adminClient = getSupabaseAdminClient();

  const createResult: unknown = await adminClient.auth.admin.createUser({
    email: input.email,
    password: input.senha,
    email_confirm: true,
  });
  const { data, error } = createResult as {
    data: { user: { id: string } | null } | null;
    error: { message: string } | null;
  };

  if (error || !data?.user) {
    throw new ConflictError(translateSupabaseAuthErrorMessage(error?.message));
  }

  try {
    await insertDesignerProfile(adminClient, {
      id: data.user.id,
      nomeCompleto: input.nomeCompleto,
      email: input.email,
      whatsapp: input.whatsapp,
    });
  } catch (profileError) {
    const compensationResult: unknown = await adminClient.auth.admin.deleteUser(data.user.id);
    const { error: compensationError } = compensationResult as { error: { message: string } | null };
    if (compensationError) {
      console.error('[designhub:designer] falha ao compensar usuário Auth após erro de perfil', {
        userId: data.user.id,
        compensationError: compensationError.message,
      });
    }
    throw profileError;
  }

  return {
    id: data.user.id,
    nomeCompleto: input.nomeCompleto,
    email: input.email,
    status: 'ativo',
    whatsapp: input.whatsapp,
    bloqueado: false,
    statusOperacional: null,
  };
}

export async function updateDesigner(id: string, changes: UpdateDesignerInput): Promise<void> {
  const adminClient = getSupabaseAdminClient();
  const designer = await getDesignerById(adminClient, id);
  if (!designer) throw new NotFoundError('Designer não encontrado.');
  await updateDesignerProfile(adminClient, id, changes);
}

export interface ChangeDesignerStatusResult {
  /**
   * Presente somente quando `status: 'inativo'` foi pedido sem `estrategia`
   * e o designer possui solicitações pendentes — o backend rejeita a
   * inativação direta e devolve a lista para a UI exigir uma escolha
   * (item 4/rodada final). Ausente em qualquer outro caso.
   */
  pendencias?: PendenciaDesignerRow[];
}

/** RF001/item 4 (rodada final): leitura das pendências de um designer — usável a qualquer momento, não só durante a inativação. */
export async function listPendenciasDesigner(id: string): Promise<PendenciaDesignerRow[]> {
  const adminClient = getSupabaseAdminClient();
  const designer = await getDesignerById(adminClient, id);
  if (!designer) throw new NotFoundError('Designer não encontrado.');
  return listPendenciasByDesigner(adminClient, id);
}

/**
 * RF001/item 4 (rodada final): inativação/reativação de designer.
 * Reativar (`status: 'ativo'`) nunca exige estratégia. Inativar exige uma
 * das 3 estratégias aprovadas quando existem pendências (estados não
 * terminais — RN39): `cancelar_pendentes`, `reatribuir_pendentes` ou
 * `inativar_mesmo_assim`. Backend é a autoridade: sem pendências ou com
 * `inativar_mesmo_assim`, a inativação é direta; as outras duas estratégias
 * só inativam depois que TODAS as pendências têm destino válido.
 */
export async function changeDesignerStatus(
  atorId: string,
  id: string,
  input: SetDesignerStatusInput,
): Promise<ChangeDesignerStatusResult> {
  const adminClient = getSupabaseAdminClient();
  const designer = await getDesignerById(adminClient, id);
  if (!designer) throw new NotFoundError('Designer não encontrado.');

  if (input.status === 'ativo') {
    await setDesignerStatus(adminClient, id, 'ativo');
    return {};
  }

  if (!input.estrategia) {
    const pendencias = await listPendenciasByDesigner(adminClient, id);
    if (pendencias.length > 0) return { pendencias };
    await setDesignerStatus(adminClient, id, 'inativo');
    return {};
  }

  if (input.estrategia === 'inativar_mesmo_assim') {
    // Item 4: não cancela nem reatribui nada — as pendências continuam
    // visíveis ao Administrador via `listPendenciasDesigner` para ação futura.
    await setDesignerStatus(adminClient, id, 'inativo');
    return {};
  }

  if (input.estrategia === 'cancelar_pendentes') {
    // RPC atômica: cancela todas as pendências (mesma regra de
    // `cancel_solicitacao_designer`, incluindo agendamento ativo) e inativa
    // o designer na mesma transação.
    await adminCancelarPendenciasDesignerRpc(adminClient, { idDesigner: id, atorId });
    return {};
  }

  // estrategia === 'reatribuir_pendentes'
  const pendencias = await listPendenciasByDesigner(adminClient, id);
  const pendenciasIds = new Set(pendencias.map((p) => p.idSolicitacao));
  const reatribuicoes = input.reatribuicoes ?? [];
  const idsFornecidos = new Set(reatribuicoes.map((r) => r.idSolicitacao));

  const semDestino = [...pendenciasIds].filter((pid) => !idsFornecidos.has(pid));
  if (semDestino.length > 0) {
    throw new ValidationError(
      'Indique um novo designer para todas as solicitações pendentes antes de inativar.',
    );
  }
  const invalidas = reatribuicoes.filter((r) => !pendenciasIds.has(r.idSolicitacao));
  if (invalidas.length > 0) {
    throw new ValidationError('Uma ou mais solicitações informadas não são pendências deste designer.');
  }

  // Reaproveita `reassignSolicitacao` (mesma validação de designer de
  // destino ativo/não bloqueado e mesma auditoria de RF016) para cada
  // pendência — se uma falhar no meio, o designer permanece ativo e as já
  // reatribuídas ficam com destino válido (estado seguro para retomar).
  for (const reatribuicao of reatribuicoes) {
    await reassignSolicitacao(atorId, reatribuicao.idSolicitacao, {
      novoDesignerId: reatribuicao.novoDesignerId,
    });
  }

  await setDesignerStatus(adminClient, id, 'inativo');
  return {};
}

/**
 * RF001/item 2.4: exclusão física, ADITIVA ao Ativo/Inativo. Impedimentos
 * históricos (cliente/solicitação vinculados) são traduzidos em
 * ConflictError pelo repository — o admin deve reatribuir antes de excluir.
 * Auditoria (seção 12.8): registra ator/ação/entidade/data-hora, sem PII
 * sensível além do e-mail já visível ao próprio admin na listagem.
 */
export async function removeDesigner(atorId: string, id: string): Promise<void> {
  const adminClient = getSupabaseAdminClient();
  const designer = await getDesignerById(adminClient, id);
  if (!designer) throw new NotFoundError('Designer não encontrado.');

  await deleteDesignerRow(adminClient, id);

  console.info('[designhub:auditoria] designer.excluir', {
    atorId,
    designerId: id,
    email: designer.email,
    dataHora: new Date().toISOString(),
  });
}

/** RF001/item 2.1: Admin define nova senha para o designer via Supabase Auth. */
export async function changeDesignerPassword(
  atorId: string,
  id: string,
  novaSenha: string,
): Promise<void> {
  const adminClient = getSupabaseAdminClient();
  const designer = await getDesignerById(adminClient, id);
  if (!designer) throw new NotFoundError('Designer não encontrado.');

  await updateDesignerPasswordRow(adminClient, id, novaSenha);

  console.info('[designhub:auditoria] designer.alterar_senha', {
    atorId,
    designerId: id,
    dataHora: new Date().toISOString(),
  });
}

/**
 * RF016/RN44/RN45/RN47/RN48: reatribuição atômica com auditoria. A
 * pré-checagem aqui (mesma solicitação/designer ativo) só existe para dar
 * um erro rápido e claro — a função SQL `reassign_solicitacao` repete a
 * validação de "designer ativo" e deriva os nomes para o histórico dentro
 * da própria transação (defesa em profundidade contra corrida entre esta
 * checagem e a chamada RPC).
 */
export async function reassignSolicitacao(
  atorId: string,
  idSolicitacao: number,
  input: ReassignSolicitacaoInput,
): Promise<void> {
  const adminClient = getSupabaseAdminClient();

  const solicitacao = await getSolicitacaoCore(adminClient, idSolicitacao);
  if (solicitacao.idDesigner === input.novoDesignerId) {
    throw new ValidationError('A solicitação já está atribuída a este designer.');
  }

  await assertDesignerIsActive(adminClient, input.novoDesignerId);

  /**
   * Item 5/5.1 (rodada final): "receber nova atribuição" é explicitamente um
   * dos caminhos que geram novo serviço para o designer — reatribuir uma
   * solicitação para um designer com outra solicitação vencida sem a 1ª
   * versão (RF006/RN11/RN12) seria dar-lhe mais trabalho antes de resolver a
   * pendência atual. Recalculado ao vivo (nunca a coluna cache) — mesma
   * autoridade de `iniciarAtendimento`.
   */
  const destinoBloqueado = await syncDesignerBloqueio(adminClient, input.novoDesignerId);
  if (destinoBloqueado) {
    throw new ConflictError(
      'O designer de destino possui solicitação vencida sem a primeira versão enviada e não pode receber novas atribuições até resolver a pendência.',
    );
  }

  await reassignSolicitacaoRpc(adminClient, {
    idSolicitacao: solicitacao.idSolicitacao,
    novoDesignerId: input.novoDesignerId,
    atorId,
  });
}
