import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { ConflictError } from '../lib/errors.js';

/**
 * RF004: normaliza para dígitos e canoniza a ambiguidade documentada da
 * própria Meta para números do Brasil — o `wa_id` que a Cloud API envia em
 * `from` pode ou não incluir o 9º dígito do celular, independentemente de
 * como o número foi cadastrado (`cliente.whatsapp`). Sem essa canonização, o
 * matching do webhook falha silenciosamente para clientes reais (RN09: toda
 * resposta deve ficar registrada).
 */
export function normalizePhone(value: string): string {
  const digits = value.replace(/\D/g, '');
  if (digits.length === 13 && digits.startsWith('55') && digits[4] === '9') {
    return digits.slice(0, 4) + digits.slice(5);
  }
  return digits;
}

/**
 * Auditoria (achado HIGH — performance): variantes possíveis de como este
 * número pode estar armazenado em `cliente.whatsapp` (com/sem o 9º dígito
 * ambíguo do Brasil), usadas para filtrar no banco (`.in`) em vez de
 * carregar todos os atendimentos ativos da plataforma e comparar em memória.
 */
export function phoneStorageCandidates(value: string): string[] {
  const digits = value.replace(/\D/g, '');
  const candidates = new Set([digits]);
  if (digits.length === 13 && digits.startsWith('55') && digits[4] === '9') {
    candidates.add(digits.slice(0, 4) + digits.slice(5));
  } else if (digits.length === 12 && digits.startsWith('55')) {
    candidates.add(`${digits.slice(0, 4)}9${digits.slice(4)}`);
  }
  return [...candidates];
}

const clienteWhatsappRowSchema = z.object({
  id_cliente: z.number(),
  whatsapp: z.string(),
});

/** RF003/RN44: ownership continua sendo do designer autenticado (verificado no service via userClient). */
export async function findClienteById(
  client: SupabaseClient,
  idCliente: number,
): Promise<{ id: number; whatsapp: string } | null> {
  const result: unknown = await client
    .from('cliente')
    .select('id_cliente, whatsapp')
    .eq('id_cliente', idCliente)
    .maybeSingle();
  const { data, error } = result as { data: unknown; error: { message: string } | null };
  if (error) throw new Error(`Falha ao buscar cliente: ${error.message}`);
  if (!data) return null;
  const row = clienteWhatsappRowSchema.parse(data);
  return { id: row.id_cliente, whatsapp: row.whatsapp };
}

/** RN04: 'aguardando_cancelamento' também conta como ativo — evita um segundo questionário para o mesmo cliente. */
const ATENDIMENTO_ATIVO_STATUSES = ['em_andamento', 'aguardando_cancelamento'] as const;

export async function findActiveAtendimentoByClienteId(
  adminClient: SupabaseClient,
  idCliente: number,
): Promise<{ id: number } | null> {
  const result: unknown = await adminClient
    .from('atendimento')
    .select('id_atendimento')
    .eq('id_cliente', idCliente)
    .in('status', ATENDIMENTO_ATIVO_STATUSES)
    .maybeSingle();
  const { data, error } = result as { data: unknown; error: { message: string } | null };
  if (error) throw new Error(`Falha ao verificar atendimento ativo: ${error.message}`);
  if (!data) return null;
  return { id: (data as { id_atendimento: number }).id_atendimento };
}

/**
 * RF004: "verifica WhatsApp e solicitação existente" — os únicos status
 * terminais de `solicitacao` são `Cancelado`/`Publicado` (RF011, sem
 * arestas de saída em `statusTransitions.ts`); qualquer outro status
 * significa que já existe uma solicitação de arte em andamento para o
 * cliente, e um novo atendimento estruturado não deve nascer uma segunda.
 */
export async function findSolicitacaoEmAndamentoByClienteId(
  adminClient: SupabaseClient,
  idCliente: number,
): Promise<{ id: number; status: string } | null> {
  const result: unknown = await adminClient
    .from('solicitacao')
    .select('id_solicitacao, status')
    .eq('id_cliente', idCliente)
    .not('status', 'in', '("Cancelado","Publicado")')
    .limit(1);
  const { data, error } = result as { data: unknown[] | null; error: { message: string } | null };
  if (error) throw new Error(`Falha ao verificar solicitação em andamento: ${error.message}`);
  const row = data?.[0] as { id_solicitacao: number; status: string } | undefined;
  if (!row) return null;
  return { id: row.id_solicitacao, status: row.status };
}

