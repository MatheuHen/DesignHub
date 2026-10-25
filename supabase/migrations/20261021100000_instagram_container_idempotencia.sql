-- DesignHub — RF014/RN32-RN35/seção 12.4 (idempotência): fecha a janela de
-- PUBLICAÇÃO DUPLICADA REAL no Instagram observada em produção.
--
-- Caso real reproduzido: um agendamento foi publicado DUAS vezes na conta do
-- cliente (um post ~5 min após o horário e outro ~15 min depois). A proteção
-- anterior (`instagram_media_id_pendente`, migration 20260914010000) só cobre
-- a janela entre a Meta confirmar a publicação e o processo conseguir gravar a
-- marca. Ela não cobre o caso em que o PROCESSO É MORTO no meio da chamada —
-- que é exatamente o que acontecia aqui: o cron chamava o endpoint interno via
-- `net.http_post` sem `timeout_milliseconds`, ou seja, com o default de 5s do
-- pg_net, enquanto `publishImage` leva mais que isso por construção (criar
-- container + poll obrigatório de `status_code` + publicar). A conexão era
-- cortada no meio, nenhuma marca era persistida, a reserva do agendamento
-- expirava sozinha após 300s e o ciclo seguinte do cron publicava de novo.
--
-- Correção estrutural: persistir o `creation_id` do container de mídia
-- IMEDIATAMENTE após a Meta criá-lo e ANTES de `media_publish`. A partir daí,
-- qualquer interrupção é recuperável sem republicar: a tentativa seguinte
-- reusa o mesmo container e consulta o `status_code` real na Meta —
-- `PUBLISHED` significa que o post já existe e só falta registrar;
-- `FINISHED`/`IN_PROGRESS` significa que ainda não foi publicado e o MESMO
-- container é publicado (nunca um novo); `ERROR`/`EXPIRED` significa que
-- nenhum post foi criado e só então um container novo é gerado.
--
-- Nenhuma regra de negócio nova: RN30/RN32/RN33/RN34/RN35 e a máquina de
-- estados (RF011) permanecem idênticas. Campo técnico do job, como os demais
-- desta tabela — nunca lido ou gravado pelo frontend nem por rota de
-- designer/administrador.

alter table public.agendamento_publicacao
  add column if not exists instagram_container_id_pendente text;

comment on column public.agendamento_publicacao.instagram_container_id_pendente is
  'Marca técnica: creation_id do container de mídia criado na Instagram API nesta reserva, persistido ANTES de media_publish para que uma interrupção do processo seja recuperável sem publicar duas vezes. Nunca lida/gravada pelo frontend ou rotas de designer/administrador.';

-- Grava a marca do container antes de qualquer tentativa de publicação. O
-- `status = 'Agendado'` no WHERE garante que uma publicação já concluída
-- (ou um agendamento cancelado) nunca recebe marca nova.
create or replace function public.set_instagram_container_pendente(
  p_id_agendamento bigint,
  p_container_id text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.agendamento_publicacao
  set instagram_container_id_pendente = p_container_id
  where id_agendamento = p_id_agendamento
    and status = 'Agendado';
end;
$$;

revoke all on function public.set_instagram_container_pendente(bigint, text) from public;
revoke all on function public.set_instagram_container_pendente(bigint, text) from anon, authenticated;
grant execute on function public.set_instagram_container_pendente(bigint, text) to service_role;

-- Recria `register_publicacao_sucesso` com a MESMA assinatura e o MESMO
-- comportamento da versão anterior (20260914010000), acrescentando apenas a
-- limpeza da nova marca técnica ao concluir — higiene, sem efeito funcional:
-- a linha já virou 'Publicado' e nunca mais é reclamada por
-- `listAgendamentosVencidos`, que filtra status = 'Agendado'.
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
      instagram_permalink_pendente = null,
      instagram_container_id_pendente = null
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
