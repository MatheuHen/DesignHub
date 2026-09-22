-- DesignHub — item 9 (rodada correções): agendador da verificação periódica
-- de publicações próximas (aviso Web Push 2h antes) — mesmo padrão já
-- aprovado para o cron de publicação vencida (RF014,
-- `20260819110000_publicacao_cron_job.sql`): Supabase Cron/pg_cron chamando
-- um endpoint interno do backend protegido por segredo compartilhado.

select cron.unschedule('item9-notificar-publicacoes-proximas')
where exists (
  select 1 from cron.job where jobname = 'item9-notificar-publicacoes-proximas'
);

-- A cada 5 minutos, mesma granularidade do cron de publicação — a janela de
-- checagem no backend (~110-130 min antes) já é larga o suficiente para não
-- perder nenhum agendamento entre execuções.
select cron.schedule(
  'item9-notificar-publicacoes-proximas',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://designhub-backend.vercel.app/api/internal/notificacoes/processar',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-internal-job-secret', (
        select decrypted_secret from vault.decrypted_secrets where name = 'internal_job_secret'
      )
    ),
    body := '{}'::jsonb
  );
  $$
);