const activeAtendimentoRowSchema = z.object({
  id_atendimento: z.number(),
  id_cliente: z.number(),
  data_inicio: z.string(),
  status: z.enum(['em_andamento', 'aguardando_cancelamento']),
  cliente: z.union([
    z.object({ whatsapp: z.string() }),
    z.array(z.object({ whatsapp: z.string() })),
    z.null(),
  ]),
});

export interface ActiveAtendimento {
  id: number;
  idCliente: number;
  dataInicio: string;
  clienteWhatsapp: string;
  /** Item 3.3: distingue o fluxo normal do fluxo de confirmação de cancelamento. */
  status: 'em_andamento' | 'aguardando_cancelamento';
}

/**
 * RF004: identifica qual atendimento em andamento corresponde ao número
 * que enviou a mensagem. `cliente.whatsapp` não tem unicidade garantida no
 * DER (nota registrada na Fase 2) — em caso de mais de um candidato,
 * usamos o atendimento iniciado mais recentemente.
 *
 * Auditoria (achado HIGH — performance): `whatsappCandidates`, quando
 * informado, filtra no banco pelas variantes possíveis do número (com/sem o
 * 9º dígito) via join `!inner` — evita carregar TODOS os atendimentos ativos
 * da plataforma a cada mensagem inbound do webhook só para filtrar em
 * memória (`cliente_whatsapp_idx`/`atendimento_status_idx` já existentes
 * passam a ser realmente usados). Sem o parâmetro, mantém o comportamento
 * anterior (lista completa) para outros chamadores/testes.
 */
export async function listActiveAtendimentos(
  adminClient: SupabaseClient,
  whatsappCandidates?: string[],
): Promise<ActiveAtendimento[]> {
  let query = adminClient
    .from('atendimento')
    .select(
      whatsappCandidates
        ? 'id_atendimento, id_cliente, data_inicio, status, cliente!inner(whatsapp)'
        : 'id_atendimento, id_cliente, data_inicio, status, cliente(whatsapp)',
    )
    .in('status', ATENDIMENTO_ATIVO_STATUSES)
    .order('data_inicio', { ascending: false });

  if (whatsappCandidates) query = query.in('cliente.whatsapp', whatsappCandidates);

  const result: unknown = await query;

  const { data, error } = result as { data: unknown; error: { message: string } | null };
  if (error) throw new Error(`Falha ao listar atendimentos ativos: ${error.message}`);

  const rows = z.array(activeAtendimentoRowSchema).parse(data ?? []);
  return rows
    .map((row) => {
      const cliente = Array.isArray(row.cliente) ? (row.cliente[0] ?? null) : row.cliente;
      if (!cliente) return null;
      return {
        id: row.id_atendimento,
        idCliente: row.id_cliente,
        dataInicio: row.data_inicio,
        clienteWhatsapp: cliente.whatsapp,
        status: row.status,
      };
    })
    .filter((value): value is ActiveAtendimento => value !== null);
}

/**
 * RN04/RN05: `atendimento_ativo_unico_idx` (índice único parcial, Fase 2)
 * impede dois atendimentos `em_andamento` para o mesmo cliente mesmo sob
 * corrida — aqui só traduzimos a violação numa mensagem acionável.
 */
export async function createAtendimento(
  adminClient: SupabaseClient,
  idCliente: number,
): Promise<{ id: number }> {
  const result: unknown = await adminClient
    .from('atendimento')
    .insert({ id_cliente: idCliente })
    .select('id_atendimento')
    .single();
  const { data, error } = result as {
    data: unknown;
    error: { code?: string; message: string } | null;
  };
  if (error) {
    if (error.code === '23505') {
      throw new ConflictError('Já existe um atendimento em andamento para este cliente.');
    }
    throw new Error(`Falha ao iniciar atendimento: ${error.message}`);
  }
  return { id: (data as { id_atendimento: number }).id_atendimento };
}

/** Compensação: remove um atendimento recém-criado se o envio da primeira pergunta falhar. */
export async function deleteAtendimento(adminClient: SupabaseClient, idAtendimento: number): Promise<void> {
  const result: unknown = await adminClient
    .from('atendimento')
    .delete()
    .eq('id_atendimento', idAtendimento);
  const { error } = result as { error: { message: string } | null };
  if (error) throw new Error(`Falha ao remover atendimento: ${error.message}`);
}

export async function countRespostas(adminClient: SupabaseClient, idAtendimento: number): Promise<number> {
  const result: unknown = await adminClient
    .from('resposta_cliente')
    .select('id_resposta', { count: 'exact', head: true })
    .eq('id_atendimento', idAtendimento);
  const { count, error } = result as { count: number | null; error: { message: string } | null };
  if (error) throw new Error(`Falha ao contar respostas: ${error.message}`);
  return count ?? 0;
}

