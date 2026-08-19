-- DesignHub — hotfix: register_versao_arte falhava em runtime com
-- "column reference numero_versao is ambiguous" (SQLSTATE 42702).
-- Descoberto ao validar o upload de versão pela primeira vez contra
-- Postgres real (Fase 15). CREATE FUNCTION não detecta isso em tempo de
-- criação (plpgsql só valida a query no primeiro EXECUTE), por isso a
-- migration original (20260816160000) foi aplicada sem erro aparente.
-- Redefine a função com o mesmo corpo, apenas qualificando a coluna.

create or replace function public.register_versao_arte(
  p_id_solicitacao bigint,
  p_id_designer uuid,
  p_arquivo_path text,
  p_formato text,
  p_observacoes text
)
returns table (id_versao bigint, numero_versao integer, status_anterior text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id_designer uuid;
  v_status text;
  v_next_numero integer;
  v_id_versao bigint;
begin
  select s.id_designer, s.status
  into v_id_designer, v_status
  from public.solicitacao s
  where s.id_solicitacao = p_id_solicitacao
  for update;

  if v_id_designer is null or v_id_designer <> p_id_designer then
    raise exception 'solicitação % não encontrada', p_id_solicitacao using errcode = 'P0002';
  end if;

  if v_status not in ('Em produção', 'Ajustes') then
    raise exception
      'solicitação % não está em um status que permite envio de nova versão (status atual: %)',
      p_id_solicitacao, v_status
      using errcode = 'P0001';
  end if;

  select coalesce(max(versao_arte.numero_versao), 0) + 1
  into v_next_numero
  from public.versao_arte
  where versao_arte.id_solicitacao = p_id_solicitacao;

  insert into public.versao_arte (id_solicitacao, numero_versao, arquivo_url, formato, observacoes)
  values (p_id_solicitacao, v_next_numero, p_arquivo_path, p_formato, p_observacoes)
  returning versao_arte.id_versao into v_id_versao;

  update public.solicitacao
  set status = 'Enviado para avaliação'
  where id_solicitacao = p_id_solicitacao;

  insert into public.historico_solicitacao (id_solicitacao, id_usuario, acao, status_anterior, status_novo)
  values (
    p_id_solicitacao,
    p_id_designer,
    format('Nova versão enviada (V%s) — RF007/RF008', v_next_numero),
    v_status,
    'Enviado para avaliação'
  );

  return query select v_id_versao, v_next_numero, v_status;
end;
$$;

revoke all on function public.register_versao_arte(bigint, uuid, text, text, text) from public;
revoke all on function public.register_versao_arte(bigint, uuid, text, text, text) from anon, authenticated;
grant execute on function public.register_versao_arte(bigint, uuid, text, text, text) to service_role;
