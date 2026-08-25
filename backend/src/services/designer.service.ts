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
