-- DesignHub — RF004: idempotência de webhook + conclusão atômica do
-- questionário + expiração de atendimento (RN05).

-- Deduplicação de entrega do webhook Meta (reentrega é esperada/normal).
-- Sem policies para authenticated/anon: só service_role acessa (o backend
-- verifica/insere antes de processar cada mensagem recebida).
create table public.whatsapp_webhook_evento (
  id_evento text primary key,
  processado_em timestamptz not null default now()
);

alter table public.whatsapp_webhook_evento enable row level security;

comment on table public.whatsapp_webhook_evento is
  'RF004/seção 12.3: dedup de wamid (id de mensagem) para tornar o processamento do webhook idempotente contra reentregas da Meta.';

-- RF004/RN03: conclui o questionário e cria a solicitação atomicamente
-- (mesma transação atualiza atendimento + grava historico_solicitacao).
-- Mesma política de acesso das funções da Fase 4: revogar de
-- anon/authenticated explicitamente (não só de public), pois o Supabase
-- concede EXECUTE a esses roles por padrão via ALTER DEFAULT PRIVILEGES.
create or replace function public.complete_atendimento_and_create_solicitacao(
  p_id_atendimento bigint,
  p_tema text,
  p_cores text,
  p_observacoes text
)
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id_cliente bigint;
  v_id_designer uuid;
  v_status text;
  v_id_solicitacao bigint;
begin
  select a.id_cliente, c.id_designer, a.status
  into v_id_cliente, v_id_designer, v_status
  from public.atendimento a
  join public.cliente c on c.id_cliente = a.id_cliente
  where a.id_atendimento = p_id_atendimento
  for update of a;

  if v_id_cliente is null then
    raise exception 'atendimento % não encontrado', p_id_atendimento using errcode = 'P0002';
  end if;

  if v_status <> 'em_andamento' then
    raise exception 'atendimento % não está em andamento', p_id_atendimento using errcode = 'P0001';
  end if;

  -- solicitacao.descricao fica NULL neste fluxo: RN08 não lista uma
  -- pergunta de "descrição" (só confirmação/tema/cores/observações/
  -- referências), e RF005 enumera explicitamente "tema, cores,
  -- observações e referências" como o conteúdo trazido pelo atendimento —
  -- descricao é preenchida depois pelo designer, se necessário (Fase 7).
  insert into public.solicitacao (id_cliente, id_designer, tema, cores, observacoes)
  values (v_id_cliente, v_id_designer, p_tema, p_cores, p_observacoes)
  returning id_solicitacao into v_id_solicitacao;

  update public.atendimento
  set id_solicitacao = v_id_solicitacao, status = 'concluido', data_fim = now()
  where id_atendimento = p_id_atendimento;

  -- RF011: "solicitação criada → Em produção" é uma transição do ator
  -- Serviço Automático (disparada pela resposta do cliente via webhook,
  -- não por uma ação do designer) — id_usuario fica null, seguindo a
  -- convenção já documentada em historico_solicitacao.id_usuario
  -- (20260816120700_historico_solicitacao.sql).
  insert into public.historico_solicitacao (id_solicitacao, id_usuario, acao, status_anterior, status_novo)
  values (
    v_id_solicitacao,
    null,
    'Solicitação criada a partir do questionário WhatsApp (RF004/RN03, Serviço Automático)',
    null,
    'Em produção'
  );

  return v_id_solicitacao;
end;
$$;

revoke all on function public.complete_atendimento_and_create_solicitacao(bigint, text, text, text) from public;
revoke all on function public.complete_atendimento_and_create_solicitacao(bigint, text, text, text) from anon, authenticated;
grant execute on function public.complete_atendimento_and_create_solicitacao(bigint, text, text, text) to service_role;

-- RN05: encerra atendimentos sem resposta completa após 2 dias. Chamada
-- pelo backend (endpoint interno protegido) — o agendamento real via
-- Supabase Cron/pg_cron é conectado na Fase 16, seguindo a arquitetura da
-- seção 11 do CLAUDE.md ("job periódico verifica publicações vencidas");
-- aqui vale o mesmo padrão para atendimentos vencidos.
create or replace function public.expire_stale_atendimentos()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count integer;
begin
  update public.atendimento
  set status = 'expirado', data_fim = now()
  where status = 'em_andamento'
    and data_inicio + interval '2 days' < now();

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.expire_stale_atendimentos() from public;
revoke all on function public.expire_stale_atendimentos() from anon, authenticated;
grant execute on function public.expire_stale_atendimentos() to service_role;
