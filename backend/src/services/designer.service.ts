import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseAdminClient } from '../config/supabase.js';
import { ConflictError, NotFoundError, ValidationError } from '../lib/errors.js';
import {
  assertDesignerIsActive,
  deleteDesigner as deleteDesignerRow,
  getDesignerById,
  insertDesignerProfile,
  listDesigners as listDesignersRepo,
  setDesignerStatus,
  updateDesignerProfile,
  type DesignerSummary,
} from '../repositories/designer.repository.js';
import {
  getSolicitacaoCore,
  reassignSolicitacaoRpc,
} from '../repositories/solicitacao.repository.js';
import type {
  CreateDesignerInput,
  ListDesignersQuery,
  ReassignSolicitacaoInput,
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
 * RF001/RNF009: cria a identidade no Supabase Auth por convite (o admin
 * nunca define/conhece a senha do designer — RNF007) e o perfil vinculado
 * (public.usuario + public.designer, atomicamente via RPC). Se o perfil
 * falhar depois do convite já ter sido criado, compensa excluindo o
 * usuário Auth recém-convidado — evita deixar uma identidade órfã sem
 * perfil, que bloquearia uma nova tentativa com o mesmo e-mail.
 */
export async function createDesigner(input: CreateDesignerInput): Promise<DesignerSummary> {
  const adminClient = getSupabaseAdminClient();

  const inviteResult: unknown = await adminClient.auth.admin.inviteUserByEmail(input.email);
  const { data, error } = inviteResult as {
    data: { user: { id: string } | null } | null;
    error: { message: string } | null;
  };

  if (error || !data?.user) {
    throw new ConflictError(error?.message ?? 'Não foi possível convidar o designer.');
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
      console.error('[designhub:designer] falha ao compensar convite após erro de perfil', {
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
  await updateDesignerProfile(adminClient, id, changes);
}

/** RF001: inativação/reativação de designer. */
export async function changeDesignerStatus(id: string, status: 'ativo' | 'inativo'): Promise<void> {
  const adminClient = getSupabaseAdminClient();
  await setDesignerStatus(adminClient, id, status);
}

/** RF001: exclusão — impedimentos históricos são traduzidos em ConflictError pelo repository. */
export async function removeDesigner(id: string): Promise<void> {
  const adminClient = getSupabaseAdminClient();
  await deleteDesignerRow(adminClient, id);
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

  await reassignSolicitacaoRpc(adminClient, {
    idSolicitacao: solicitacao.idSolicitacao,
    novoDesignerId: input.novoDesignerId,
    atorId,
  });
}
