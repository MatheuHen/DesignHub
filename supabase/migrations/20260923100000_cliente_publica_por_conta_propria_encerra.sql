-- DesignHub — rodada correções 23/09/2026, item 8.3 (RF011/RF014, RN33/RN41).
--
-- REGRA FINAL APROVADA, substitui o comportamento anterior: quando o cliente
-- aprova e escolhe "eu mesmo vou publicar", a solicitação é ENCERRADA na
-- mesma transação — status `Publicado`, sem pendência para o designer.
--
-- Antes, `proprio_cliente` deixava a solicitação em `Aprovado` aguardando um
-- registro manual posterior do designer, que na prática nunca acontecia: a
-- publicação já tinha sido feita pelo cliente fora do sistema e a solicitação
-- ficava presa como pendente no dashboard e nas listagens.
--
-- O que esta migration NÃO faz (item 8.3, explicitamente):
--   * não cria linha em `publicacao` — não existe agendamento associado
--     (`publicacao.id_agendamento` é NOT NULL) e inventar um seria fabricar
--     um agendamento que nunca houve. O registro auditável desta publicação é
--     o próprio `historico_solicitacao`, com ator Cliente e data/hora (RN34);
--   * não chama a API do Instagram, não grava permalink nem comprovante — a
--     publicação ocorreu fora do DesignHub e o sistema não tem prova dela;
--   * não exige Instagram conectado.
--
-- Transição `Enviado para avaliação` -> `Publicado` acontece em UM passo
-- atômico, sob o mesmo `for update` da solicitação que a RPC já usava.

