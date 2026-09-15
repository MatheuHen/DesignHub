-- DesignHub — item N.5.6: fecha a corrida entre duas mensagens WhatsApp do
-- mesmo atendimento processadas quase simultaneamente (RF004/RN08/RN09).
--
-- Antes: `handleInboundMessage` lia `count(resposta_cliente)` (sem lock),
-- decidia qual pergunta a resposta atual corresponde, e só então inseria —
-- duas requisições concorrentes para o MESMO atendimento podiam ler a mesma
-- contagem, calcular a MESMA pergunta pendente e uma delas ter sua resposta
-- descartada pelo índice único (`resposta_cliente_atendimento_pergunta_idx`),
-- perdendo silenciosamente uma resposta legítima do cliente.
--
-- Agora: leitura da contagem, decisão de qual pergunta e o INSERT ocorrem
-- numa única função SECURITY DEFINER, sob `select ... for update` na linha
-- de `atendimento` — a segunda chamada concorrente para o mesmo atendimento
-- fica bloqueada até a primeira commitar, e então enxerga a contagem já
-- atualizada, avançando corretamente para a pergunta seguinte em vez de
-- tentar (e perder) a mesma pergunta.
create or replace function public.register_resposta_atendimento_e_avancar(
  p_id_atendimento bigint,
  p_perguntas text[],
  p_resposta text
)
returns table (inserted boolean, answered_count integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count integer;
  v_pergunta text;
  v_rows integer;
begin
  perform 1 from public.atendimento where id_atendimento = p_id_atendimento for update;
  if not found then
    raise exception 'Atendimento % não encontrado.', p_id_atendimento using errcode = 'P0002';
  end if;

  select count(*) into v_count from public.resposta_cliente where id_atendimento = p_id_atendimento;

  if v_count >= coalesce(array_length(p_perguntas, 1), 0) then
    -- Questionário já concluído (ex.: mensagem espontânea após o fim) —
    -- nada a inserir, mesmo comportamento já garantido pelo filtro de
    -- atendimentos ativos, aqui como segunda camada sob o lock.
    return query select false, v_count;
    return;
  end if;

  v_pergunta := p_perguntas[v_count + 1];

  insert into public.resposta_cliente (id_atendimento, pergunta, resposta)
  values (p_id_atendimento, v_pergunta, p_resposta)
  on conflict (id_atendimento, pergunta) do nothing;

  get diagnostics v_rows = row_count;

  if v_rows = 0 then
    -- Cinto de segurança: sob o lock isto não deveria ocorrer, mas se
    -- ocorrer, recontar em vez de assumir sucesso.
    select count(*) into v_count from public.resposta_cliente where id_atendimento = p_id_atendimento;
    return query select false, v_count;
    return;
  end if;

  return query select true, v_count + 1;
end;
$$;

comment on function public.register_resposta_atendimento_e_avancar(bigint, text[], text) is
  'RF004/RN08/RN09 (item N.5.6): decide a próxima pergunta pendente e insere a resposta atomicamente sob lock do atendimento, fechando a corrida entre mensagens quase simultâneas.';

revoke all on function public.register_resposta_atendimento_e_avancar(bigint, text[], text) from public;
revoke all on function public.register_resposta_atendimento_e_avancar(bigint, text[], text) from anon, authenticated;
grant execute on function public.register_resposta_atendimento_e_avancar(bigint, text[], text) to service_role;
