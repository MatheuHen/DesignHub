-- DesignHub — remove códigos de rastreabilidade (RF00x/RN00x) de textos que
-- chegam ao usuário final (histórico da solicitação visível ao designer,
-- mensagens de erro de validação de negócio). Códigos de requisito
-- pertencem à documentação/rastreabilidade/comentários técnicos, não à
-- interface — não é mudança de regra de negócio, é só o texto exibido.
-- `historico_solicitacao.acao` permanece texto livre (mesmo campo, mesma
-- coluna, mesmo propósito); só o conteúdo de cada string muda.

create or replace function public.complete_atendimento_and_create_solicitacao(
  p_id_atendimento bigint,
  p_tema text,
  p_cores text,
  p_observacoes text
)
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id_cliente bigint;
  v_id_designer uuid;
  v_status text;
  v_id_solicitacao bigint;
  v_solicitacao_existente bigint;
begin
  select a.id_cliente, c.id_designer, a.status
  into v_id_cliente, v_id_designer, v_status
  from public.atendimento a
  join public.cliente c on c.id_cliente = a.id_cliente
  where a.id_atendimento = p_id_atendimento
  for update of a;

  if v_id_cliente is null then
    raise exception 'atendimento % não encontrado', p_id_atendimento using errcode = 'P0002';
  end if;

  if v_status <> 'em_andamento' then
    raise exception 'atendimento % não está em andamento', p_id_atendimento using errcode = 'P0001';
  end if;

  select s.id_solicitacao
  into v_solicitacao_existente
  from public.solicitacao s
  where s.id_cliente = v_id_cliente
    and s.status not in ('Cancelado', 'Publicado')
  limit 1;

  if v_solicitacao_existente is not null then
    raise exception
      'cliente % já possui solicitação % em andamento', v_id_cliente, v_solicitacao_existente
      using errcode = 'P0005';
  end if;

  insert into public.solicitacao (id_cliente, id_designer, tema, cores, observacoes)
  values (v_id_cliente, v_id_designer, p_tema, p_cores, p_observacoes)
  returning id_solicitacao into v_id_solicitacao;

  update public.atendimento
  set id_solicitacao = v_id_solicitacao, status = 'concluido', data_fim = now()
  where id_atendimento = p_id_atendimento;

  insert into public.historico_solicitacao (id_solicitacao, id_usuario, acao, status_anterior, status_novo)
  values (
    v_id_solicitacao,
    null,
    'Solicitação criada a partir do atendimento pelo WhatsApp',
    null,
    'Em produção'
  );

  return v_id_solicitacao;
end;
$$;

revoke all on function public.complete_atendimento_and_create_solicitacao(bigint, text, text, text) from public;
revoke all on function public.complete_atendimento_and_create_solicitacao(bigint, text, text, text) from anon, authenticated;
grant execute on function public.complete_atendimento_and_create_solicitacao(bigint, text, text, text) to service_role;

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
    format('Nova versão enviada (V%s)', v_next_numero),
    v_status,
    'Enviado para avaliação'
  );

  return query select v_id_versao, v_next_numero, v_status;
end;
$$;

revoke all on function public.register_versao_arte(bigint, uuid, text, text, text) from public;
revoke all on function public.register_versao_arte(bigint, uuid, text, text, text) from anon, authenticated;
grant execute on function public.register_versao_arte(bigint, uuid, text, text, text) to service_role;

create or replace function public.create_agendamento(
  p_id_solicitacao bigint,
  p_id_designer uuid,
  p_data_publicacao date,
  p_horario time,
  p_legenda text
)
returns table (id_agendamento bigint)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id_designer uuid;
  v_status text;
  v_scheduled_at timestamptz;
  v_id_agendamento bigint;
begin
  select s.id_designer, s.status
  into v_id_designer, v_status
  from public.solicitacao s
  where s.id_solicitacao = p_id_solicitacao
  for update;

  if v_id_designer is null or v_id_designer <> p_id_designer then
    raise exception 'solicitação % não encontrada', p_id_solicitacao using errcode = 'P0002';
  end if;

  if v_status <> 'Aprovado' then
    raise exception
      'solicitação % não está aprovada (status atual: %)', p_id_solicitacao, v_status
      using errcode = 'P0001';
  end if;

  if p_data_publicacao is null or p_horario is null then
    raise exception 'data/horário do agendamento são obrigatórios' using errcode = 'P0004';
  end if;

  v_scheduled_at := (p_data_publicacao + p_horario) at time zone 'America/Sao_Paulo';
  if v_scheduled_at <= now() then
    raise exception 'data/horário do agendamento deve ser no futuro' using errcode = 'P0004';
  end if;

  insert into public.agendamento_publicacao (id_solicitacao, data_publicacao, horario, legenda)
  values (p_id_solicitacao, p_data_publicacao, p_horario, p_legenda)
  returning agendamento_publicacao.id_agendamento into v_id_agendamento;

  update public.solicitacao
  set status = 'Agendado'
  where id_solicitacao = p_id_solicitacao;

  insert into public.historico_solicitacao (id_solicitacao, id_usuario, acao, status_anterior, status_novo)
  values (
    p_id_solicitacao,
    p_id_designer,
    format('Publicação agendada para %s %s', p_data_publicacao, p_horario),
    'Aprovado',
    'Agendado'
  );

  return query select v_id_agendamento;
