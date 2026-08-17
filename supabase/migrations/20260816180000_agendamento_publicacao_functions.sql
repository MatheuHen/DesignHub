-- DesignHub — RF012/RF013: agendamento de publicação e cancelamento.
-- RN27/RN28/RN30/RN31: só arte aprovada pode ser agendada; agendamento
-- registra data/horário/legenda; cancelamento só até 3h antes do horário
-- planejado. Timezone de referência para interpretar `data_publicacao` +
-- `horario` (colunas sem timezone, seção "Fase 11" do roadmap):
-- America/Sao_Paulo.
--
-- Mesmo padrão anti-CRITICAL das funções irmãs: `revoke` explícito de
-- anon/authenticated (o Supabase concede EXECUTE por padrão via ALTER
-- DEFAULT PRIVILEGES), `grant` só a service_role.

create or replace function public.create_agendamento(
  p_id_solicitacao bigint,
  p_id_designer uuid,
  p_data_publicacao date,
  p_horario time,
  p_legenda text
)
returns table (id_agendamento bigint)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id_designer uuid;
  v_status text;
  v_scheduled_at timestamptz;
  v_id_agendamento bigint;
begin
  select s.id_designer, s.status
  into v_id_designer, v_status
  from public.solicitacao s
  where s.id_solicitacao = p_id_solicitacao
  for update;

  if v_id_designer is null or v_id_designer <> p_id_designer then
    raise exception 'solicitação % não encontrada', p_id_solicitacao using errcode = 'P0002';
  end if;

  -- RF012/RN30: só solicitação Aprovado pode ser agendada.
  if v_status <> 'Aprovado' then
    raise exception
      'solicitação % não está aprovada (status atual: %)', p_id_solicitacao, v_status
      using errcode = 'P0001';
  end if;

  if p_data_publicacao is null or p_horario is null then
    raise exception 'data/horário do agendamento são obrigatórios' using errcode = 'P0004';
  end if;

  v_scheduled_at := (p_data_publicacao + p_horario) at time zone 'America/Sao_Paulo';
  if v_scheduled_at <= now() then
    raise exception 'data/horário do agendamento deve ser no futuro' using errcode = 'P0004';
  end if;

  -- agendamento_ativo_unico_idx (Fase 2) é o backstop contra dois
  -- agendamentos ativos concorrentes para a mesma solicitação.
  insert into public.agendamento_publicacao (id_solicitacao, data_publicacao, horario, legenda)
  values (p_id_solicitacao, p_data_publicacao, p_horario, p_legenda)
  returning agendamento_publicacao.id_agendamento into v_id_agendamento;

  update public.solicitacao
  set status = 'Agendado'
  where id_solicitacao = p_id_solicitacao;

  insert into public.historico_solicitacao (id_solicitacao, id_usuario, acao, status_anterior, status_novo)
  values (
    p_id_solicitacao,
    p_id_designer,
    format('Publicação agendada para %s %s (RF012)', p_data_publicacao, p_horario),
    'Aprovado',
    'Agendado'
  );

  return query select v_id_agendamento;
end;
$$;

revoke all on function public.create_agendamento(bigint, uuid, date, time, text) from public;
revoke all on function public.create_agendamento(bigint, uuid, date, time, text) from anon, authenticated;
grant execute on function public.create_agendamento(bigint, uuid, date, time, text) to service_role;

