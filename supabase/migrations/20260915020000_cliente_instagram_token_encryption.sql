-- DesignHub — criptografia em repouso do access_token do Instagram (RF014/ADR 0005)
-- RF/RN/RNF: RF014, RNF007 (segurança), seção 12.5 do CLAUDE.md (segredos e
-- dados sensíveis nunca em texto puro quando evitável).
--
-- `cliente_instagram_conexao.access_token` guardava o token OAuth de
-- publicação em texto puro (mitigado só por RLS + acesso exclusivo via
-- service_role). Esta migration substitui a coluna por `access_token_enc`
-- (bytea, cifrado com pgcrypto `pgp_sym_encrypt`) e move toda leitura/escrita
-- do token para duas funções SECURITY DEFINER que recebem a chave de
-- cifragem como PARÂMETRO em cada chamada — a chave nunca é persistida no
-- banco (nem em vault, nem em config), só existe no processo do backend via
-- `INSTAGRAM_TOKEN_ENC_KEY` (env server-only, seção 8 do CLAUDE.md).
--
-- Tabela sem nenhuma linha em produção nesta data (nenhum cliente concluiu o
-- handshake OAuth ainda — confirmado antes de aplicar), então a troca de
-- coluna não descarta nenhum token real: nenhum "Conectar Instagram"
-- precisa ser refeito por causa desta migration.

alter table public.cliente_instagram_conexao
  drop column access_token,
  add column access_token_enc bytea not null;

comment on column public.cliente_instagram_conexao.access_token_enc is
  'Token OAuth do Instagram cifrado com pgcrypto pgp_sym_encrypt; só é legível via get_instagram_conexao_ativa() com a chave correta (INSTAGRAM_TOKEN_ENC_KEY), nunca por SELECT direto.';

create or replace function public.upsert_cliente_instagram_conexao(
  p_id_cliente bigint,
  p_instagram_user_id text,
  p_access_token text,
  p_token_expira_em timestamptz,
  p_enc_key text
)
returns void
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  if p_enc_key is null or length(p_enc_key) = 0 then
    raise exception 'Chave de cifragem ausente.' using errcode = 'P0001';
  end if;

  insert into public.cliente_instagram_conexao (
    id_cliente, instagram_user_id, access_token_enc, token_expira_em, updated_at
  )
  values (
    p_id_cliente,
    p_instagram_user_id,
    extensions.pgp_sym_encrypt(p_access_token, p_enc_key),
    p_token_expira_em,
    now()
  )
  on conflict (id_cliente) do update
    set instagram_user_id = excluded.instagram_user_id,
        access_token_enc = excluded.access_token_enc,
        token_expira_em = excluded.token_expira_em,
        updated_at = now();
end;
$$;

comment on function public.upsert_cliente_instagram_conexao(bigint, text, text, timestamptz, text) is
  'RF014/ADR 0005: grava a conexão do Instagram cifrando o access_token com a chave recebida por parâmetro (nunca persistida no banco).';

revoke all on function public.upsert_cliente_instagram_conexao(bigint, text, text, timestamptz, text) from public;
revoke all on function public.upsert_cliente_instagram_conexao(bigint, text, text, timestamptz, text) from anon, authenticated;
grant execute on function public.upsert_cliente_instagram_conexao(bigint, text, text, timestamptz, text) to service_role;

create or replace function public.get_instagram_conexao_ativa(
  p_id_cliente bigint,
  p_enc_key text
)
returns table (instagram_user_id text, access_token text, token_expira_em timestamptz)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  if p_enc_key is null or length(p_enc_key) = 0 then
    raise exception 'Chave de cifragem ausente.' using errcode = 'P0001';
  end if;

  return query
  select c.instagram_user_id,
         extensions.pgp_sym_decrypt(c.access_token_enc, p_enc_key),
         c.token_expira_em
  from public.cliente_instagram_conexao c
  where c.id_cliente = p_id_cliente
    and c.token_expira_em > now();
end;
$$;

comment on function public.get_instagram_conexao_ativa(bigint, text) is
  'RF014/ADR 0005: lê a conexão ativa do cliente decifrando o access_token com a chave recebida por parâmetro (nunca persistida no banco).';

revoke all on function public.get_instagram_conexao_ativa(bigint, text) from public;
revoke all on function public.get_instagram_conexao_ativa(bigint, text) from anon, authenticated;
grant execute on function public.get_instagram_conexao_ativa(bigint, text) to service_role;
