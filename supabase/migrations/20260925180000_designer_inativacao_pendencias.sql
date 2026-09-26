-- DesignHub — rodada final (item 4): inativação de designer com solicitações
-- pendentes (estados NÃO terminais, ou seja, diferentes de 'Publicado' e
-- 'Cancelado'). Estratégia "cancelar pendências" precisa ser atômica: cancela
-- todas as solicitações pendentes (mesma regra de `cancel_solicitacao_designer`,
-- incluindo agendamento ativo) e só então inativa o designer, tudo em uma
-- única transação — nunca deixar o designer inativo com pendências
-- "meio-canceladas" nem pendências canceladas com o designer ainda ativo.
--
-- Ator é sempre o Administrador que executou a ação (nunca o designer sendo
-- inativado) — diferente de `cancel_solicitacao_designer`, que registra o
-- próprio designer como ator.
create or replace function public.admin_cancelar_pendencias_designer(
  p_id_designer uuid,
  p_ator_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_solicitacao record;
  v_agendamento_id bigint;
  v_agendamento_data date;
  v_agendamento_horario time;
  v_total integer := 0;
begin
  perform 1 from public.usuario where id_usuario = p_id_designer and perfil = 'designer' for update;
  if not found then
    raise exception 'designer % não encontrado', p_id_designer using errcode = 'P0002';
  end if;

  for v_solicitacao in
    select s.id_solicitacao, s.status
    from public.solicitacao s
    where s.id_designer = p_id_designer
      and s.status not in ('Publicado', 'Cancelado')
    order by s.id_solicitacao
    for update
  loop
    v_agendamento_id := null;

    select a.id_agendamento, a.data_publicacao, a.horario
    into v_agendamento_id, v_agendamento_data, v_agendamento_horario
    from public.agendamento_publicacao a
    where a.id_solicitacao = v_solicitacao.id_solicitacao and a.status = 'Agendado'
    for update;

    if v_agendamento_id is not null then
      update public.agendamento_publicacao
      set status = 'Cancelado'
      where id_agendamento = v_agendamento_id;
    end if;

    update public.solicitacao
    set status = 'Cancelado'
    where id_solicitacao = v_solicitacao.id_solicitacao;

    insert into public.historico_solicitacao (id_solicitacao, id_usuario, acao, status_anterior, status_novo)
    values (
      v_solicitacao.id_solicitacao,
      p_ator_id,
      case
        when v_agendamento_id is not null then
          format(
            'Administrador cancelou a solicitação ao inativar o designer responsável (agendamento de publicação para %s %s também cancelado)',
            v_agendamento_data, v_agendamento_horario
          )
        else 'Administrador cancelou a solicitação ao inativar o designer responsável'
      end,
      v_solicitacao.status,
      'Cancelado'
    );

    v_total := v_total + 1;
  end loop;

  update public.designer set bloqueado = false where id_usuario = p_id_designer;
  update public.usuario set status = 'inativo' where id_usuario = p_id_designer and perfil = 'designer';

  return v_total;
end;
$$;

revoke all on function public.admin_cancelar_pendencias_designer(uuid, uuid) from public;
revoke all on function public.admin_cancelar_pendencias_designer(uuid, uuid) from anon, authenticated;
grant execute on function public.admin_cancelar_pendencias_designer(uuid, uuid) to service_role;
