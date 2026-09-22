-- DesignHub — rodada correções 21/09/2026, itens 7/8/19 (RF011/RF012/RF014,
-- RN22/RN27/RN29): substitui a pergunta binária "deseja agendar agora?" por
-- três opções explícitas após a aprovação do cliente:
--   1. automatico       — cliente agenda a publicação de verdade, na hora,
--                          exige Instagram do cliente já conectado (RF014);
--   2. designer_manual  — mesma preferência (texto) já existente, o Designer
--                          continua sendo quem cria o agendamento real (RF012);
--   3. proprio_cliente  — cliente avisa que vai publicar por conta própria;
--                          nenhum agendamento é criado, a arte permanece
--                          Aprovado até uma publicação manual real (RF014).
--
-- Corrige também o bug relatado (item 7): quando a opção 1 é usada, o status
-- muda para Agendado IMEDIATAMENTE (mesma RPC atômica já usada pelo
-- Designer em create_agendamento, só que resolvendo o designer a partir da
-- própria solicitação em vez de exigir o caller como dono).

alter table public.avaliacao
  add column opcao_publicacao text,
  add column legenda_desejada text;

alter table public.avaliacao
  add constraint avaliacao_opcao_publicacao_valida
  check (opcao_publicacao is null or opcao_publicacao in ('automatico', 'designer_manual', 'proprio_cliente'));

alter table public.avaliacao
  add constraint avaliacao_opcao_publicacao_so_aprovado
  check (opcao_publicacao is null or decisao = 'Aprovado');

comment on column public.avaliacao.opcao_publicacao is
  'RN22/RN27/RN29: escolha do cliente ao aprovar — automatico (agenda de verdade), designer_manual (preferência para o designer confirmar) ou proprio_cliente (cliente publica por conta própria). Null nas demais decisões.';
comment on column public.avaliacao.legenda_desejada is
  'RF012/RN28: legenda opcional informada pelo cliente ao escolher automatico/designer_manual.';

-- Assinatura anterior (8 parâmetros) deixa de ser usada pelo backend.
drop function if exists public.submit_avaliacao(text, text, text, text, text, boolean, date, time);

create or replace function public.submit_avaliacao(
  p_token_hash text,
  p_decisao text,
  p_descricao_ajuste text,
  p_observacoes_ajuste text,
  p_imagem_referencia_path text,
  p_deseja_agendamento boolean default null,
  p_data_desejada date default null,
  p_horario_desejado time default null,
  p_opcao_publicacao text default null,
  p_legenda_desejada text default null
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

  if p_decisao = 'Aprovado' and p_opcao_publicacao is not null
     and p_opcao_publicacao not in ('automatico', 'designer_manual', 'proprio_cliente') then
    raise exception 'opção de publicação % inválida', p_opcao_publicacao using errcode = 'P0001';
  end if;

  insert into public.avaliacao (
    id_versao, decisao, deseja_agendamento, data_desejada, horario_desejado,
    opcao_publicacao, legenda_desejada
  )
  values (
    v_id_versao,
    p_decisao,
    case when p_decisao = 'Aprovado' then p_deseja_agendamento else null end,
    case when p_decisao = 'Aprovado' then p_data_desejada else null end,
    case when p_decisao = 'Aprovado' then p_horario_desejado else null end,
    case when p_decisao = 'Aprovado' then p_opcao_publicacao else null end,
    case when p_decisao = 'Aprovado' then p_legenda_desejada else null end
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

revoke all on function public.submit_avaliacao(text, text, text, text, text, boolean, date, time, text, text) from public;
revoke all on function public.submit_avaliacao(text, text, text, text, text, boolean, date, time, text, text) from anon, authenticated;
grant execute on function public.submit_avaliacao(text, text, text, text, text, boolean, date, time, text, text) to service_role;

-- Item 7/8 (opção 1 "agendar automaticamente"): mesma lógica atômica de
-- `create_agendamento`, mas o "dono" é resolvido a partir da própria
-- solicitação em vez de comparado a um caller autenticado — quem chama esta
-- função é sempre o backend, com id_solicitacao já resolvido a partir do
-- token de avaliação (nunca de um parâmetro aberto vindo do cliente).
create or replace function public.create_agendamento_cliente(
  p_id_solicitacao bigint,
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
  v_status text;
  v_scheduled_at timestamptz;
  v_id_agendamento bigint;
  v_legenda text;
begin
  select s.status
  into v_status
  from public.solicitacao s
  where s.id_solicitacao = p_id_solicitacao
  for update;

  if v_status is null then
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

  v_legenda := nullif(btrim(coalesce(p_legenda, '')), '');

  v_scheduled_at := (p_data_publicacao + p_horario) at time zone 'America/Sao_Paulo';
  if v_scheduled_at <= now() then
    raise exception 'data/horário do agendamento deve ser no futuro' using errcode = 'P0004';
  end if;

  insert into public.agendamento_publicacao (id_solicitacao, data_publicacao, horario, legenda)
  values (p_id_solicitacao, p_data_publicacao, p_horario, v_legenda)
  returning agendamento_publicacao.id_agendamento into v_id_agendamento;

  update public.solicitacao
  set status = 'Agendado'
  where id_solicitacao = p_id_solicitacao;

  insert into public.historico_solicitacao (id_solicitacao, id_usuario, acao, status_anterior, status_novo)
  values (
    p_id_solicitacao,
    null,
    format('Cliente agendou automaticamente a publicação para %s %s', p_data_publicacao, p_horario),
    'Aprovado',
    'Agendado'
  );

  return query select v_id_agendamento;
end;
$$;

revoke all on function public.create_agendamento_cliente(bigint, date, time, text) from public;
revoke all on function public.create_agendamento_cliente(bigint, date, time, text) from anon, authenticated;
grant execute on function public.create_agendamento_cliente(bigint, date, time, text) to service_role;
