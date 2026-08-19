-- DesignHub — privilégios base de tabela (GRANT), descobertos como
-- ausentes na primeira aplicação real das migrations nesta sessão.
--
-- RLS (Fase 2, 20260816120800_rls_policies.sql) é a SEGUNDA camada de
-- defesa (seção 12.1/12.4 do CLAUDE.md) — mas o Postgres exige privilégio
-- de GRANT na tabela ANTES de sequer avaliar RLS. Sem GRANT, toda query
-- falha com 42501 "permission denied for table", mesmo para service_role
-- (que ignora RLS mas não ignora GRANT). Este projeto Supabase não tinha
-- os privilégios padrão pré-configurados para anon/authenticated/service_role
-- nas tabelas de negócio — confirmado ao aplicar as migrations pela
-- primeira vez contra o banco real (ver docs/evidencias/CONTROLE_EXECUCAO.md).
--
-- Modelo replicado exatamente do comentário já existente em
-- 20260816120800_rls_policies.sql: toda escrita de negócio acontece via
-- backend com a chave admin (service_role); leitura direta via chave
-- publicável (authenticated) é só SELECT, restrita por RLS a
-- ownership/perfil administrador. Nenhum GRANT de INSERT/UPDATE/DELETE é
-- dado a authenticated/anon nas tabelas de negócio — intencional.

grant usage on schema public to anon, authenticated, service_role;

grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;

grant select on all tables in schema public to authenticated;

-- Garante que tabelas/sequences criadas por futuras migrations herdem os
-- mesmos privilégios sem exigir uma nova migration de GRANT a cada vez.
alter default privileges in schema public
  grant select, insert, update, delete on tables to service_role;
alter default privileges in schema public
  grant usage, select on sequences to service_role;
alter default privileges in schema public
  grant select on tables to authenticated;
