-- DesignHub — RF014: agendador da verificação periódica de publicações vencidas
-- RF: RF014. RN: RN27-RN35, RN41. Seção 11 do CLAUDE.md.
--
-- RF014 exige literalmente "No horário programado, validar solicitação
-- aprovada e agendamento ativo" — isso só acontece de fato se algo dispara a
-- verificação no horário, não só quando um humano chama a rota manualmente.
-- A seção 11 já documenta a solução técnica congelada para isso no plano
-- gratuito: "Um job periódico verifica publicações vencidas/pendentes...
-- preferir Supabase Cron/pg_cron chamando endpoint interno protegido do
-- backend, em vez de depender de cron frequente do Vercel Hobby."
--
-- Toda a regra de negócio (RN30 aprovado-antes-de-agendar, RN32 publicação
-- no horário, RN33 status Publicado, RN34/RN35 log, RN41 falha não marca
-- como publicado, idempotência) já está implementada e testada em
-- `publicacao.service.ts`/`processarAgendamentosVencidos` (Fase 12) e no
-- endpoint protegido `POST /api/internal/publicacoes/processar`
-- (`internalPublicacao.routes.ts`). Esta migration só adiciona o gatilho de
-- horário que faltava — nenhuma lógica de negócio nova.
--
-- O segredo do header `x-internal-job-secret` nunca fica no texto desta
-- migration: é lido do Supabase Vault (`internal_job_secret`, criado fora
-- do controle de versão — seção 12.5/3.6.1) em tempo de execução do job.

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

grant usage on schema cron to postgres;

select cron.unschedule('rf014-processar-publicacoes-vencidas')
where exists (
  select 1 from cron.job where jobname = 'rf014-processar-publicacoes-vencidas'
);

-- A cada 5 minutos: granularidade mínima e suficiente para "no horário
-- programado" sem depender de precisão ao segundo (RN31 já usa uma janela
-- de 3h para cancelamento, muito mais folgada que esse intervalo).
select cron.schedule(
  'rf014-processar-publicacoes-vencidas',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://designhub-backend.vercel.app/api/internal/publicacoes/processar',
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
