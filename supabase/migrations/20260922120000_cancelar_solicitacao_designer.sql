-- DesignHub — rodada correções 22/09/2026, item 12/30 (RF005/RF009/RF011):
-- Designer cancela a própria solicitação em qualquer estado ativo (Em
-- produção, Enviado para avaliação, Ajustes, Aprovado, Agendado) — não só o
-- cliente, como já existia via link de avaliação (RF009). Cancela também o
-- agendamento ativo, se houver, para nunca deixar uma publicação automática
-- futura pendente de uma solicitação cancelada (a janela de 3h do RF013
-- protege só o cancelamento ISOLADO do agendamento, não se aplica aqui).

create or replace function public.cancel_solicitacao_designer(
  p_id_solicitacao bigint,
  p_id_designer uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id_designer uuid;
  v_status text;
  v_agendamento_id bigint;
  v_agendamento_data date;
  v_agendamento_horario time;
begin
  select s.id_designer, s.status
  into v_id_designer, v_status
  from public.solicitacao s
  where s.id_solicitacao = p_id_solicitacao
  for update;

  if v_id_designer is null or v_id_designer <> p_id_designer then
    raise exception 'solicitação % não encontrada', p_id_solicitacao using errcode = 'P0002';
  end if;

  if v_status in ('Cancelado', 'Publicado') then
    raise exception
      'solicitação % não pode mais ser cancelada (status atual: %)', p_id_solicitacao, v_status
      using errcode = 'P0001';
  end if;

  select a.id_agendamento, a.data_publicacao, a.horario
  into v_agendamento_id, v_agendamento_data, v_agendamento_horario
  from public.agendamento_publicacao a
  where a.id_solicitacao = p_id_solicitacao and a.status = 'Agendado'
  for update;

  if v_agendamento_id is not null then
    update public.agendamento_publicacao
    set status = 'Cancelado'
    where id_agendamento = v_agendamento_id;
  end if;

  update public.solicitacao
  set status = 'Cancelado'
  where id_solicitacao = p_id_solicitacao;

  insert into public.historico_solicitacao (id_solicitacao, id_usuario, acao, status_anterior, status_novo)
  values (
    p_id_solicitacao,
    p_id_designer,
    case
      when v_agendamento_id is not null then
        format(
          'Designer cancelou a solicitação (agendamento de publicação para %s %s também cancelado)',
          v_agendamento_data, v_agendamento_horario
        )
      else 'Designer cancelou a solicitação'
    end,
    v_status,
    'Cancelado'
  );
end;
$$;

revoke all on function public.cancel_solicitacao_designer(bigint, uuid) from public;
revoke all on function public.cancel_solicitacao_designer(bigint, uuid) from anon, authenticated;
grant execute on function public.cancel_solicitacao_designer(bigint, uuid) to service_role;
