-- DesignHub — extensões e funções utilitárias de banco
-- RF/RN/RNF: base técnica (nenhum requisito de negócio diretamente).
-- Ver docs/decisions/0001-supabase-auth-vs-der.md para o racional de tipos.
--
-- Convenção adotada nesta camada: colunas técnicas `created_at`/`updated_at`
-- (auditoria de infraestrutura, não dado de negócio) são aceitas em qualquer
-- tabela mesmo quando não listadas na enumeração literal do DER (CLAUDE.md,
-- seção 9) — respaldado pela seção 6 (melhorias não funcionais de
-- observabilidade/organização são permitidas). Nunca substituem
-- `historico_solicitacao`, que é a fonte de auditoria de negócio (RF011/RN48).

-- Extensões ficam no schema dedicado `extensions` (já provisionado e incluído
-- no search_path por padrão em projetos Supabase), e não em `public`, que é
-- exposto via PostgREST — recomendação padrão do Supabase Advisor.
create schema if not exists extensions;
-- pgcrypto: reservado para hashing do token opaco de avaliação pública
-- (RF009, seção 11 do CLAUDE.md), implementado na Fase 9. Nenhuma tabela
-- usa gen_random_uuid()/crypt() ainda nesta fase.
create extension if not exists pgcrypto with schema extensions;
create extension if not exists citext with schema extensions;

-- Mantém updated_at coerente sem depender da aplicação lembrar de setá-lo.
-- search_path fixo evita hijacking via search_path mutável (Supabase Advisor).
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
