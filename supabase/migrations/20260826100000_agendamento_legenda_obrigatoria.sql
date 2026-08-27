-- DesignHub — RF012/RN28: legenda passa a ser obrigatória no agendamento
-- (a redação do documento não qualifica legenda como opcional: "Agendamento
-- registra data, hora e legenda", junto de data/horário). Backfill defensivo
-- para qualquer linha histórica sem legenda antes de aplicar NOT NULL.

update public.agendamento_publicacao
set legenda = 'Legenda não informada'
where legenda is null or btrim(legenda) = '';

alter table public.agendamento_publicacao
  alter column legenda set not null;

alter table public.agendamento_publicacao
  add constraint agendamento_publicacao_legenda_nao_vazia check (btrim(legenda) <> '');

-- create_agendamento/update_agendamento passam a validar legenda como
-- obrigatória na própria função (mesma defesa em profundidade já aplicada a
-- data/horário), preservando o restante do comportamento.
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

  if v_status <> 'Aprovado' then
    raise exception
      'solicitação % não está aprovada (status atual: %)', p_id_solicitacao, v_status
      using errcode = 'P0001';
  end if;

  if p_data_publicacao is null or p_horario is null then
    raise exception 'data/horário do agendamento são obrigatórios' using errcode = 'P0004';
  end if;

  if p_legenda is null or btrim(p_legenda) = '' then
    raise exception 'legenda do agendamento é obrigatória' using errcode = 'P0006';
  end if;

  v_scheduled_at := (p_data_publicacao + p_horario) at time zone 'America/Sao_Paulo';
  if v_scheduled_at <= now() then
    raise exception 'data/horário do agendamento deve ser no futuro' using errcode = 'P0004';
  end if;

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
    format('Publicação agendada para %s %s', p_data_publicacao, p_horario),
    'Aprovado',
    'Agendado'
  );

  return query select v_id_agendamento;
end;
$$;

revoke all on function public.create_agendamento(bigint, uuid, date, time, text) from public;
revoke all on function public.create_agendamento(bigint, uuid, date, time, text) from anon, authenticated;
grant execute on function public.create_agendamento(bigint, uuid, date, time, text) to service_role;

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

  if p_legenda is null or btrim(p_legenda) = '' then
    raise exception 'legenda do agendamento é obrigatória' using errcode = 'P0006';
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

  insert into public.historico_solicitacao (id_solicitacao, id_usuario, acao, status_anterior, status_novo)
  values (
    v_id_solicitacao,
    p_id_designer,
    format('Agendamento de publicação atualizado para %s %s', p_data_publicacao, p_horario),
    'Agendado',
    'Agendado'
  );
end;
$$;

revoke all on function public.update_agendamento(bigint, uuid, date, time, text) from public;
revoke all on function public.update_agendamento(bigint, uuid, date, time, text) from anon, authenticated;
grant execute on function public.update_agendamento(bigint, uuid, date, time, text) to service_role;
