# Supabase / PostgreSQL

Esta pasta é a base de migrations do DesignHub.

## Fase 2 — Banco e integridade (concluída)

O DER completo foi implementado em `supabase/migrations/`. A divergência entre
o DER lógico (`usuario.senha_hash`, ID inteiro) e o Supabase Auth foi resolvida
e documentada em `docs/decisions/0001-supabase-auth-vs-der.md`: `usuario.id_usuario`
é `uuid` (FK para `auth.users`) e não existe coluna física `senha_hash`; as
demais entidades mantêm PK `bigint generated always as identity`.

RLS está habilitado em todas as 13 tabelas de negócio. O modelo adotado é:
escrita sempre via backend (service role, após autorização server-side);
leitura direta via Supabase (chave publicável) é restrita a `SELECT`, por
ownership do designer (`id_designer = auth.uid()`) ou perfil administrador
(`public.is_admin()`). O bucket privado `artes` não tem policies para
`authenticated`/`anon`: todo acesso a arquivo é via URL assinada gerada pelo
backend.

**Pendência conhecida**: estas migrations ainda não foram aplicadas a um
projeto Supabase real nesta sessão — o conector MCP disponível não tem acesso
ao projeto do DesignHub (apenas a projetos não relacionados). Aplicar via
`supabase db push`/CLI ou pelo SQL Editor do projeto correto antes de testar
a aplicação ponta a ponta. Ver `docs/evidencias/CONTROLE_EXECUCAO.md`.

Regras que continuam valendo para novas migrations:

1. ler o DER corrigido e a documentacao oficial do TFC;
2. registrar decisão física relevante como ADR antes de considerá-la definitiva;
3. criar migrations reproduzíveis;
4. criar constraints/índices/RLS;
5. testar ownership e integridade;
6. nunca duplicar senha/hash por conveniência;
7. nunca usar service role no frontend.

Não usar dados fake como evidência.
