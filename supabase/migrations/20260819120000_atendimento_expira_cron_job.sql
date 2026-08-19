-- DesignHub — RN05: agendador da expiração de atendimentos parados
-- RF: RF004. RN: RN05. Seção 11 do CLAUDE.md.
--
-- `expire_stale_atendimentos()` já existia (Fase 6) mas nunca foi chamada
-- por nada além da checagem "lazy" em `processInboundMessage`, que só roda
-- quando uma NOVA mensagem chega para aquele atendimento. Se o cliente
-- nunca mais responde, o atendimento fica `em_andamento` para sempre e
-- bloqueia um novo atendimento para o mesmo cliente (RN04, índice único
-- `atendimento_ativo_unico_idx`). Mesmo padrão já usado para RF014
-- (pg_cron chamando endpoint interno protegido) — nenhuma lógica de
-- negócio nova, só o gatilho de horário que faltava.
--
-- Janela de 2 dias (RN05) tolera folga grande: 30 min é conservador o
-- suficiente sem gerar carga desnecessária (bem menos frequente que o job
-- de publicação, que precisa de precisão de minutos).

select cron.unschedule('rn05-expirar-atendimentos-parados')
where exists (
  select 1 from cron.job where jobname = 'rn05-expirar-atendimentos-parados'
);

select cron.schedule(
  'rn05-expirar-atendimentos-parados',
  '*/30 * * * *',
  $$
  select net.http_post(
    url := 'https://designhub-backend.vercel.app/api/internal/atendimentos/processar',
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
