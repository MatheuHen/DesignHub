-- DesignHub — RF014/seção 12.1: emissão ATÔMICA do state do OAuth do Instagram.
--
-- Contexto: a regra é existir no máximo UM link de vinculação válido por
-- cliente. A primeira implementação fazia isso em duas chamadas separadas do
-- backend (INSERT do novo state + UPDATE invalidando os demais). Revisão de
-- concorrência encontrou um defeito real nesse desenho: em dois cliques
-- quase simultâneos do designer, as duas emissões se entrelaçam —
--
--   A: insere state A
--   B: insere state B
--   A: invalida "todos menos A"  -> invalida B
--   B: invalida "todos menos B"  -> invalida A
--
-- e o cliente termina SEM nenhum link válido (falha segura, mas quebra o
-- fluxo sem motivo). Esta função resolve emitindo e invalidando na MESMA
-- transação, serializada por cliente com um lock de linha em `cliente`:
-- a segunda emissão espera a primeira, enxerga o state dela, invalida-o e
-- deixa exatamente o seu próprio válido (o mais recente ganha).
--
-- Nenhuma mudança de requisito, estado, tabela ou coluna: apenas torna
-- atômico o que já era a regra pretendida.

create or replace function public.emitir_instagram_oauth_state(
  p_id_cliente bigint,
  p_id_designer uuid,
  p_state_hash text,
  p_expires_at timestamptz,
  p_origem text
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_cliente_existe boolean;
  v_invalidados integer;
begin
  -- Lock de linha por cliente: serializa emissões concorrentes do mesmo
  -- cliente sem bloquear clientes diferentes.
  select true into v_cliente_existe
  from public.cliente
  where id_cliente = p_id_cliente
  for update;

  if v_cliente_existe is not true then
    raise exception 'cliente % não encontrado', p_id_cliente using errcode = 'P0002';
  end if;

  -- Invalida os links anteriores ainda não consumidos deste cliente.
  update public.instagram_oauth_state
  set used_at = now()
  where id_cliente = p_id_cliente
    and used_at is null;

  get diagnostics v_invalidados = row_count;

  insert into public.instagram_oauth_state (state_hash, id_cliente, id_designer, expires_at, origem)
  values (p_state_hash, p_id_cliente, p_id_designer, p_expires_at, p_origem);

  return v_invalidados;
end;
$$;

comment on function public.emitir_instagram_oauth_state(bigint, uuid, text, timestamptz, text) is
  'RF014: emite o state do OAuth do Instagram invalidando, na mesma transação e sob lock do cliente, os links anteriores ainda não consumidos — garante no máximo um link de vinculação válido por cliente mesmo em emissões concorrentes.';

-- Mesma política das demais funções SECURITY DEFINER desta base.
revoke all on function public.emitir_instagram_oauth_state(bigint, uuid, text, timestamptz, text) from public;
revoke all on function public.emitir_instagram_oauth_state(bigint, uuid, text, timestamptz, text) from anon, authenticated;
grant execute on function public.emitir_instagram_oauth_state(bigint, uuid, text, timestamptz, text) to service_role;
