-- DesignHub — correções 13/09/2026, item 8.4 (RF012/RF013/RN31)
-- MELHORIA APROVADA: cliente pode cancelar o agendamento da própria
-- solicitação (mesma regra de 3h do designer), sem duplicar a função
-- existente `cancel_agendamento` (que autentica por id_designer). Esta
-- variante autentica por `id_solicitacao`, já resolvido no service a partir
-- do token opaco de avaliação (RF009) — nunca recebe um ID vindo direto do
-- cliente sem passar por essa resolução, evitando IDOR (seção 12.1).
-- Ator sem `usuario.id_usuario` (cliente não tem conta): mesmo padrão já
-- usado em `submit_avaliacao` (id_usuario = null, ator descrito em `acao`).

create or replace function public.cancel_agendamento_cliente(
  p_id_solicitacao bigint
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id_agendamento bigint;
  v_status_agendamento text;
  v_data_publicacao date;
  v_horario time;
  v_scheduled_at timestamptz;
begin
  select a.id_agendamento, a.status, a.data_publicacao, a.horario
  into v_id_agendamento, v_status_agendamento, v_data_publicacao, v_horario
  from public.agendamento_publicacao a
  where a.id_solicitacao = p_id_solicitacao
    and a.status = 'Agendado'
  for update of a;

  if v_id_agendamento is null then
    raise exception 'agendamento não encontrado para esta solicitação' using errcode = 'P0002';
  end if;

  v_scheduled_at := (v_data_publicacao + v_horario) at time zone 'America/Sao_Paulo';
  if v_scheduled_at - now() < interval '3 hours' then
    raise exception
      'Cancelamento não permitido: faltam menos de 3 horas para a publicação.'
      using errcode = 'P0005';
  end if;

  update public.agendamento_publicacao
  set status = 'Cancelado'
  where id_agendamento = v_id_agendamento;

  update public.solicitacao
  set status = 'Aprovado'
  where id_solicitacao = p_id_solicitacao;

  -- item 8.6: fica visível ao designer/admin no Histórico da solicitação
  -- (alerta in-app já existente, sem necessidade de nova tabela/entidade).
  insert into public.historico_solicitacao (id_solicitacao, id_usuario, acao, status_anterior, status_novo)
  values (
    p_id_solicitacao,
    null,
    format('Cliente cancelou o agendamento da publicação, horário planejado: %s %s', v_data_publicacao, v_horario),
    'Agendado',
    'Aprovado'
  );
end;
$$;

revoke all on function public.cancel_agendamento_cliente(bigint) from public;
revoke all on function public.cancel_agendamento_cliente(bigint) from anon, authenticated;
grant execute on function public.cancel_agendamento_cliente(bigint) to service_role;
