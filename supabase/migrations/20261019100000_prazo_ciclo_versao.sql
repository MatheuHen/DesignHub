-- DesignHub — RF006/RN11/RN12: o prazo de 5 dias passa a valer para TODO ciclo
-- de versão da arte, não só para a primeira versão.
--
-- Comportamento anterior: `solicitacao.prazo_primeira_versao` era calculado
-- uma única vez (trigger BEFORE INSERT, `data_criacao + 5 dias`) e
-- `sync_designer_bloqueio` só considerava vencida a solicitação em
-- 'Em produção'. Consequência: depois que o cliente pedia ajuste (status
-- 'Ajustes'), o designer podia ficar semanas sem enviar a nova versão sem
-- nunca ser bloqueado — e, na reatribuição (RF016), o designer de destino
-- herdava um prazo já vencido do designer anterior.
--
-- Comportamento desta migration (regra autorizada):
--   * cada ciclo em que a entrega está com o designer tem seu próprio prazo
--     de 5 dias; o prazo anterior não continua valendo;
--   * entrar em 'Ajustes' (RN24/RN26: nasce a necessidade de uma nova versão)
--     reinicia a contagem;
--   * voltar para 'Em produção' reinicia a contagem;
--   * reatribuir (RF016) reinicia a contagem a partir da reatribuição, para
--     que o prazo do designer anterior não seja contado contra o novo;
--   * enviar a versão (status sai para 'Enviado para avaliação') ou cancelar
--     resolve a pendência, exatamente como antes.
--
-- A coluna física `prazo_primeira_versao` é PRESERVADA (o DER corrigido do
-- TFC a define); o que muda é a semântica documentada: ela passa a guardar o
-- prazo do CICLO DE VERSÃO CORRENTE. Nenhuma coluna/tabela nova, nenhum job
-- novo, nenhum requisito novo.

-- ---------------------------------------------------------------------------
-- 1. Intervalo do prazo em um único lugar (antes o literal '5 days' estava
--    embutido na função de trigger).
-- ---------------------------------------------------------------------------
create or replace function public.prazo_ciclo_versao_intervalo()
returns interval
language sql
immutable
set search_path = pg_catalog, pg_temp
as $$
  select interval '5 days';
$$;

comment on function public.prazo_ciclo_versao_intervalo() is
  'RN11: duração do prazo de entrega de uma versão da arte pelo designer (5 dias). Fonte única do literal.';

-- ---------------------------------------------------------------------------
-- 2. Status em que a entrega está com o designer e, portanto, o prazo corre.
--    Mesma lista usada pelo trigger e por sync_designer_bloqueio, para que
--    não exista divergência entre "tem prazo" e "pode bloquear".
-- ---------------------------------------------------------------------------
create or replace function public.status_com_prazo_designer()
returns text[]
language sql
immutable
set search_path = pg_catalog, pg_temp
as $$
  select array['Em produção', 'Ajustes']::text[];
$$;

comment on function public.status_com_prazo_designer() is
  'RF006/RN11/RN12: status em que a solicitação aguarda uma versão da arte do designer e o prazo de 5 dias corre.';

-- ---------------------------------------------------------------------------
-- 3. Cálculo do prazo: INSERT (como antes) + reinício por novo ciclo.
-- ---------------------------------------------------------------------------
create or replace function public.set_prazo_primeira_versao()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    -- RN11: primeira versão conta da criação da solicitação (inalterado).
    new.prazo_primeira_versao := new.data_criacao + public.prazo_ciclo_versao_intervalo();
    return new;
  end if;

  -- UPDATE: reinicia a contagem quando começa um novo ciclo de entrega.
  -- O prazo nunca é recalculado para status em que a bola não está com o
  -- designer ('Enviado para avaliação', 'Aprovado', 'Agendado', 'Publicado',
  -- 'Cancelado'), preservando o valor histórico do último ciclo.
  if new.status = any (public.status_com_prazo_designer())
     and (
       -- novo ciclo de versão: o cliente pediu ajuste, ou a solicitação
       -- voltou para produção.
       new.status is distinct from old.status
       -- RF016: reatribuição — o prazo do designer anterior não é contado
       -- contra o designer de destino.
       or new.id_designer is distinct from old.id_designer
     )
  then
    new.prazo_primeira_versao := now() + public.prazo_ciclo_versao_intervalo();
  end if;

  return new;
