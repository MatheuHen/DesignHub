-- DesignHub — correções 13/09/2026, itens 9.1/9.3 (RF014/RN34/RN35)
-- ADITIVO: duas colunas novas em `publicacao` (nenhuma removida/renomeada).
--   permalink        — link público do post (Meta), melhor esforço, só em
--                       publicação automática; nulo em manual/quando a Meta
--                       não retornar (item 9.1 "permalink quando seguro").
--   comprovante_url   — path privado (Storage) do print/comprovante que o
--                       designer pode anexar após a publicação, útil sobretudo
--                       na manual (item 9.3). Upload sempre opcional.

alter table public.publicacao
  add column permalink text,
  add column comprovante_url text;

comment on column public.publicacao.comprovante_url is
  'Path privado no Storage (bucket "artes"), nunca URL pública direta — mesma convenção de versao_arte.arquivo_url.';

-- Precisa recriar com um parâmetro novo (assinatura muda) — remove a função
-- de 3 parâmetros e cria a de 4, preservando todo o comportamento existente.
drop function if exists public.register_publicacao_sucesso(bigint, text, uuid);

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
  set status = 'Publicado'
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
