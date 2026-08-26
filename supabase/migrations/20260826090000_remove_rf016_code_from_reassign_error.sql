-- DesignHub — item 11 (textos técnicos): a mensagem de erro de
-- `reassign_solicitacao` ("designer de destino precisa estar ativo (RF016)")
-- chegava crua ao Administrador via ConflictError quando a reatribuição é
-- rejeitada (designer de destino inativo). Corrige só o texto da mensagem;
-- nenhuma lógica, assinatura, permissão ou comportamento muda.
create or replace function public.reassign_solicitacao(
  p_id_solicitacao bigint,
  p_novo_designer_id uuid,
  p_ator_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_status text;
  v_designer_anterior_id uuid;
  v_designer_anterior_nome text;
  v_designer_novo_nome text;
  v_designer_novo_status text;
begin
  select status, id_designer into v_status, v_designer_anterior_id
  from public.solicitacao
  where id_solicitacao = p_id_solicitacao
  for update;

  if v_status is null then
    raise exception 'solicitacao % não encontrada', p_id_solicitacao using errcode = 'P0002';
  end if;

  select u.status, u.nome_completo into v_designer_novo_status, v_designer_novo_nome
  from public.usuario u
  join public.designer d on d.id_usuario = u.id_usuario
  where u.id_usuario = p_novo_designer_id
  for update of u;

  if v_designer_novo_nome is null then
    raise exception 'designer de destino % não encontrado', p_novo_designer_id using errcode = 'P0002';
  end if;

  if v_designer_novo_status is distinct from 'ativo' then
    raise exception 'designer de destino precisa estar ativo' using errcode = 'P0001';
  end if;

  select nome_completo into v_designer_anterior_nome
  from public.usuario
  where id_usuario = v_designer_anterior_id;

  update public.solicitacao
  set id_designer = p_novo_designer_id, updated_at = now()
  where id_solicitacao = p_id_solicitacao;

  insert into public.historico_solicitacao (id_solicitacao, id_usuario, acao, status_anterior, status_novo)
  values (
    p_id_solicitacao,
    p_ator_id,
    format(
      'Reatribuído de %s para %s',
      coalesce(v_designer_anterior_nome, v_designer_anterior_id::text),
      v_designer_novo_nome
    ),
    v_status,
    v_status
  );
end;
$$;

revoke all on function public.reassign_solicitacao(bigint, uuid, uuid) from public;
revoke all on function public.reassign_solicitacao(bigint, uuid, uuid) from anon, authenticated;
grant execute on function public.reassign_solicitacao(bigint, uuid, uuid) to service_role;
