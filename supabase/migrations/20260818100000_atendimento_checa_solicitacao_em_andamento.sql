-- DesignHub — RF004: reforça em duas camadas a verificação de
-- "solicitação existente" já exigida pelo texto do requisito ("O sistema
-- verifica WhatsApp e solicitação existente, cria/atualiza a solicitação
-- e conduz perguntas predefinidas... Se já houver solicitação aplicável,
-- registrar interação sem duplicar questionário indevidamente").
--
-- Até aqui `iniciarAtendimento` só verificava `atendimento.status =
-- 'em_andamento'`, nunca `solicitacao.status` — um cliente com uma
-- solicitação ainda aberta (Em produção/Enviado para avaliação/Ajustes/
-- Aprovado/Agendado) podia iniciar um novo atendimento assim que o
-- atendimento anterior fosse concluído, criando uma segunda solicitação
-- duplicada para o mesmo pedido. Camada 1 (aplicação):
-- `findSolicitacaoEmAndamentoByClienteId` em `atendimento.repository.ts`,
-- chamada por `iniciarAtendimento`. Esta migration é a camada 2 (banco),
-- mesmo padrão de defesa em profundidade já usado em todas as demais RPCs
-- SECURITY DEFINER desta base (Fases 4/7/8/9/11/12) — backstop contra uma
-- futura regressão na camada de aplicação, não o caminho normal.
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

  -- RF004: os únicos status terminais de solicitacao são
  -- Cancelado/Publicado (RF011) — qualquer outro significa solicitação já
  -- em andamento para este cliente.
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
    'Solicitação criada a partir do questionário WhatsApp (RF004/RN03, Serviço Automático)',
    null,
    'Em produção'
  );

  return v_id_solicitacao;
end;
$$;

revoke all on function public.complete_atendimento_and_create_solicitacao(bigint, text, text, text) from public;
revoke all on function public.complete_atendimento_and_create_solicitacao(bigint, text, text, text) from anon, authenticated;
grant execute on function public.complete_atendimento_and_create_solicitacao(bigint, text, text, text) to service_role;
