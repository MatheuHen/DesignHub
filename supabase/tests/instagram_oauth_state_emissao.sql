-- DesignHub — teste de comportamento real de `emitir_instagram_oauth_state`
-- (RF014/seção 12.1: no máximo UM link de vinculação válido por cliente).
--
-- Infraestrutura de teste (Gate J): NÃO cria funcionalidade de produto e NÃO
-- altera dados — roda dentro de uma transação revertida ao final
-- (`rollback`). Usa um cliente já existente apenas como alvo de FK.
--
-- Como executar:
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/instagram_oauth_state_emissao.sql
--
-- A serialização de emissões CONCORRENTES (o lock de linha em `cliente`) não
-- é observável numa única sessão psql; está coberta por um teste de duas
-- conexões simultâneas, registrado nas evidências da rodada.

begin;

set local client_min_messages = notice;

do $$
declare
  v_cliente bigint;
  v_designer uuid;
  v_expira timestamptz := now() + interval '1 day';
  v_invalidados integer;
  v_pendentes_iniciais integer;
  v_validos integer;
  v_hash_anterior text := 'TESTE-anterior';
begin
  select c.id_cliente, c.id_designer into v_cliente, v_designer
  from public.cliente c
  join public.designer d on d.id_usuario = c.id_designer
  limit 1;

  if v_cliente is null then
    raise exception 'FIXTURE AUSENTE: é preciso ao menos um cliente com designer';
  end if;

  /**
   * O teste NÃO zera os links pendentes do cliente real escolhido como
   * fixture: a emissão já invalida o que estiver pendente, e mexer nessas
   * linhas antes tornaria o teste invasivo sobre dado de produção (um link
   * legítimo em uso seria derrubado se o rollback não cobrisse tudo).
   * Em vez disso, a contagem inicial é registrada e as asserções são
   * relativas a ela.
   */
  select count(*) into v_pendentes_iniciais from public.instagram_oauth_state
  where id_cliente = v_cliente and used_at is null;
  raise notice '0. links pendentes do cliente de fixture antes do teste: %', v_pendentes_iniciais;

  -- ---------------------------------------------------------------------
  -- 1. Primeira emissão: invalida exatamente o que estava pendente e fica
  --    com UM link válido (o recém-emitido).
  -- ---------------------------------------------------------------------
  select public.emitir_instagram_oauth_state(v_cliente, v_designer, 'TESTE-A', v_expira, 'cliente_link')
    into v_invalidados;
  assert v_invalidados = v_pendentes_iniciais,
    format('1. deveria invalidar os %s pendentes iniciais, invalidou %s', v_pendentes_iniciais, v_invalidados);

  select count(*) into v_validos from public.instagram_oauth_state
  where id_cliente = v_cliente and used_at is null;
  assert v_validos = 1, format('1. deveria haver 1 link válido, há %s', v_validos);
  raise notice '1. OK primeira emissão deixa exatamente um link válido';

  -- ---------------------------------------------------------------------
  -- 2. Segunda emissão invalida a anterior e continua com UM válido.
  -- ---------------------------------------------------------------------
  select public.emitir_instagram_oauth_state(v_cliente, v_designer, 'TESTE-B', v_expira, 'designer')
    into v_invalidados;
  assert v_invalidados = 1, format('2. deveria invalidar 1 link anterior, invalidou %s', v_invalidados);

  select count(*) into v_validos from public.instagram_oauth_state
  where id_cliente = v_cliente and used_at is null;
  assert v_validos = 1, format('2. deveria continuar com 1 link válido, há %s', v_validos);

  assert (select used_at is not null from public.instagram_oauth_state where state_hash = 'TESTE-A'),
    '2. o link anterior deveria estar invalidado';
  assert (select used_at is null from public.instagram_oauth_state where state_hash = 'TESTE-B'),
    '2. o link recém-emitido deveria estar válido';
  raise notice '2. OK nova emissão invalida a anterior e o mais recente vence';

  -- ---------------------------------------------------------------------
  -- 3. Um link JÁ CONSUMIDO não é tocado de novo (preserva a auditoria do
  --    instante real de consumo).
  -- ---------------------------------------------------------------------
  insert into public.instagram_oauth_state (state_hash, id_cliente, id_designer, expires_at, origem, used_at)
  values (v_hash_anterior, v_cliente, v_designer, v_expira, 'cliente_link', now() - interval '1 hour');

  select public.emitir_instagram_oauth_state(v_cliente, v_designer, 'TESTE-C', v_expira, 'cliente_link')
    into v_invalidados;
  assert v_invalidados = 1, format('3. só o TESTE-B estava pendente, invalidou %s', v_invalidados);
  assert (
    select used_at < now() - interval '30 minutes'
    from public.instagram_oauth_state where state_hash = v_hash_anterior
  ), '3. o used_at de um link já consumido não pode ser reescrito';
  raise notice '3. OK link já consumido preserva o used_at original';

  -- ---------------------------------------------------------------------
  -- 4. Cliente inexistente falha explicitamente (P0002), sem inserir nada.
  -- ---------------------------------------------------------------------
  begin
    perform public.emitir_instagram_oauth_state(
      -1::bigint, v_designer, 'TESTE-INEXISTENTE', v_expira, 'designer');
    raise exception '4. deveria ter falhado para cliente inexistente';
  exception
    when sqlstate 'P0002' then
      raise notice '4. OK cliente inexistente rejeitado com P0002';
  end;

  -- ---------------------------------------------------------------------
  -- 5. `state_hash` é único (uso único depende disso).
  -- ---------------------------------------------------------------------
  begin
    perform public.emitir_instagram_oauth_state(v_cliente, v_designer, 'TESTE-C', v_expira, 'designer');
    raise exception '5. deveria ter falhado por state_hash duplicado';
  exception
    when unique_violation then
      raise notice '5. OK state_hash duplicado rejeitado';
  end;

  raise notice 'TODOS OS CENÁRIOS PASSARAM — alterações serão revertidas pelo rollback';
end;
$$;

rollback;
