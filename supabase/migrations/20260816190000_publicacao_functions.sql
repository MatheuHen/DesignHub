-- DesignHub — RF014: publicação da arte (automática via Instagram API
-- oficial ou manual). RN29/RN32-RN35/RN41.

-- Coluna gerada com o instante (UTC) do agendamento, interpretando
-- `data_publicacao`/`horario` como hora de parede em America/Sao_Paulo —
-- mesmo padrão já usado em `solicitacao.prazo_primeira_versao` (Fase 2).
-- Usada pelo job de publicação (Fase 12) para encontrar agendamentos
-- vencidos sem repetir a conversão de timezone em cada query.
alter table public.agendamento_publicacao
  add column data_hora_publicacao timestamptz generated always as (
    (data_publicacao + horario) at time zone 'America/Sao_Paulo'
  ) stored;

create index agendamento_publicacao_vencidos_idx
  on public.agendamento_publicacao (data_hora_publicacao)
  where status = 'Agendado';

-- Marca técnica de reserva usada só pelo job de publicação automática
-- (nunca lida/gravada pelo frontend ou por rotas autenticadas de
-- designer/administrador) para evitar publicar duas vezes no Instagram
-- quando duas execuções do job se sobrepõem (cron atrasado, retry de
-- infraestrutura). Não é um novo estado de negócio: `agendamento_publicacao
-- .status` continua restrito a Agendado/Cancelado/Publicado (RN39 trata dos
-- estados de `solicitacao`, não deste campo técnico).
alter table public.agendamento_publicacao
  add column processamento_iniciado_em timestamptz;

-- RF014/RN29/Gate G (idempotência): reserva atomicamente um agendamento
-- vencido para processamento antes de qualquer chamada externa ao
-- Instagram. Um `UPDATE ... WHERE status = 'Agendado' AND (...)` é
-- atômico por linha — duas execuções concorrentes nunca conseguem
-- reservar o mesmo agendamento simultaneamente, pois a segunda só
-- reavalia o WHERE após a primeira liberar o lock de linha da primeira
-- UPDATE (commit). `p_stale_after_seconds` libera a reserva de uma
-- execução que travou/caiu sem concluir, permitindo nova tentativa.
create or replace function public.claim_agendamento_publicacao(
  p_id_agendamento bigint,
  p_stale_after_seconds int default 300
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row_count int;
begin
  update public.agendamento_publicacao
  set processamento_iniciado_em = now()
  where id_agendamento = p_id_agendamento
    and status = 'Agendado'
    and (
      processamento_iniciado_em is null
      or processamento_iniciado_em < now() - make_interval(secs => p_stale_after_seconds)
    );

  get diagnostics v_row_count = row_count;
  return v_row_count > 0;
end;
$$;

revoke all on function public.claim_agendamento_publicacao(bigint, int) from public;
revoke all on function public.claim_agendamento_publicacao(bigint, int) from anon, authenticated;
grant execute on function public.claim_agendamento_publicacao(bigint, int) to service_role;

-- RF014/RN32-RN35: registra uma publicação bem-sucedida (automática via
-- Instagram API oficial ou manual) de forma atômica: insere o log em
-- `publicacao`, marca o agendamento e a solicitação como `Publicado`,
-- grava histórico. `p_ator_id` é `null` para publicação automática
-- (Serviço Automático) ou o `id_usuario` do designer para publicação
-- manual (RF014 "sem integração/acesso, permitir publicação manual").
create or replace function public.register_publicacao_sucesso(
  p_id_agendamento bigint,
  p_tipo text,
  p_ator_id uuid
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
      v_acao := 'Publicação realizada automaticamente no Instagram (RF014, Serviço Automático)';
    when 'manual' then
      v_acao := 'Publicação registrada manualmente (RF014)';
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

  -- publicacao_unica_sucesso_idx (Fase 2) é o backstop final contra
  -- publicação duplicada em caso de reexecução concorrente do job/rota
  -- (idempotência, seção 12.4/Gate G) — além do lock acima e da checagem
  -- de status.
  insert into public.publicacao (id_agendamento, id_versao, data_publicada, tipo, status)
  values (p_id_agendamento, v_id_versao, now(), p_tipo, 'sucesso');

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

revoke all on function public.register_publicacao_sucesso(bigint, text, uuid) from public;
revoke all on function public.register_publicacao_sucesso(bigint, text, uuid) from anon, authenticated;
grant execute on function public.register_publicacao_sucesso(bigint, text, uuid) to service_role;

-- RF014: registra uma tentativa de publicação automática que falhou.
-- "Falha automática não pode marcar como publicado: manter
-- pendência/agendamento e alertar" — por isso esta função NUNCA altera
-- `agendamento_publicacao.status`/`solicitacao.status` (permanecem
-- `Agendado`), só grava o log (RN34/RN35) e uma entrada de histórico não
-- mutante (mesmo padrão de `reassign_solicitacao`/`update_agendamento`:
-- `status_anterior = status_novo`). Sempre `tipo = 'automatica'` — falhas
-- de publicação manual não existem neste modelo (o designer só clica
-- "registrar publicação manual" depois de já ter publicado de fato fora
-- do sistema).
create or replace function public.register_publicacao_falha(
  p_id_agendamento bigint
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

  select v.id_versao
  into v_id_versao
  from public.versao_arte v
  where v.id_solicitacao = v_id_solicitacao
  order by v.numero_versao desc
  limit 1;

  if v_id_versao is null then
    raise exception 'solicitação % não possui versão enviada', v_id_solicitacao using errcode = 'P0002';
  end if;

  insert into public.publicacao (id_agendamento, id_versao, data_publicada, tipo, status)
  values (p_id_agendamento, v_id_versao, null, 'automatica', 'falha');

  -- libera a reserva de `claim_agendamento_publicacao` para que a
  -- próxima execução do job possa tentar novamente sem esperar o
  -- timeout de reserva travada.
  update public.agendamento_publicacao
  set processamento_iniciado_em = null
  where id_agendamento = p_id_agendamento;

  insert into public.historico_solicitacao (id_solicitacao, id_usuario, acao, status_anterior, status_novo)
  values (
    v_id_solicitacao,
    null,
    'Tentativa de publicação automática no Instagram falhou (RF014, Serviço Automático) — publicação pendente',
    'Agendado',
    'Agendado'
  );
end;
$$;

revoke all on function public.register_publicacao_falha(bigint) from public;
revoke all on function public.register_publicacao_falha(bigint) from anon, authenticated;
grant execute on function public.register_publicacao_falha(bigint) to service_role;
