# Supabase / PostgreSQL

Esta pasta é a base de migrations do DesignHub.

## Por que não há tabelas de negócio nesta versão inicial?

O projeto possui um ponto arquitetural explícito a resolver entre o DER lógico (`usuario`, `senha_hash`, ID lógico) e o mecanismo físico de identidade do Supabase Auth. Criar tabelas automaticamente antes da fase de banco poderia consolidar uma divergência documental.

Durante a implementacao da camada de banco de dados:

1. ler o DER corrigido e a documentacao oficial do TFC;
2. registrar a decisão física sem alterar requisito;
3. criar migrations reproduzíveis;
4. criar constraints/índices/RLS;
5. testar ownership e integridade;
6. nunca duplicar senha/hash por conveniência;
7. nunca usar service role no frontend.

Não usar dados fake como evidência.
