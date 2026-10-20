-- DesignHub — teste de comportamento real da regra RF006/RN11/RN12
-- (prazo de 5 dias por CICLO de versão + bloqueio por atraso).
--
-- Infraestrutura de teste (Gate J): NÃO cria funcionalidade de produto e NÃO
-- altera dados — roda inteiramente dentro de uma transação revertida ao final
-- (`rollback`). Usa um cliente/designer já existentes apenas como alvo de FK;
-- nenhuma linha preexistente é modificada.
--
-- Como executar:
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/prazo_ciclo_versao.sql
--
-- Qualquer asserção falsa aborta com exceção (SQLSTATE levantado por `assert`).

begin;

set local client_min_messages = notice;

do $$
declare
  v_cliente bigint;
  v_designer uuid;
  v_designer_b uuid;
  v_designer_b_bloqueado_antes boolean;
  v_solicitacao bigint;
  v_prazo timestamptz;
  v_prazo_anterior timestamptz;
  v_intervalo interval := public.prazo_ciclo_versao_intervalo();
  v_bloqueado boolean;
begin
  -- ---------------------------------------------------------------------
  -- Fixture: reaproveita um par (cliente, designer) real existente.
  -- ---------------------------------------------------------------------
  select c.id_cliente, c.id_designer into v_cliente, v_designer
  from public.cliente c
  join public.designer d on d.id_usuario = c.id_designer
  limit 1;

  if v_cliente is null then
    raise exception 'FIXTURE AUSENTE: é preciso ao menos um cliente com designer para rodar este teste';
  end if;

  select d.id_usuario, d.bloqueado into v_designer_b, v_designer_b_bloqueado_antes
  from public.designer d
  where d.id_usuario <> v_designer
  limit 1;

  -- ---------------------------------------------------------------------
  -- 1. Primeira versão: prazo nasce em data_criacao + 5 dias (inalterado).
  -- ---------------------------------------------------------------------
  insert into public.solicitacao (id_cliente, id_designer, tema, status, data_criacao)
  values (v_cliente, v_designer, '[TESTE prazo_ciclo_versao]', 'Em produção', now() - interval '1 day')
  returning id_solicitacao, prazo_primeira_versao into v_solicitacao, v_prazo;

  assert v_prazo = (now() - interval '1 day') + v_intervalo,
    format('1. prazo da primeira versão deveria ser data_criacao + %s, veio %s', v_intervalo, v_prazo);
  raise notice '1. OK primeira versão: prazo = data_criacao + %', v_intervalo;

  -- ---------------------------------------------------------------------
  -- 2. Primeira versão dentro do prazo: designer NÃO é bloqueado por ela.
  -- ---------------------------------------------------------------------
  select exists (
    select 1 from public.solicitacao s
    where s.id_solicitacao = v_solicitacao
      and s.status = any (public.status_com_prazo_designer())
      and s.prazo_primeira_versao < now()
  ) into v_bloqueado;
  assert v_bloqueado = false, '2. primeira versão dentro do prazo não pode contar como atraso';
  raise notice '2. OK primeira versão dentro do prazo não gera atraso';

  -- ---------------------------------------------------------------------
  -- 3. Primeira versão atrasada: conta como atraso (comportamento antigo,
  --    preservado).
  -- ---------------------------------------------------------------------
  update public.solicitacao
  set prazo_primeira_versao = now() - interval '1 hour'
  where id_solicitacao = v_solicitacao;
  -- (status não mudou e designer não mudou => a trigger NÃO recalcula,
  --  permitindo simular o vencimento sem manipular o relógio.)
  select prazo_primeira_versao into v_prazo from public.solicitacao where id_solicitacao = v_solicitacao;
  assert v_prazo < now(), '3. update sem troca de ciclo não deveria recalcular o prazo';

  select exists (
    select 1 from public.solicitacao s
    where s.id_solicitacao = v_solicitacao
      and s.status = any (public.status_com_prazo_designer())
      and s.prazo_primeira_versao < now()
  ) into v_bloqueado;
  assert v_bloqueado = true, '3. primeira versão vencida deve contar como atraso';
  raise notice '3. OK primeira versão atrasada gera atraso e o prazo não é recalculado fora de um novo ciclo';

  -- ---------------------------------------------------------------------
  -- 4. Versão enviada: sai dos status com prazo => pendência resolvida.
  -- ---------------------------------------------------------------------
  update public.solicitacao set status = 'Enviado para avaliação' where id_solicitacao = v_solicitacao;
  select exists (
    select 1 from public.solicitacao s
    where s.id_solicitacao = v_solicitacao
      and s.status = any (public.status_com_prazo_designer())
      and s.prazo_primeira_versao < now()
  ) into v_bloqueado;
  assert v_bloqueado = false, '4. envio da versão deve resolver a pendência (RN12)';
  raise notice '4. OK envio da versão resolve a pendência';

  -- ---------------------------------------------------------------------
  -- 5. Cliente pede ajuste: NOVO ciclo => novo prazo de 5 dias contado de
  --    agora, descartando o prazo anterior (já vencido).
  -- ---------------------------------------------------------------------
  select prazo_primeira_versao into v_prazo_anterior from public.solicitacao where id_solicitacao = v_solicitacao;
  update public.solicitacao set status = 'Ajustes' where id_solicitacao = v_solicitacao;
  select prazo_primeira_versao into v_prazo from public.solicitacao where id_solicitacao = v_solicitacao;

  assert v_prazo > v_prazo_anterior, '5. entrada em Ajustes deveria reiniciar o prazo';
  assert v_prazo > now(), '5. novo ciclo deve nascer com prazo no futuro (relógio reiniciado)';
  assert v_prazo <= now() + v_intervalo, '5. novo prazo não pode exceder 5 dias a partir de agora';
  raise notice '5. OK pedido de ajuste reinicia o prazo (V2): %', v_prazo;

  -- ---------------------------------------------------------------------
  -- 6. Segunda versão dentro do novo prazo: sem atraso.
  -- ---------------------------------------------------------------------
  select exists (
    select 1 from public.solicitacao s
    where s.id_solicitacao = v_solicitacao
      and s.status = any (public.status_com_prazo_designer())
      and s.prazo_primeira_versao < now()
  ) into v_bloqueado;
  assert v_bloqueado = false, '6. segunda versão dentro do prazo não pode contar como atraso';
  raise notice '6. OK segunda versão dentro do prazo não gera atraso';

  -- ---------------------------------------------------------------------
  -- 7. REGRESSÃO DO BUG: segunda versão atrasada DEVE bloquear o designer.
  --    (Antes da correção, 'Ajustes' nunca bloqueava.)
  -- ---------------------------------------------------------------------
  update public.solicitacao
  set prazo_primeira_versao = now() - interval '2 days'
  where id_solicitacao = v_solicitacao;

  select public.sync_designer_bloqueio(v_designer) into v_bloqueado;
  assert v_bloqueado = true, '7. designer com segunda versão vencida (status Ajustes) deve ser bloqueado';
  raise notice '7. OK segunda versão atrasada bloqueia o designer';

  -- ---------------------------------------------------------------------
  -- 8. Nova versão enviada: pendência resolvida e designer desbloqueado.
  -- ---------------------------------------------------------------------
  update public.solicitacao set status = 'Enviado para avaliação' where id_solicitacao = v_solicitacao;
  select public.sync_designer_bloqueio(v_designer) into v_bloqueado;
  assert v_bloqueado = false,
    '8. envio da versão pendente deve desbloquear o designer (desde que não haja outra vencida)';
  raise notice '8. OK envio da versão pendente desbloqueia o designer';

  -- ---------------------------------------------------------------------
  -- 9. Terceiro ciclo: o relógio reinicia de novo (V3).
  -- ---------------------------------------------------------------------
  update public.solicitacao set status = 'Ajustes' where id_solicitacao = v_solicitacao;
  select prazo_primeira_versao into v_prazo from public.solicitacao where id_solicitacao = v_solicitacao;
  assert v_prazo > now(), '9. terceiro ciclo deve reiniciar o relógio';
  raise notice '9. OK terceiro ciclo reinicia o relógio: %', v_prazo;

  -- ---------------------------------------------------------------------
  -- 10. Reatribuição (RF016) de uma solicitação JÁ ATRASADA: o novo designer
  --     recebe um prazo novo de 5 dias; o atraso do designer anterior não é
  --     contado contra ele.
  -- ---------------------------------------------------------------------
  if v_designer_b is null then
    raise notice '10. PULADO: não há um segundo designer para testar reatribuição';
  else
    update public.solicitacao
    set prazo_primeira_versao = now() - interval '10 days'
    where id_solicitacao = v_solicitacao;

    -- Reatribuição (o que `reassign_solicitacao` faz com o prazo: nada
    -- explicitamente — a trigger reinicia por detectar a troca de designer).
    update public.solicitacao set id_designer = v_designer_b where id_solicitacao = v_solicitacao;
    select prazo_primeira_versao into v_prazo from public.solicitacao where id_solicitacao = v_solicitacao;

    assert v_prazo > now(), '10. reatribuição deve iniciar um novo prazo para o designer de destino';
    assert v_prazo <= now() + v_intervalo, '10. novo prazo da reatribuição não pode exceder 5 dias';
    raise notice '10. OK reatribuição de solicitação atrasada inicia novo prazo: %', v_prazo;

    select public.sync_designer_bloqueio(v_designer_b) into v_bloqueado;
    assert v_bloqueado = false,
      '11. designer de destino não pode nascer bloqueado pelo atraso do designer anterior';
    raise notice '11. OK designer de destino não herda o atraso';

    -- 12. Reatribuição ANTES do prazo também reinicia a contagem (o novo
    --     designer tem 5 dias cheios a partir da reatribuição).
    update public.solicitacao
    set prazo_primeira_versao = now() + interval '1 hour'
    where id_solicitacao = v_solicitacao;
    select prazo_primeira_versao into v_prazo_anterior from public.solicitacao where id_solicitacao = v_solicitacao;

    update public.solicitacao set id_designer = v_designer where id_solicitacao = v_solicitacao;
    select prazo_primeira_versao into v_prazo from public.solicitacao where id_solicitacao = v_solicitacao;
    assert v_prazo > v_prazo_anterior,
      '12. reatribuição antes do vencimento deve reiniciar a contagem, não manter o prazo curto do designer anterior';
    raise notice '12. OK reatribuição antes do prazo reinicia a contagem: %', v_prazo;
  end if;

  -- ---------------------------------------------------------------------
  -- 13. Múltiplas solicitações atrasadas do mesmo designer: basta uma para
  --     bloquear, e resolver apenas uma não desbloqueia.
  -- ---------------------------------------------------------------------
  update public.solicitacao set id_designer = v_designer where id_solicitacao = v_solicitacao;
  update public.solicitacao
  set prazo_primeira_versao = now() - interval '3 days'
  where id_solicitacao = v_solicitacao;

  declare
    v_solicitacao_2 bigint;
  begin
    insert into public.solicitacao (id_cliente, id_designer, tema, status, data_criacao)
    values (v_cliente, v_designer, '[TESTE prazo_ciclo_versao #2]', 'Em produção', now() - interval '20 days')
    returning id_solicitacao into v_solicitacao_2;

    select public.sync_designer_bloqueio(v_designer) into v_bloqueado;
    assert v_bloqueado = true, '13. duas solicitações vencidas devem bloquear';

    update public.solicitacao set status = 'Enviado para avaliação' where id_solicitacao = v_solicitacao_2;
    select public.sync_designer_bloqueio(v_designer) into v_bloqueado;
    assert v_bloqueado = true, '13. resolver apenas uma das pendências vencidas NÃO deve desbloquear (RN12)';

    update public.solicitacao set status = 'Cancelado' where id_solicitacao = v_solicitacao;
    select public.sync_designer_bloqueio(v_designer) into v_bloqueado;
    assert v_bloqueado = false, '13. resolver TODAS as pendências vencidas deve desbloquear (RN12)';
    raise notice '13. OK bloqueio só cai quando todas as pendências vencidas são resolvidas';
  end;

  raise notice 'TODOS OS CENÁRIOS PASSARAM — alterações serão revertidas pelo rollback';
end;
$$;

rollback;
