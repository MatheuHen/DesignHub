-- DesignHub — RF014/RN32/RN41: corrige o ATRASO e o CORTE do disparo da
-- publicação automática.
--
-- Dois defeitos reais observados em produção no mesmo teste:
--
-- 1. ATRASO. O job rodava a cada 5 minutos (`*/5`), então uma arte agendada
--    para 09:28 só era processada no ciclo seguinte. RF014/RN32 falam em
--    publicar "no horário programado": uma granularidade de 5 minutos é
--    visivelmente fora do horário para quem agendou. Passa a rodar a cada
--    minuto — o agendamento tem precisão de minuto (data_publicacao +
--    horario), então um job por minuto é a granularidade exata do dado, não
--    uma otimização arbitrária. Continua dentro do plano gratuito (pg_cron
--    não cobra por execução) e o endpoint interno é no-op quando não há
--    agendamento vencido.
--
-- 2. CORTE NO MEIO (causa raiz da publicação duplicada). `net.http_post` sem
--    `timeout_milliseconds` usa o default de 5 segundos do pg_net. A
--    publicação real leva mais que isso por construção: criar o container,
--    aguardar o `status_code` virar FINISHED (poll obrigatório da própria
--    Content Publishing API) e só então `media_publish` — além do cold start
--    da função na Vercel. A conexão era cortada no meio, a reserva do
--    agendamento expirava após 300s e o ciclo seguinte publicava DE NOVO.
--    O timeout passa a 30s, acima do pior caso da chamada.
--
-- A defesa contra duplicidade propriamente dita está na migration
-- 20261021100000 (persistência do container antes de publicar) — esta aqui
-- remove a causa que a disparava. Nenhuma regra de negócio é alterada:
-- continua sendo o mesmo endpoint interno protegido chamando o mesmo serviço.

select cron.unschedule('rf014-processar-publicacoes-vencidas')
where exists (
  select 1 from cron.job where jobname = 'rf014-processar-publicacoes-vencidas'
);

select cron.schedule(
  'rf014-processar-publicacoes-vencidas',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://designhub-backend.vercel.app/api/internal/publicacoes/processar',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-internal-job-secret', (
        select decrypted_secret from vault.decrypted_secrets where name = 'internal_job_secret'
      )
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);

-- Mesmo defeito de timeout (default 5s) nos outros dois jobs: a frequência
-- deles é adequada (não são sensíveis ao minuto), mas uma chamada cortada em
-- 5s simplesmente não conclui o trabalho. Só o timeout muda.
select cron.unschedule('rn05-expirar-atendimentos-parados')
where exists (select 1 from cron.job where jobname = 'rn05-expirar-atendimentos-parados');

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
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);

select cron.unschedule('item9-notificar-publicacoes-proximas')
where exists (select 1 from cron.job where jobname = 'item9-notificar-publicacoes-proximas');

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
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);
