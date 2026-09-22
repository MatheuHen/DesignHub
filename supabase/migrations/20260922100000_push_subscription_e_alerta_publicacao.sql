-- DesignHub — rodada correções 22/09/2026, item 9 (notificações de dispositivo)
-- Web Push (VAPID) para avisar o designer responsável 2h antes de uma
-- publicação agendada. Mesma arquitetura já aprovada para o job de
-- publicação (RF014, seção 11): um cron do Supabase chama um endpoint
-- interno do backend protegido por segredo compartilhado, nunca uma
-- automação separada.

create table public.push_subscription (
  id_subscription bigint generated always as identity primary key,
  id_usuario uuid not null references public.designer (id_usuario) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth_key text not null,
  created_at timestamptz not null default now(),
  unique (id_usuario, endpoint)
);

comment on table public.push_subscription is
  'Item 9 (rodada correções): assinaturas Web Push do navegador do designer — nunca contém dado pessoal do cliente, só o necessário para o navegador entregar a notificação (RNF010).';

create index push_subscription_id_usuario_idx on public.push_subscription (id_usuario);

alter table public.push_subscription enable row level security;

create policy push_subscription_select_owner_or_admin on public.push_subscription
  for select to authenticated
  using (id_usuario = auth.uid() or public.is_admin());

-- Idempotência: evita reenviar o mesmo aviso de "publicação em 2h" a cada
-- ciclo do cron (5 em 5 min) para o mesmo agendamento.
alter table public.agendamento_publicacao
  add column notificado_2h boolean not null default false;

comment on column public.agendamento_publicacao.notificado_2h is
  'Item 9: true depois que o aviso de push "publicação em 2h" foi tentado (sucesso ou falha) — nunca reenviado pelo mesmo agendamento.';

create index agendamento_publicacao_notificar_2h_idx
  on public.agendamento_publicacao (data_hora_publicacao)
  where status = 'Agendado' and notificado_2h = false;
