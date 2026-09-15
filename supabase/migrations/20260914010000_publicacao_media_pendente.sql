-- DesignHub — auditoria de produção (achado HIGH, Meta reviewer): janela de
-- publicação duplicada no Instagram. Cenário: `claim_agendamento_publicacao`
-- reserva o agendamento; a chamada à Instagram API tem sucesso real (post
-- publicado na conta do cliente); antes de `register_publicacao_sucesso`
-- gravar o resultado, o processo cai (crash, timeout de função, falha de
-- rede na resposta). A reserva expira sozinha após 300s
-- (`p_stale_after_seconds`) para não travar para sempre — mas isso permitia
-- a próxima execução do cron reclamar o mesmo agendamento e publicar uma
-- SEGUNDA vez de verdade, violando RF014/RN34/RN35 e a exigência explícita
-- do projeto de nunca publicar duas vezes.
--
-- Correção: persistir o `media_id`/`permalink` retornado pela Meta
-- IMEDIATAMENTE após o sucesso da chamada, antes de `register_publicacao_
-- sucesso`. Se o processo cair depois disso, a próxima tentativa detecta a
-- marca pendente e pula a chamada à Instagram API, indo direto para o
-- registro — nunca republica.

alter table public.agendamento_publicacao
  add column if not exists instagram_media_id_pendente text,
  add column if not exists instagram_permalink_pendente text;

comment on column public.agendamento_publicacao.instagram_media_id_pendente is
  'Marca técnica: id da mídia já publicada pela Meta nesta reserva, mas ainda não confirmada em register_publicacao_sucesso (recuperação sem republicar). Nunca lida/gravada pelo frontend ou rotas de designer/administrador.';
comment on column public.agendamento_publicacao.instagram_permalink_pendente is
  'Permalink correspondente a instagram_media_id_pendente, usado para completar o registro sem chamar a Instagram API de novo.';

-- Grava a marca de recuperação logo após o sucesso real da chamada à Meta,
-- antes de qualquer outra operação que possa falhar.
create or replace function public.set_instagram_media_pendente(
  p_id_agendamento bigint,
  p_media_id text,
  p_permalink text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.agendamento_publicacao
  set instagram_media_id_pendente = p_media_id,
      instagram_permalink_pendente = p_permalink
  where id_agendamento = p_id_agendamento
    and status = 'Agendado';
end;
$$;

revoke all on function public.set_instagram_media_pendente(bigint, text, text) from public;
revoke all on function public.set_instagram_media_pendente(bigint, text, text) from anon, authenticated;
grant execute on function public.set_instagram_media_pendente(bigint, text, text) to service_role;

-- Recria register_publicacao_sucesso (mesma assinatura/comportamento) só
-- para limpar a marca de recuperação ao concluir com sucesso — higiene,
-- sem efeito funcional (a linha já virou 'Publicado' e nunca mais é
-- reclamada por listAgendamentosVencidos, que filtra status='Agendado').
create or replace function public.register_publicacao_sucesso(
  p_id_agendamento bigint,
  p_tipo text,
  p_ator_id uuid,
  p_permalink text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id_solicitacao bigint;
  v_status_agendamento text;
  v_id_versao bigint;
  v_acao text;
begin
  select a.id_solicitacao, a.status
  into v_id_solicitacao, v_status_agendamento
  from public.agendamento_publicacao a
  where a.id_agendamento = p_id_agendamento
  for update;

  if v_id_solicitacao is null then
    raise exception 'agendamento % não encontrado', p_id_agendamento using errcode = 'P0002';
  end if;

  if v_status_agendamento <> 'Agendado' then
    raise exception
      'agendamento % não está ativo (status atual: %)', p_id_agendamento, v_status_agendamento
      using errcode = 'P0001';
  end if;

  case p_tipo
    when 'automatica' then
      v_acao := 'Publicação realizada automaticamente no Instagram';
    when 'manual' then
      v_acao := 'Publicação registrada manualmente';
    else
      raise exception 'tipo de publicação % inválido', p_tipo using errcode = 'P0001';
  end case;

  select v.id_versao
  into v_id_versao
  from public.versao_arte v
  where v.id_solicitacao = v_id_solicitacao
  order by v.numero_versao desc
  limit 1;

  if v_id_versao is null then
    raise exception 'solicitação % não possui versão enviada', v_id_solicitacao using errcode = 'P0002';
  end if;

  insert into public.publicacao (id_agendamento, id_versao, data_publicada, tipo, status, permalink)
  values (p_id_agendamento, v_id_versao, now(), p_tipo, 'sucesso', p_permalink);

  update public.agendamento_publicacao
  set status = 'Publicado',
      instagram_media_id_pendente = null,
      instagram_permalink_pendente = null
  where id_agendamento = p_id_agendamento;

  update public.solicitacao
  set status = 'Publicado'
  where id_solicitacao = v_id_solicitacao;

  insert into public.historico_solicitacao (id_solicitacao, id_usuario, acao, status_anterior, status_novo)
  values (v_id_solicitacao, p_ator_id, v_acao, 'Agendado', 'Publicado');
end;
$$;

revoke all on function public.register_publicacao_sucesso(bigint, text, uuid, text) from public;
revoke all on function public.register_publicacao_sucesso(bigint, text, uuid, text) from anon, authenticated;
grant execute on function public.register_publicacao_sucesso(bigint, text, uuid, text) to service_role;
