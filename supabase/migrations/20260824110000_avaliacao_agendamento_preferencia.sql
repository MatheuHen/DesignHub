-- DesignHub — RN.22/RN.27/RN.29 (fonte primária, Roteiro/TFC1.pdf):
-- "Toda arte aprovada, o cliente informa se deseja o agendamento da
-- publicação, podendo indicar data e horário desejados" (RN.22); o
-- agendamento em si "pode ser realizado pelo cliente ou pelo designer,
-- sendo que... o designer poderá realizar o agendamento" (RN.27/RN.29) —
-- ou seja, a preferência é do cliente, mas quem efetivamente cria/gerencia
-- o registro de `agendamento_publicacao` continua sendo o Designer via
-- RF012 (ver docs/decisions/0004-...). Estas colunas ficam na própria
-- `avaliacao` porque RN.22 vincula a informação ao exato momento em que o
-- cliente aprova a versão — mesmo padrão de "decisão do cliente sobre a
-- versão em avaliação" já documentado na Fase 9. Ver
-- docs/decisions/0004-preferencia-agendamento-cliente.md.
alter table public.avaliacao
  add column deseja_agendamento boolean,
  add column data_desejada date,
  add column horario_desejado time;

alter table public.avaliacao
  add constraint avaliacao_agendamento_desejado_tem_data_horario
  check (deseja_agendamento is not true or (data_desejada is not null and horario_desejado is not null));

comment on column public.avaliacao.deseja_agendamento is 'RN22: só relevante quando decisao = Aprovado; null nas demais decisões.';
comment on column public.avaliacao.data_desejada is 'RN22/RN27: data desejada pelo cliente para a publicação, quando deseja_agendamento = true.';
comment on column public.avaliacao.horario_desejado is 'RN22/RN27: horário desejado pelo cliente para a publicação, quando deseja_agendamento = true.';

create or replace function public.submit_avaliacao(
  p_token_hash text,
  p_decisao text,
  p_descricao_ajuste text,
  p_observacoes_ajuste text,
  p_imagem_referencia_path text,
  p_deseja_agendamento boolean default null,
  p_data_desejada date default null,
  p_horario_desejado time default null
)
returns table (id_solicitacao bigint, status_novo text, numero_versao integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id_token bigint;
  v_id_versao bigint;
  v_expires_at timestamptz;
  v_revoked_at timestamptz;
  v_used_at timestamptz;
  v_id_solicitacao bigint;
  v_status text;
  v_numero_versao integer;
  v_id_avaliacao bigint;
  v_acao text;
begin
  select t.id_token, t.id_versao
  into v_id_token, v_id_versao
  from public.avaliacao_link_token t
  where t.token_hash = p_token_hash;

  if v_id_token is null then
    raise exception 'link de avaliação inválido' using errcode = 'P0002';
  end if;

  select v.id_solicitacao, v.numero_versao
  into v_id_solicitacao, v_numero_versao
  from public.versao_arte v
  where v.id_versao = v_id_versao;

  select s.status
  into v_status
  from public.solicitacao s
  where s.id_solicitacao = v_id_solicitacao
  for update;

  select t.expires_at, t.revoked_at, t.used_at
  into v_expires_at, v_revoked_at, v_used_at
  from public.avaliacao_link_token t
  where t.id_token = v_id_token
  for update;

  if v_revoked_at is not null then
    raise exception 'link de avaliação inválido' using errcode = 'P0002';
  end if;

  if v_used_at is not null then
    raise exception 'link de avaliação já utilizado' using errcode = 'P0004';
  end if;

  if v_expires_at < now() then
    raise exception 'link de avaliação expirado' using errcode = 'P0003';
  end if;

  if v_status <> 'Enviado para avaliação' then
    raise exception
      'solicitação % não está mais aguardando avaliação (status atual: %)', v_id_solicitacao, v_status
      using errcode = 'P0001';
  end if;

  if p_decisao not in ('Aprovado', 'Ajustes', 'Cancelado') then
    raise exception 'decisão % inválida', p_decisao using errcode = 'P0001';
  end if;

  insert into public.avaliacao (id_versao, decisao, deseja_agendamento, data_desejada, horario_desejado)
  values (
    v_id_versao,
    p_decisao,
    case when p_decisao = 'Aprovado' then p_deseja_agendamento else null end,
    case when p_decisao = 'Aprovado' then p_data_desejada else null end,
    case when p_decisao = 'Aprovado' then p_horario_desejado else null end
  )
  returning id_avaliacao into v_id_avaliacao;

  if p_decisao = 'Ajustes' then
    insert into public.ajuste (id_avaliacao, descricao, observacoes, imagem_referencia_url)
    values (v_id_avaliacao, p_descricao_ajuste, p_observacoes_ajuste, p_imagem_referencia_path);
  end if;

  case p_decisao
    when 'Aprovado' then
      v_acao := 'Cliente aprovou a arte';
    when 'Ajustes' then
      v_acao := 'Cliente solicitou ajustes';
    when 'Cancelado' then
      v_acao := 'Cliente cancelou a solicitação';
  end case;

  update public.solicitacao
  set status = p_decisao
  where solicitacao.id_solicitacao = v_id_solicitacao;

  insert into public.historico_solicitacao (id_solicitacao, id_usuario, acao, status_anterior, status_novo)
  values (v_id_solicitacao, null, v_acao, 'Enviado para avaliação', p_decisao);

  update public.avaliacao_link_token
  set used_at = now()
  where id_token = v_id_token;

  return query select v_id_solicitacao, p_decisao, v_numero_versao;
end;
$$;

revoke all on function public.submit_avaliacao(text, text, text, text, text, boolean, date, time) from public;
revoke all on function public.submit_avaliacao(text, text, text, text, text, boolean, date, time) from anon, authenticated;
grant execute on function public.submit_avaliacao(text, text, text, text, text, boolean, date, time) to service_role;

-- A assinatura antiga (5 parâmetros) deixa de ser usada pelo backend; removida
-- para não deixar duas versões sobrecarregadas da mesma função no catálogo.
drop function if exists public.submit_avaliacao(text, text, text, text, text);
