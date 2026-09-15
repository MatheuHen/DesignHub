-- DesignHub — endurecimento defensivo (Fase 17): revoga privilégios de
-- tabela não usados pela aplicação, concedidos por padrão da plataforma
-- Supabase a `anon`/`authenticated` (mesma classe de achado já corrigida
-- para funções SECURITY DEFINER na Fase 4 — "projetos Supabase concedem
-- privilégio via ALTER DEFAULT PRIVILEGES no bootstrap da plataforma",
-- independente das migrations deste repositório).
--
-- `TRUNCATE`/`TRIGGER`/`REFERENCES` não são usados pelo PostgREST (sem
-- verbo HTTP equivalente) nem pelo cliente `anon`/`authenticated` real
-- (sessão de API, sem conexão SQL direta) — mas mantê-los concedidos viola
-- o princípio de menor privilégio (seção 12.1 do CLAUDE.md) sem trazer
-- nenhum benefício funcional. `authenticated` mantém apenas `SELECT`
-- (filtrado por RLS); `anon` não mantém nenhum privilégio de DML/DDL.
revoke truncate, trigger, references on all tables in schema public from anon, authenticated;

alter default privileges in schema public
  revoke truncate, trigger, references on tables from anon, authenticated;