end;
$$;

revoke all on function public.create_agendamento(bigint, uuid, date, time, text) from public;
revoke all on function public.create_agendamento(bigint, uuid, date, time, text) from anon, authenticated;
grant execute on function public.create_agendamento(bigint, uuid, date, time, text) to service_role;

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

  v_scheduled_at := (p_data_publicacao + p_horario) at time zone 'America/Sao_Paulo';
  if v_scheduled_at <= now() then
    raise exception 'data/horário do agendamento deve ser no futuro' using errcode = 'P0004';
  end if;

  update public.agendamento_publicacao
  set data_publicacao = p_data_publicacao,
      horario = p_horario,
      legenda = p_legenda
  where id_agendamento = p_id_agendamento;

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

create or replace function public.cancel_agendamento(
  p_id_agendamento bigint,
  p_id_designer uuid
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
  v_data_publicacao date;
  v_horario time;
  v_scheduled_at timestamptz;
begin
  select s.id_designer, a.id_solicitacao, a.status, a.data_publicacao, a.horario
  into v_id_designer, v_id_solicitacao, v_status_agendamento, v_data_publicacao, v_horario
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

  v_scheduled_at := (v_data_publicacao + v_horario) at time zone 'America/Sao_Paulo';
  if v_scheduled_at - now() < interval '3 hours' then
    raise exception
      'Cancelamento não permitido: faltam menos de 3 horas para a publicação.'
      using errcode = 'P0005';
  end if;

  update public.agendamento_publicacao
  set status = 'Cancelado'
  where id_agendamento = p_id_agendamento;

  update public.solicitacao
  set status = 'Aprovado'
  where id_solicitacao = v_id_solicitacao;

  insert into public.historico_solicitacao (id_solicitacao, id_usuario, acao, status_anterior, status_novo)
  values (
    v_id_solicitacao,
    p_id_designer,
    format('Agendamento de publicação cancelado, horário planejado: %s %s', v_data_publicacao, v_horario),
    'Agendado',
    'Aprovado'
  );
end;
$$;

revoke all on function public.cancel_agendamento(bigint, uuid) from public;
revoke all on function public.cancel_agendamento(bigint, uuid) from anon, authenticated;
grant execute on function public.cancel_agendamento(bigint, uuid) to service_role;

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
      v_acao := 'Publicação realizada automaticamente no Instagram';
    when 'manual' then
      v_acao := 'Publicação registrada manualmente';
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

  update public.agendamento_publicacao
  set processamento_iniciado_em = null
  where id_agendamento = p_id_agendamento;

  insert into public.historico_solicitacao (id_solicitacao, id_usuario, acao, status_anterior, status_novo)
  values (
    v_id_solicitacao,
    null,
    'Tentativa de publicação automática no Instagram falhou — publicação pendente',
    'Agendado',
    'Agendado'
  );
end;
$$;

revoke all on function public.register_publicacao_falha(bigint) from public;
revoke all on function public.register_publicacao_falha(bigint) from anon, authenticated;
grant execute on function public.register_publicacao_falha(bigint) to service_role;

-- RF016: mesma mudança de texto (mensagem de erro visível ao Administrador
-- quando o designer de destino não está ativo).
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

-- Limpeza de dados: registros de histórico já gravados com o texto antigo
-- (inclui os códigos RF/RN) recebem o texto novo equivalente. Não altera
-- status/ids/timestamps, só o texto exibido.
update public.historico_solicitacao
set acao = 'Solicitação criada a partir do atendimento pelo WhatsApp'
where acao = 'Solicitação criada a partir do questionário WhatsApp (RF004/RN03, Serviço Automático)';

update public.historico_solicitacao
set acao = regexp_replace(acao, '\s*—\s*RF007/RF008\s*$', '')
where acao ~ 'Nova versão enviada \(V\d+\) — RF007/RF008';

update public.historico_solicitacao
set acao = 'Cliente aprovou a arte'
where acao = 'Cliente aprovou a arte via link de avaliação (RF009)';

update public.historico_solicitacao
set acao = 'Cliente solicitou ajustes'
where acao = 'Cliente solicitou ajustes via link de avaliação (RF009/RF010)';

update public.historico_solicitacao
set acao = 'Cliente cancelou a solicitação'
where acao = 'Cliente cancelou a solicitação via link de avaliação (RF009)';

update public.historico_solicitacao
set acao = regexp_replace(acao, '\s*\(RF012\)\s*$', '')
where acao ~ '\(RF012\)$';

update public.historico_solicitacao
set acao = regexp_replace(acao, '^Agendamento de publicação cancelado \(RF013\), ', 'Agendamento de publicação cancelado, ')
where acao like 'Agendamento de publicação cancelado (RF013),%';

update public.historico_solicitacao
set acao = 'Publicação realizada automaticamente no Instagram'
where acao = 'Publicação realizada automaticamente no Instagram (RF014, Serviço Automático)';

update public.historico_solicitacao
set acao = 'Publicação registrada manualmente'
where acao = 'Publicação registrada manualmente (RF014)';

update public.historico_solicitacao
set acao = 'Tentativa de publicação automática no Instagram falhou — publicação pendente'
where acao = 'Tentativa de publicação automática no Instagram falhou (RF014, Serviço Automático) — publicação pendente';
