-- DesignHub — RF001: criação atômica do perfil vinculado (usuario + designer)
-- RNF009: o service anterior fazia dois INSERT separados (usuario, depois
-- designer) sem transação — uma falha no segundo INSERT deixava uma linha
-- `usuario(perfil='designer')` órfã sem `designer` correspondente. Esta
-- função agrupa os dois INSERTs numa única chamada, que roda atomicamente
-- (rollback automático se qualquer INSERT falhar). O backend ainda faz
-- `auth.admin.deleteUser` como compensação se esta função falhar depois do
-- convite Supabase Auth já ter sido criado.
--
-- Mesma política de acesso da seção 12.4: revogar de anon/authenticated
-- (não só de public, pois o Supabase concede EXECUTE direto a esses roles
-- por padrão) e conceder apenas a service_role.
create or replace function public.create_designer_profile(
  p_id_usuario uuid,
  p_nome_completo text,
  p_email extensions.citext,
  p_whatsapp text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.usuario (id_usuario, nome_completo, email, perfil, status)
  values (p_id_usuario, p_nome_completo, p_email, 'designer', 'ativo');

  insert into public.designer (id_usuario, whatsapp, bloqueado)
  values (p_id_usuario, p_whatsapp, false);
end;
$$;

revoke all on function public.create_designer_profile(uuid, text, extensions.citext, text) from public;
revoke all on function public.create_designer_profile(uuid, text, extensions.citext, text) from anon, authenticated;
grant execute on function public.create_designer_profile(uuid, text, extensions.citext, text) to service_role;
