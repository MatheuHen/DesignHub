-- DesignHub — índices GIN trigram para a busca de clientes (RF003)
-- RF/RN/RNF: RF003 (listagem/busca de clientes), RNF004 (desempenho).
--
-- `cliente.repository.ts` filtra por `nome.ilike.%termo%,whatsapp.ilike.%termo%`
-- (busca com curinga nos dois lados, seção 12.4/RNF004). Um índice B-tree
-- padrão não é usado por esse padrão de LIKE; `pg_trgm` + índice GIN permite
-- que o planner use índice mesmo com `%termo%`. Não altera nenhum
-- comportamento observável (mesmo filtro, mesmos resultados) — apenas
-- desempenho, conforme seção 6 do CLAUDE.md.
create extension if not exists pg_trgm with schema extensions;

create index if not exists cliente_nome_trgm_idx
  on public.cliente using gin (nome extensions.gin_trgm_ops);

create index if not exists cliente_whatsapp_trgm_idx
  on public.cliente using gin (whatsapp extensions.gin_trgm_ops);