/**
 * Seção 12.4: `resposta_cliente_atendimento_pergunta_idx` (índice único)
 * impede duas respostas para a mesma pergunta do mesmo atendimento sob
 * corrida (duas mensagens distintas processadas concorrentemente). Retorna
 * `false` quando a violação indica que outra requisição já venceu a
 * corrida — o chamador não deve repetir o efeito colateral (próxima
 * pergunta/conclusão) nesse caso.
 */
export async function insertResposta(
  adminClient: SupabaseClient,
  idAtendimento: number,
  pergunta: string,
  resposta: string,
): Promise<boolean> {
  const result: unknown = await adminClient
    .from('resposta_cliente')
    .insert({ id_atendimento: idAtendimento, pergunta, resposta });
  const { error } = result as { error: { code?: string; message: string } | null };
  if (!error) return true;
  if (error.code === '23505') return false;
  throw new Error(`Falha ao registrar resposta: ${error.message}`);
}

/**
 * Item N.5.6: versão atômica de `countRespostas` + `insertResposta` — decide
 * qual pergunta pendente esta resposta corresponde e insere sob lock do
 * atendimento (RPC `register_resposta_atendimento_e_avancar`), fechando a
 * corrida entre duas mensagens quase simultâneas do mesmo cliente. `inserted`
 * é `false` quando o questionário já estava completo (nada a fazer);
 * `answeredCount` é a contagem de respostas já registradas após a chamada.
 */
const respostaAvancoRowSchema = z.object({ inserted: z.boolean(), answered_count: z.number() });

export async function registerRespostaEAvancar(
  adminClient: SupabaseClient,
  idAtendimento: number,
  perguntas: string[],
  resposta: string,
): Promise<{ inserted: boolean; answeredCount: number }> {
  const result: unknown = await adminClient.rpc('register_resposta_atendimento_e_avancar', {
    p_id_atendimento: idAtendimento,
    p_perguntas: perguntas,
    p_resposta: resposta,
  });
  const { data, error } = result as { data: unknown; error: { message: string } | null };
  if (error) throw new Error(`Falha ao registrar resposta do atendimento: ${error.message}`);
  const rows = z.array(respostaAvancoRowSchema).parse(data ?? []);
  const row = rows[0];
  if (!row) throw new Error('Falha ao registrar resposta do atendimento: nenhuma linha retornada.');
  return { inserted: row.inserted, answeredCount: row.answered_count };
}

const respostaRowSchema = z.object({ resposta: z.string() });

/** Ordem de inserção == ordem das perguntas (RN08), usada para extrair tema/cores/observações. */
export async function listRespostasOrdenadas(
  adminClient: SupabaseClient,
  idAtendimento: number,
): Promise<string[]> {
  const result: unknown = await adminClient
    .from('resposta_cliente')
    .select('resposta')
    .eq('id_atendimento', idAtendimento)
    .order('id_resposta', { ascending: true });
  const { data, error } = result as { data: unknown; error: { message: string } | null };
  if (error) throw new Error(`Falha ao carregar respostas: ${error.message}`);
  return z.array(respostaRowSchema).parse(data ?? []).map((row) => row.resposta);
}

export async function markAtendimentoExpired(adminClient: SupabaseClient, idAtendimento: number): Promise<void> {
  const result: unknown = await adminClient
    .from('atendimento')
    .update({ status: 'expirado', data_fim: new Date().toISOString() })
    .eq('id_atendimento', idAtendimento)
    .eq('status', 'em_andamento');
  const { error } = result as { error: { message: string } | null };
  if (error) throw new Error(`Falha ao expirar atendimento: ${error.message}`);
}

/** Item 3.1: cliente respondeu "não" à confirmação inicial — encerra sem criar solicitação. */
export async function markAtendimentoRecusado(adminClient: SupabaseClient, idAtendimento: number): Promise<void> {
  const result: unknown = await adminClient
    .from('atendimento')
    .update({ status: 'recusado', data_fim: new Date().toISOString() })
    .eq('id_atendimento', idAtendimento)
    .eq('status', 'em_andamento');
  const { error } = result as { error: { message: string } | null };
  if (error) throw new Error(`Falha ao registrar recusa do atendimento: ${error.message}`);
}

