-- DesignHub — RF012/RF014: reagendar volta a habilitar a via automática.
--
-- Regressão introduzida pela migration 20261109120000 e observada em
-- produção no mesmo dia (agendamento 48, solicitação 79): aquela correção
-- passou a desligar a publicação automática de um agendamento depois de
-- falhas repetidas, o que é correto enquanto nada muda. Mas o designer PODE
-- editar o agendamento (RF012), e nesse caso ele está justamente tentando de
-- novo — com outra data/hora e, muitas vezes, depois de resolver a causa.
--
-- Como as marcas técnicas não eram limpas na edição, o agendamento reagendado
-- nunca mais era considerado pelo job: a solicitação ficava `Agendado`
-- indefinidamente, parecendo "atrasada" sem nenhuma tentativa nova. Era pior
-- que o comportamento anterior, porque silencioso.
--
-- Mesma assinatura e mesmo comportamento de `update_agendamento`, apenas
-- acrescentando a limpeza das marcas. Nenhuma regra de negócio nova: a
-- validação de dono, de status e de data futura continua idêntica.

create or replace function public.update_agendamento(
  p_id_agendamento bigint,
  p_id_designer uuid,
  p_data_publicacao date,
  p_horario time,
  p_legenda text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id_designer uuid;
  v_id_solicitacao bigint;
  v_status_agendamento text;
  v_scheduled_at timestamptz;
  v_legenda text;
begin
  select s.id_designer, a.id_solicitacao, a.status
  into v_id_designer, v_id_solicitacao, v_status_agendamento
  from public.agendamento_publicacao a
  join public.solicitacao s on s.id_solicitacao = a.id_solicitacao
  where a.id_agendamento = p_id_agendamento
  for update of a, s;

  if v_id_designer is null or v_id_designer <> p_id_designer then
    raise exception 'agendamento % não encontrado', p_id_agendamento using errcode = 'P0002';
  end if;

  if v_status_agendamento <> 'Agendado' then
    raise exception
      'agendamento % não está ativo (status atual: %)', p_id_agendamento, v_status_agendamento
      using errcode = 'P0001';
  end if;

  if p_data_publicacao is null or p_horario is null then
    raise exception 'data/horário do agendamento são obrigatórios' using errcode = 'P0004';
  end if;

  v_legenda := nullif(btrim(coalesce(p_legenda, '')), '');

  v_scheduled_at := (p_data_publicacao + p_horario) at time zone 'America/Sao_Paulo';
  if v_scheduled_at <= now() then
    raise exception 'data/horário do agendamento deve ser no futuro' using errcode = 'P0004';
  end if;

  update public.agendamento_publicacao
  set data_publicacao = p_data_publicacao,
      horario = p_horario,
      legenda = v_legenda,
      -- A edição é uma nova tentativa deliberada do designer: zera o
      -- histórico de falhas e devolve o agendamento à fila automática.
      publicacao_automatica_falhas = 0,
      publicacao_automatica_indisponivel_em = null,
      publicacao_automatica_motivo = null,
      processamento_iniciado_em = null
  where id_agendamento = p_id_agendamento
    -- Proteção contra dupla publicação (mantida da 20261109120000): um
    -- agendamento cuja mídia já foi publicada na Meta nunca volta à fila.
    and instagram_media_id_pendente is null;

  insert into public.historico_solicitacao (id_solicitacao, id_usuario, acao, status_anterior, status_novo)
  values (
    v_id_solicitacao,
    p_id_designer,
    format('Agendamento de publicação atualizado para %s %s', p_data_publicacao, p_horario),
    'Agendado',
    'Agendado'
  );
end;
$$;

revoke all on function public.update_agendamento(bigint, uuid, date, time, text) from public;
revoke all on function public.update_agendamento(bigint, uuid, date, time, text) from anon, authenticated;
grant execute on function public.update_agendamento(bigint, uuid, date, time, text) to service_role;
