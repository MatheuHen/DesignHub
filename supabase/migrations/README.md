# Migrations

Ordem de aplicação (todas datadas 2026-08-16, aplicar em ordem crescente de nome):

1. `20260816120000_extensions_and_helpers.sql` — extensões (`pgcrypto`, `citext`) e trigger `set_updated_at`.
2. `20260816120100_usuario_designer_administrador.sql` — RF001/RF002/RF015, RNF007.
3. `20260816120200_cliente.sql` — RF003.
4. `20260816120300_solicitacao.sql` — RF005/RF006/RF011, estados RN39.
5. `20260816120400_atendimento_resposta_cliente.sql` — RF004.
6. `20260816120500_versao_arte_avaliacao_ajuste.sql` — RF007/RF008/RF009/RF010.
7. `20260816120600_agendamento_publicacao.sql` — RF012/RF013/RF014.
8. `20260816120700_historico_solicitacao.sql` — RF011/RF016.
9. `20260816120800_rls_policies.sql` — RLS/policies de todas as tabelas de negócio.
10. `20260816120900_storage_artes.sql` — bucket privado `artes`.

Ver `docs/decisions/0001-supabase-auth-vs-der.md` para o racional de tipos de
PK/FK (uuid vs bigint) e `supabase/README.md` para o modelo de RLS adotado.

Não colocar SQL de exemplo que possa ser aplicado acidentalmente.
