-- DesignHub — auditoria de produção (achado HIGH, Meta reviewer): perda
-- silenciosa e permanente de resposta do cliente no webhook do WhatsApp.
-- Cenário: `registerWebhookEventOnce` marcava o evento como "visto" com um
-- único INSERT antes de qualquer processamento real (RN09: registrar
-- pergunta/resposta). Se uma falha transitória (timeout, erro momentâneo do
-- Supabase) ocorresse em qualquer chamada posterior dentro da mesma
-- requisição, a exceção propagava, a Meta reentregava o webhook (padrão dela
-- para respostas não-2xx), mas a reentrega encontrava o evento já "visto" e
-- retornava cedo sem processar nada — a resposta do cliente era perdida sem
-- log de erro e sem possibilidade de nova tentativa.
--
-- Correção: mecanismo de duas fases. `status` começa 'processando'; só vira
-- 'concluido' depois que TODO o processamento terminar com sucesso. Uma
-- reentrega que encontra o evento ainda 'processando' há mais de
-- `p_stale_after_seconds` (indicando que a tentativa anterior travou/caiu)
-- pode reclamar e tentar de novo — mesmo padrão de
-- `claim_agendamento_publicacao` (RF014) aplicado aqui ao webhook (RF004).

alter table public.whatsapp_webhook_evento
  add column if not exists status text not null default 'processando',
  add column if not exists concluido_em timestamptz;

alter table public.whatsapp_webhook_evento
  drop constraint if exists whatsapp_webhook_evento_status_check;

alter table public.whatsapp_webhook_evento
  add constraint whatsapp_webhook_evento_status_check
  check (status in ('processando', 'concluido'));

comment on column public.whatsapp_webhook_evento.status is
  'processando = reservado, processamento ainda não confirmado; concluido = processado com sucesso (nunca reprocessar).';
comment on column public.whatsapp_webhook_evento.processado_em is
  'Instante da reserva mais recente (não mais só "visto uma vez") — usado para detectar reserva travada (stale) e permitir nova tentativa.';

-- RF004/seção 12.3/Gate G: reserva o evento (novo) ou, se já existir e a
-- reserva anterior estiver travada há mais de `p_stale_after_seconds`,
-- reclama para uma nova tentativa. Retorna `true` quando o chamador deve
-- processar a mensagem; `false` quando já está concluída ou sendo
-- processada por outra requisição concorrente (reentrega genuinamente
-- duplicada em voo).
create or replace function public.claim_webhook_evento(
  p_id_evento text,
  p_stale_after_seconds int default 30
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row_count int;
begin
  begin
    insert into public.whatsapp_webhook_evento (id_evento) values (p_id_evento);
    return true;
  exception when unique_violation then
    -- já existe: só reclama se ainda estiver 'processando' e a reserva
    -- estiver travada há mais tempo que o limite (tentativa anterior caiu).
    update public.whatsapp_webhook_evento
    set processado_em = now()
    where id_evento = p_id_evento
      and status = 'processando'
      and processado_em < now() - make_interval(secs => p_stale_after_seconds);

    get diagnostics v_row_count = row_count;
    return v_row_count > 0;
  end;
end;
$$;

revoke all on function public.claim_webhook_evento(text, int) from public;
revoke all on function public.claim_webhook_evento(text, int) from anon, authenticated;
grant execute on function public.claim_webhook_evento(text, int) to service_role;

-- Marca o evento como definitivamente processado — só chamado depois que
-- TODO o efeito colateral real (resposta registrada, atendimento avançado,
-- solicitação criada, etc.) já foi confirmado com sucesso.
create or replace function public.mark_webhook_evento_concluido(
  p_id_evento text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.whatsapp_webhook_evento
  set status = 'concluido',
      concluido_em = now()
  where id_evento = p_id_evento;
end;
$$;

revoke all on function public.mark_webhook_evento_concluido(text) from public;
revoke all on function public.mark_webhook_evento_concluido(text) from anon, authenticated;
grant execute on function public.mark_webhook_evento_concluido(text) to service_role;
