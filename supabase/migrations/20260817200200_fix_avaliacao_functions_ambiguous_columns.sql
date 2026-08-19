-- DesignHub — hotfix: generate_avaliacao_link_token e submit_avaliacao
-- falhavam em runtime com "column reference ... is ambiguous" (SQLSTATE
-- 42702), mesma classe de bug de register_versao_arte (ver
-- 20260817200100). Descoberto ao validar RF009 pela primeira vez contra
-- Postgres real (Fase 15). Redefine as duas funções com o mesmo corpo,
-- apenas qualificando as colunas que colidiam com OUT parameters de
-- `returns table`.

create or replace function public.generate_avaliacao_link_token(
  p_id_solicitacao bigint,
  p_id_designer uuid,
  p_token_hash text,
  p_expires_at timestamptz
)
returns table (id_versao bigint, numero_versao integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id_designer uuid;
  v_status text;
  v_id_versao bigint;
  v_numero_versao integer;
begin
  select s.id_designer, s.status
  into v_id_designer, v_status
  from public.solicitacao s
  where s.id_solicitacao = p_id_solicitacao
  for update;

  if v_id_designer is null or v_id_designer <> p_id_designer then
    raise exception 'solicitação % não encontrada', p_id_solicitacao using errcode = 'P0002';
  end if;

  if v_status <> 'Enviado para avaliação' then
    raise exception
      'solicitação % não está aguardando avaliação (status atual: %)', p_id_solicitacao, v_status
      using errcode = 'P0001';
  end if;

  select v.id_versao, v.numero_versao
  into v_id_versao, v_numero_versao
  from public.versao_arte v
  where v.id_solicitacao = p_id_solicitacao
  order by v.numero_versao desc
  limit 1;

  if v_id_versao is null then
    raise exception 'solicitação % não possui versão enviada', p_id_solicitacao using errcode = 'P0002';
  end if;

  update public.avaliacao_link_token
  set revoked_at = now()
  where avaliacao_link_token.id_versao = v_id_versao
    and used_at is null
    and revoked_at is null;

  insert into public.avaliacao_link_token (id_versao, token_hash, expires_at)
  values (v_id_versao, p_token_hash, p_expires_at);

  return query select v_id_versao, v_numero_versao;
end;
$$;

revoke all on function public.generate_avaliacao_link_token(bigint, uuid, text, timestamptz) from public;
revoke all on function public.generate_avaliacao_link_token(bigint, uuid, text, timestamptz) from anon, authenticated;
grant execute on function public.generate_avaliacao_link_token(bigint, uuid, text, timestamptz) to service_role;

create or replace function public.submit_avaliacao(
  p_token_hash text,
  p_decisao text,
  p_descricao_ajuste text,
  p_observacoes_ajuste text,
  p_imagem_referencia_path text
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

  insert into public.avaliacao (id_versao, decisao)
  values (v_id_versao, p_decisao)
  returning id_avaliacao into v_id_avaliacao;

  if p_decisao = 'Ajustes' then
    insert into public.ajuste (id_avaliacao, descricao, observacoes, imagem_referencia_url)
    values (v_id_avaliacao, p_descricao_ajuste, p_observacoes_ajuste, p_imagem_referencia_path);
  end if;

  case p_decisao
    when 'Aprovado' then
      v_acao := 'Cliente aprovou a arte via link de avaliação (RF009)';
    when 'Ajustes' then
      v_acao := 'Cliente solicitou ajustes via link de avaliação (RF009/RF010)';
    when 'Cancelado' then
      v_acao := 'Cliente cancelou a solicitação via link de avaliação (RF009)';
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

revoke all on function public.submit_avaliacao(text, text, text, text, text) from public;
revoke all on function public.submit_avaliacao(text, text, text, text, text) from anon, authenticated;
grant execute on function public.submit_avaliacao(text, text, text, text, text) to service_role;