-- RF012 ("permitir edição"): não altera o status da solicitação (segue
-- Agendado); só é permitido enquanto o agendamento em si ainda está ativo.
create or replace function public.update_agendamento(
  p_id_agendamento bigint,
  p_id_designer uuid,
  p_data_publicacao date,
  p_horario time,
  p_legenda text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id_designer uuid;
  v_id_solicitacao bigint;
  v_status_agendamento text;
  v_scheduled_at timestamptz;
begin
  -- Trava `agendamento_publicacao` e `solicitacao` juntas (`for update of
  -- a, s`), mesma ordem/escopo de lock de `create_agendamento` — evita que
  -- uma futura função que também escreva essas duas colunas relacionadas
  -- (hoje nenhuma outra escreve) precise reconstruir essa garantia do zero;
  -- padroniza com o precedente já documentado em `submit_avaliacao`
  -- (Fase 9, seção "ordem de locks evita deadlock entre funções
  -- concorrentes").
  select s.id_designer, a.id_solicitacao, a.status
  into v_id_designer, v_id_solicitacao, v_status_agendamento
  from public.agendamento_publicacao a
  join public.solicitacao s on s.id_solicitacao = a.id_solicitacao
  where a.id_agendamento = p_id_agendamento
  for update of a, s;

  if v_id_designer is null or v_id_designer <> p_id_designer then
    raise exception 'agendamento % não encontrado', p_id_agendamento using errcode = 'P0002';
  end if;

  if v_status_agendamento <> 'Agendado' then
    raise exception
      'agendamento % não está ativo (status atual: %)', p_id_agendamento, v_status_agendamento
      using errcode = 'P0001';
  end if;

  if p_data_publicacao is null or p_horario is null then
    raise exception 'data/horário do agendamento são obrigatórios' using errcode = 'P0004';
  end if;

  v_scheduled_at := (p_data_publicacao + p_horario) at time zone 'America/Sao_Paulo';
  if v_scheduled_at <= now() then
    raise exception 'data/horário do agendamento deve ser no futuro' using errcode = 'P0004';
  end if;

  update public.agendamento_publicacao
  set data_publicacao = p_data_publicacao,
      horario = p_horario,
      legenda = p_legenda
  where id_agendamento = p_id_agendamento;

  -- Mesmo padrão de `reassign_solicitacao` (Fase 4) para eventos
  -- auditáveis que não mudam o status da solicitação: status_anterior =
  -- status_novo = status atual.
  insert into public.historico_solicitacao (id_solicitacao, id_usuario, acao, status_anterior, status_novo)
  values (
    v_id_solicitacao,
    p_id_designer,
    format('Agendamento de publicação atualizado para %s %s (RF012)', p_data_publicacao, p_horario),
    'Agendado',
    'Agendado'
  );
end;
$$;

revoke all on function public.update_agendamento(bigint, uuid, date, time, text) from public;
revoke all on function public.update_agendamento(bigint, uuid, date, time, text) from anon, authenticated;
grant execute on function public.update_agendamento(bigint, uuid, date, time, text) to service_role;

-- RF013/RN31: cancela o agendamento somente se faltarem >= 3h para o
-- horário planejado; a solicitação volta a Aprovado (o design continua
-- aprovado, só deixou de estar agendado — distinto do "Cancelado" de
-- RF009, que é o cliente cancelando a solicitação inteira).
create or replace function public.cancel_agendamento(
  p_id_agendamento bigint,
  p_id_designer uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id_designer uuid;
  v_id_solicitacao bigint;
  v_status_agendamento text;
  v_data_publicacao date;
  v_horario time;
  v_scheduled_at timestamptz;
begin
  -- Mesma padronização de lock de `update_agendamento` acima: trava
  -- `agendamento_publicacao` e `solicitacao` juntas.
  select s.id_designer, a.id_solicitacao, a.status, a.data_publicacao, a.horario
  into v_id_designer, v_id_solicitacao, v_status_agendamento, v_data_publicacao, v_horario
  from public.agendamento_publicacao a
  join public.solicitacao s on s.id_solicitacao = a.id_solicitacao
  where a.id_agendamento = p_id_agendamento
  for update of a, s;

  if v_id_designer is null or v_id_designer <> p_id_designer then
    raise exception 'agendamento % não encontrado', p_id_agendamento using errcode = 'P0002';
  end if;

  if v_status_agendamento <> 'Agendado' then
    raise exception
      'agendamento % não está ativo (status atual: %)', p_id_agendamento, v_status_agendamento
      using errcode = 'P0001';
  end if;

  v_scheduled_at := (v_data_publicacao + v_horario) at time zone 'America/Sao_Paulo';
  if v_scheduled_at - now() < interval '3 hours' then
    raise exception
      'cancelamento não permitido: faltam menos de 3 horas para a publicação (RN31)'
      using errcode = 'P0005';
  end if;

  update public.agendamento_publicacao
  set status = 'Cancelado'
  where id_agendamento = p_id_agendamento;

  update public.solicitacao
  set status = 'Aprovado'
  where id_solicitacao = v_id_solicitacao;

  insert into public.historico_solicitacao (id_solicitacao, id_usuario, acao, status_anterior, status_novo)
  values (
    v_id_solicitacao,
    p_id_designer,
    format('Agendamento de publicação cancelado (RF013), horário planejado: %s %s', v_data_publicacao, v_horario),
    'Agendado',
    'Aprovado'
  );
end;
$$;

revoke all on function public.cancel_agendamento(bigint, uuid) from public;
revoke all on function public.cancel_agendamento(bigint, uuid) from anon, authenticated;
grant execute on function public.cancel_agendamento(bigint, uuid) to service_role;