end;
$$;

comment on function public.set_prazo_primeira_versao() is
  'RN11/RN12: mantém solicitacao.prazo_primeira_versao como o prazo do ciclo de versão corrente — calculado na criação e reiniciado a cada novo ciclo (entrada em Ajustes/Em produção) e a cada reatribuição (RF016).';

drop trigger if exists solicitacao_set_prazo_primeira_versao on public.solicitacao;

create trigger solicitacao_set_prazo_primeira_versao
  before insert or update on public.solicitacao
  for each row
  execute function public.set_prazo_primeira_versao();

comment on column public.solicitacao.prazo_primeira_versao is
  'RN11/RN12: prazo do ciclo de versão CORRENTE (5 dias). Na criação vale data_criacao + 5 dias (prazo da primeira versão); é reiniciado a cada novo ciclo de versão (entrada em Ajustes ou retorno a Em produção) e a cada reatribuição (RF016). Calculado exclusivamente por set_prazo_primeira_versao.';

comment on table public.solicitacao is
  'RN39: os 7 status listados são os únicos válidos. RN11: prazo_primeira_versao é o prazo de 5 dias do ciclo de versão corrente (calculado por trigger, ver set_prazo_primeira_versao).';

-- ---------------------------------------------------------------------------
-- 4. Bloqueio por atraso passa a considerar todo ciclo de versão pendente.
-- ---------------------------------------------------------------------------
-- Índices parciais acompanham o novo predicado; os antigos cobriam apenas
-- status = 'Em produção' e deixariam o caminho quente de 'Ajustes' sem índice.
drop index if exists public.solicitacao_designer_vencida_idx;
drop index if exists public.solicitacao_prazo_vencido_idx;

create index solicitacao_prazo_vencido_idx
  on public.solicitacao (prazo_primeira_versao)
  where status in ('Em produção', 'Ajustes');

create index solicitacao_designer_vencida_idx
  on public.solicitacao (id_designer, prazo_primeira_versao)
  where status in ('Em produção', 'Ajustes');

-- O predicado abaixo mantém a propriedade de resolução automática já
-- documentada em 20260816150000: enviar a versão move o status para
-- 'Enviado para avaliação' (RF007) e cancelar move para 'Cancelado' (RF009);
-- em ambos os casos a solicitação deixa a lista de status com prazo, então a
-- pendência é considerada resolvida sem precisar consultar versao_arte.
-- A lista de status vem de status_com_prazo_designer() — a mesma consumida
-- pelo trigger de cálculo do prazo.
create or replace function public.sync_designer_bloqueio(p_id_designer uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_bloqueado boolean;
  v_linhas_afetadas integer;
begin
  select exists (
    select 1
    from public.solicitacao s
    where s.id_designer = p_id_designer
      and s.status = any (public.status_com_prazo_designer())
      and s.prazo_primeira_versao < now()
  ) into v_bloqueado;

  update public.designer
  set bloqueado = v_bloqueado
  where id_usuario = p_id_designer;

  get diagnostics v_linhas_afetadas = row_count;
  if v_linhas_afetadas = 0 then
    raise exception 'designer % não encontrado', p_id_designer using errcode = 'P0002';
  end if;

  return v_bloqueado;
end;
$$;

comment on function public.sync_designer_bloqueio(uuid) is
  'RF006/RN11/RN12: recalcula e persiste designer.bloqueado — bloqueado quando existe solicitação do designer com prazo do ciclo de versão corrente vencido (status em status_com_prazo_designer()).';

revoke all on function public.sync_designer_bloqueio(uuid) from public;
revoke all on function public.sync_designer_bloqueio(uuid) from anon, authenticated;
grant execute on function public.sync_designer_bloqueio(uuid) to service_role;

revoke all on function public.prazo_ciclo_versao_intervalo() from public;
revoke all on function public.status_com_prazo_designer() from public;
