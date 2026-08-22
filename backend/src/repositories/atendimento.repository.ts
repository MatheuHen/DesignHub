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

export async function findActiveAtendimentoByClienteId(
  adminClient: SupabaseClient,
  idCliente: number,
): Promise<{ id: number } | null> {
  const result: unknown = await adminClient
    .from('atendimento')
    .select('id_atendimento')
    .eq('id_cliente', idCliente)
    .eq('status', 'em_andamento')
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
}

/**
 * RF004: identifica qual atendimento em andamento corresponde ao número
 * que enviou a mensagem. `cliente.whatsapp` não tem unicidade garantida no
 * DER (nota registrada na Fase 2) — em caso de mais de um candidato,
 * usamos o atendimento iniciado mais recentemente.
 */
export async function listActiveAtendimentos(adminClient: SupabaseClient): Promise<ActiveAtendimento[]> {
  const result: unknown = await adminClient
    .from('atendimento')
    .select('id_atendimento, id_cliente, data_inicio, cliente(whatsapp)')
    .eq('status', 'em_andamento')
    .order('data_inicio', { ascending: false });

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

/** RF004/seção 12.3: dedup de reentrega do webhook. Retorna false se já processado. */
export async function registerWebhookEventOnce(
  adminClient: SupabaseClient,
  idEvento: string,
): Promise<boolean> {
  const result: unknown = await adminClient
    .from('whatsapp_webhook_evento')
    .insert({ id_evento: idEvento });
  const { error } = result as { error: { code?: string; message: string } | null };
  if (!error) return true;
  if (error.code === '23505') return false; // unique_violation: já processado
  throw new Error(`Falha ao registrar evento de webhook: ${error.message}`);
}
