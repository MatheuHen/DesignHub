-- DesignHub — rodada correções 23/09/2026, item 15 (RF004/RN08/RN09).
--
-- Achado HIGH: o retry do webhook da Meta podia gravar a resposta do cliente
-- na PERGUNTA ERRADA.
--
-- Cenário real: `register_webhook_evento_once` reserva o evento, o
-- processamento grava a resposta com sucesso e, depois disso, alguma chamada
-- seguinte falha (timeout do Supabase, erro ao criar a solicitação). A rota
-- responde não-2xx, a Meta reentrega o MESMO `wamid` e, passados os 30s da
-- janela de reserva, o evento é reclamado e reprocessado. Só que agora
-- `count(resposta_cliente)` já está incrementado: o mesmo texto que era a
-- resposta de "tema" é gravado como resposta de "cores", e a pergunta
-- seguinte é reenviada ao cliente.
--
-- O índice único `(id_atendimento, pergunta)` não protegia contra isso,
-- porque a pergunta alvo do reprocessamento é outra.
--
-- Correção: amarrar cada resposta ao identificador da mensagem que a
-- originou (`wamid`, imutável e único por mensagem na Cloud API). Reprocessar
-- o mesmo evento passa a ser um no-op explícito, independentemente de quantas
-- respostas já existam.

alter table public.resposta_cliente
  add column if not exists id_evento text;

comment on column public.resposta_cliente.id_evento is
  'Item 15: `wamid` da mensagem do WhatsApp que originou esta resposta. Amarra resposta -> mensagem para que o reprocessamento de um evento reentregue pela Meta nunca grave o mesmo texto em outra pergunta. Nulo nas respostas anteriores a esta migration.';

-- Parcial: respostas antigas (sem evento) e futuras respostas sem wamid
-- continuam permitidas; duas respostas para o MESMO wamid, nunca.
create unique index if not exists resposta_cliente_id_evento_idx
  on public.resposta_cliente (id_evento)
  where id_evento is not null;

-- A assinatura muda (novo parâmetro) — remove a de 3 parâmetros.
drop function if exists public.register_resposta_atendimento_e_avancar(bigint, text[], text);

create or replace function public.register_resposta_atendimento_e_avancar(
  p_id_atendimento bigint,
  p_perguntas text[],
  p_resposta text,
  p_id_evento text default null
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
  v_ja_registrado boolean;
begin
  perform 1 from public.atendimento where id_atendimento = p_id_atendimento for update;
  if not found then
    raise exception 'Atendimento % não encontrado.', p_id_atendimento using errcode = 'P0002';
  end if;

  -- Item 15: sob o mesmo lock, antes de qualquer decisão sobre qual pergunta
  -- responder — é o que impede o reprocessamento de escolher outra pergunta.
  if p_id_evento is not null then
    select exists (
      select 1 from public.resposta_cliente r where r.id_evento = p_id_evento
    ) into v_ja_registrado;

    if v_ja_registrado then
      select count(*) into v_count from public.resposta_cliente where id_atendimento = p_id_atendimento;
      return query select false, v_count;
      return;
    end if;
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

  insert into public.resposta_cliente (id_atendimento, pergunta, resposta, id_evento)
  values (p_id_atendimento, v_pergunta, p_resposta, p_id_evento)
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

comment on function public.register_resposta_atendimento_e_avancar(bigint, text[], text, text) is
  'RF004/RN08/RN09 (itens N.5.6 e 15): decide a próxima pergunta pendente e insere a resposta atomicamente sob lock do atendimento — fecha a corrida entre mensagens quase simultâneas E torna o reprocessamento do mesmo evento da Meta um no-op, em vez de gravar a resposta em outra pergunta.';

revoke all on function public.register_resposta_atendimento_e_avancar(bigint, text[], text, text) from public;
revoke all on function public.register_resposta_atendimento_e_avancar(bigint, text[], text, text) from anon, authenticated;
grant execute on function public.register_resposta_atendimento_e_avancar(bigint, text[], text, text) to service_role;