create or replace function public.submit_avaliacao(
  p_token_hash text,
  p_decisao text,
  p_descricao_ajuste text,
  p_observacoes_ajuste text,
  p_imagem_referencia_path text,
  p_deseja_agendamento boolean default null,
  p_data_desejada date default null,
  p_horario_desejado time default null,
  p_opcao_publicacao text default null,
  p_legenda_desejada text default null
)
returns table (id_solicitacao bigint, status_novo text, numero_versao integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id_token bigint;
  v_id_versao bigint;
  v_expires_at timestamptz;
  v_revoked_at timestamptz;
  v_used_at timestamptz;
  v_id_solicitacao bigint;
  v_status text;
  v_numero_versao integer;
  v_id_avaliacao bigint;
  v_acao text;
  v_status_final text;
begin
  select t.id_token, t.id_versao
  into v_id_token, v_id_versao
  from public.avaliacao_link_token t
  where t.token_hash = p_token_hash;

  if v_id_token is null then
    raise exception 'link de avaliação inválido' using errcode = 'P0002';
  end if;

  select v.id_solicitacao, v.numero_versao
  into v_id_solicitacao, v_numero_versao
  from public.versao_arte v
  where v.id_versao = v_id_versao;

  select s.status
  into v_status
  from public.solicitacao s
  where s.id_solicitacao = v_id_solicitacao
  for update;

  select t.expires_at, t.revoked_at, t.used_at
  into v_expires_at, v_revoked_at, v_used_at
  from public.avaliacao_link_token t
  where t.id_token = v_id_token
  for update;

  if v_revoked_at is not null then
    raise exception 'link de avaliação inválido' using errcode = 'P0002';
  end if;

  if v_used_at is not null then
    raise exception 'link de avaliação já utilizado' using errcode = 'P0004';
  end if;

  if v_expires_at < now() then
    raise exception 'link de avaliação expirado' using errcode = 'P0003';
  end if;

  if v_status <> 'Enviado para avaliação' then
    raise exception
      'solicitação % não está mais aguardando avaliação (status atual: %)', v_id_solicitacao, v_status
      using errcode = 'P0001';
  end if;

  if p_decisao not in ('Aprovado', 'Ajustes', 'Cancelado') then
    raise exception 'decisão % inválida', p_decisao using errcode = 'P0001';
  end if;

  if p_decisao = 'Aprovado' and p_opcao_publicacao is not null
     and p_opcao_publicacao not in ('automatico', 'designer_manual', 'proprio_cliente') then
    raise exception 'opção de publicação % inválida', p_opcao_publicacao using errcode = 'P0001';
  end if;

  insert into public.avaliacao (
    id_versao, decisao, deseja_agendamento, data_desejada, horario_desejado,
    opcao_publicacao, legenda_desejada
  )
  values (
    v_id_versao,
    p_decisao,
    case when p_decisao = 'Aprovado' then p_deseja_agendamento else null end,
    case when p_decisao = 'Aprovado' then p_data_desejada else null end,
    case when p_decisao = 'Aprovado' then p_horario_desejado else null end,
    case when p_decisao = 'Aprovado' then p_opcao_publicacao else null end,
    case when p_decisao = 'Aprovado' then p_legenda_desejada else null end
  )
  returning id_avaliacao into v_id_avaliacao;

  if p_decisao = 'Ajustes' then
    insert into public.ajuste (id_avaliacao, descricao, observacoes, imagem_referencia_url)
    values (v_id_avaliacao, p_descricao_ajuste, p_observacoes_ajuste, p_imagem_referencia_path);
  end if;

  case p_decisao
    when 'Aprovado' then
      v_acao := 'Cliente aprovou a arte';
    when 'Ajustes' then
      v_acao := 'Cliente solicitou ajustes';
    when 'Cancelado' then
      v_acao := 'Cliente cancelou a solicitação';
  end case;

  -- Item 8.3: a aprovação com "eu mesmo vou publicar" encerra a solicitação
  -- aqui mesmo. Nas demais decisões o status continua sendo exatamente a
  -- decisão registrada, como antes.
  v_status_final := p_decisao;
  if p_decisao = 'Aprovado' and p_opcao_publicacao = 'proprio_cliente' then
    v_status_final := 'Publicado';
  end if;

  update public.solicitacao
  set status = v_status_final
  where solicitacao.id_solicitacao = v_id_solicitacao;

  insert into public.historico_solicitacao (id_solicitacao, id_usuario, acao, status_anterior, status_novo)
  values (v_id_solicitacao, null, v_acao, 'Enviado para avaliação', p_decisao);

  if v_status_final = 'Publicado' then
    -- RN34/item 8.3: o registro auditável da publicação feita pelo cliente —
    -- ator Cliente (id_usuario null, mesma convenção das demais ações de
    -- cliente nesta tabela) e data/hora pelo default da coluna.
    insert into public.historico_solicitacao (id_solicitacao, id_usuario, acao, status_anterior, status_novo)
    values (
      v_id_solicitacao,
      null,
      'Cliente optou por realizar a publicação por conta própria.',
      'Aprovado',
      'Publicado'
    );

    -- Item 8.3 ("invalidar/cancelar agendamento incompatível"): defesa em
    -- profundidade. O fluxo normal chega aqui a partir de "Enviado para
    -- avaliação", que não deveria ter agendamento ativo; se houver qualquer
    -- resquício, ele não pode continuar ativo apontando para uma solicitação
    -- já publicada — o job de publicação o encontraria e tentaria publicar.
    -- Colunas sempre qualificadas: `id_solicitacao` também é um parâmetro OUT
    -- desta função (`returns table (id_solicitacao bigint, ...)`) e sem o
    -- prefixo o PL/pgSQL resolve como ambíguo (42702), mesmo motivo pelo qual
    -- o `update public.solicitacao` acima já usa `solicitacao.id_solicitacao`.
    update public.agendamento_publicacao
    set status = 'Cancelado'
    where agendamento_publicacao.id_solicitacao = v_id_solicitacao
      and agendamento_publicacao.status = 'Agendado';

    -- Item 8.3 ("encerrar atendimento daquela arte; remover pendências"):
    -- o atendimento normalmente já está concluído quando a solicitação nasce;
    -- fecha qualquer um que ainda esteja aberto para não deixar pendência.
    update public.atendimento
    set status = 'concluido',
        data_fim = coalesce(atendimento.data_fim, now())
    where atendimento.id_solicitacao = v_id_solicitacao
      and atendimento.status = 'em_andamento';
  end if;

  update public.avaliacao_link_token
  set used_at = now()
  where id_token = v_id_token;

  return query select v_id_solicitacao, v_status_final, v_numero_versao;
end;
$$;

revoke all on function public.submit_avaliacao(text, text, text, text, text, boolean, date, time, text, text) from public;
revoke all on function public.submit_avaliacao(text, text, text, text, text, boolean, date, time, text, text) from anon, authenticated;
grant execute on function public.submit_avaliacao(text, text, text, text, text, boolean, date, time, text, text) to service_role;

comment on column public.avaliacao.opcao_publicacao is
  'RN22/RN27/RN29: escolha do cliente ao aprovar — automatico (agenda de verdade), designer_manual (preferência para o designer confirmar) ou proprio_cliente (cliente publica por conta própria; item 8.3: encerra a solicitação como Publicado na mesma transação). Null nas demais decisões.';