/** Item 3.3: cliente pediu cancelamento explícito — aguarda confirmação antes de efetivar. */
export async function markAtendimentoAguardandoCancelamento(
  adminClient: SupabaseClient,
  idAtendimento: number,
): Promise<void> {
  const result: unknown = await adminClient
    .from('atendimento')
    .update({ status: 'aguardando_cancelamento' })
    .eq('id_atendimento', idAtendimento)
    .eq('status', 'em_andamento');
  const { error } = result as { error: { message: string } | null };
  if (error) throw new Error(`Falha ao registrar pedido de cancelamento: ${error.message}`);
}

/** Item 3.3: cliente confirmou o cancelamento — efetiva, sem criar solicitação. */
export async function markAtendimentoCancelado(adminClient: SupabaseClient, idAtendimento: number): Promise<void> {
  const result: unknown = await adminClient
    .from('atendimento')
    .update({ status: 'cancelado', data_fim: new Date().toISOString() })
    .eq('id_atendimento', idAtendimento)
    .eq('status', 'aguardando_cancelamento');
  const { error } = result as { error: { message: string } | null };
  if (error) throw new Error(`Falha ao cancelar atendimento: ${error.message}`);
}

/** Item 3.3: cliente não confirmou o cancelamento — volta ao andamento normal. */
export async function revertAtendimentoParaAndamento(
  adminClient: SupabaseClient,
  idAtendimento: number,
): Promise<void> {
  const result: unknown = await adminClient
    .from('atendimento')
    .update({ status: 'em_andamento' })
    .eq('id_atendimento', idAtendimento)
    .eq('status', 'aguardando_cancelamento');
  const { error } = result as { error: { message: string } | null };
  if (error) throw new Error(`Falha ao retomar atendimento: ${error.message}`);
}

/**
 * RN05/seção 11: varredura periódica que encerra atendimentos parados em
 * `em_andamento` há mais de 2 dias — cobre o caso em que o cliente nunca
 * mais responde (a checagem por mensagem em `processInboundMessage` só
 * expira quando *chega* uma mensagem nova; sem isso, o atendimento fica
 * aberto para sempre e bloqueia um novo atendimento para o mesmo cliente,
 * RN04). Chamada pelo endpoint interno protegido (job/cron), nunca por
 * rota de designer.
 */
export async function expireStaleAtendimentos(adminClient: SupabaseClient): Promise<number> {
  const result: unknown = await adminClient.rpc('expire_stale_atendimentos');
  const { data, error } = result as { data: unknown; error: { message: string } | null };
  if (error) throw new Error(`Falha ao expirar atendimentos vencidos: ${error.message}`);
  return z.number().int().parse(data);
}

export async function completeAtendimentoAndCreateSolicitacao(
  adminClient: SupabaseClient,
  params: { idAtendimento: number; tema: string; cores: string; observacoes: string },
): Promise<number> {
  const result: unknown = await adminClient.rpc('complete_atendimento_and_create_solicitacao', {
    p_id_atendimento: params.idAtendimento,
    p_tema: params.tema,
    p_cores: params.cores,
    p_observacoes: params.observacoes,
  });
  const { data, error } = result as { data: unknown; error: { message: string } | null };
  if (error) throw new Error(`Falha ao concluir atendimento: ${error.message}`);
  return z.number().parse(data);
}

/**
 * Auditoria (achado HIGH — perda silenciosa de resposta do cliente): dedup
 * de reentrega do webhook em duas fases (RPC atômica). Retorna `true` quando
 * o chamador deve processar a mensagem (evento novo OU reserva anterior
 * travada/expirada — reentrega legítima da Meta após falha transitória);
 * `false` quando já concluído ou sendo processado por outra requisição
 * concorrente. O chamador DEVE marcar `markWebhookEventoConcluido` somente
 * após o processamento terminar com sucesso — nunca antes.
 */
export async function registerWebhookEventOnce(
  adminClient: SupabaseClient,
  idEvento: string,
): Promise<boolean> {
  const result: unknown = await adminClient.rpc('claim_webhook_evento', { p_id_evento: idEvento });
  const { data, error } = result as { data: unknown; error: { message: string } | null };
  if (error) throw new Error(`Falha ao reservar evento de webhook: ${error.message}`);
  return data === true;
}

/** Marca o evento como concluído — só depois de todo o processamento ter sucesso. */
export async function markWebhookEventoConcluido(adminClient: SupabaseClient, idEvento: string): Promise<void> {
  const result: unknown = await adminClient.rpc('mark_webhook_evento_concluido', { p_id_evento: idEvento });
  const { error } = result as { error: { message: string } | null };
  if (error) throw new Error(`Falha ao concluir evento de webhook: ${error.message}`);
}
