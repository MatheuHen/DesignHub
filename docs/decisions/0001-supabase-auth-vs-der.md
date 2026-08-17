# ADR 0001 — Supabase Auth x DER (identidade e senha)

- Status: aceita
- Data: 2026-08-16
- RF/RN/RNF relacionados: RF002, RNF007, seção 10 do `CLAUDE.md`

## Contexto

O DER corrigido (`CLAUDE.md`, seção 9) declara `usuario.id_usuario` como PK inteiro
e `usuario.senha_hash` como atributo físico da tabela `usuario`. A arquitetura
alvo (`CLAUDE.md`, seção 11) exige o uso de **Supabase Auth** para autenticação,
que gerencia credenciais internamente com identidade própria em `auth.users`
(chave `uuid`) e nunca expõe hash de senha à aplicação.

O `CLAUDE.md` (seção 10) já antecipa esse ponto documental e define política
preferida de implementação, autorizando a decisão abaixo sem necessidade de
interromper a implementação, desde que registrada nesta ADR — não houve, nesta
sessão, exigência de correspondência física literal por parte de orientador.

## Decisão

1. `public.usuario.id_usuario` é `uuid` e é ao mesmo tempo PK e FK para
   `auth.users.id` (`on delete cascade`). Isso substitui o tipo `int` do DER
   lógico **somente neste atributo**, exclusivamente para permitir a
   integração nativa com Supabase Auth. Nenhum outro atributo do DER é afetado
   por esta decisão.
2. `usuario.senha_hash` **não existe como coluna física**. O atributo lógico
   permanece documentado aqui como delegado ao subsistema Supabase Auth
   (`auth.users.encrypted_password`), nunca replicado, nunca lido nem exposto
   pela aplicação DesignHub.
3. Demais entidades do DER que não têm relação direta de identidade com
   `auth.users` (`cliente`, `solicitacao`, `agendamento_publicacao`,
   `publicacao`, `atendimento`, `resposta_cliente`, `historico_solicitacao`,
   `versao_arte`, `avaliacao`, `ajuste`) mantêm PK numérica
   (`bigint generated always as identity`), preservando a semântica de
   identificador inteiro sequencial do DER.
4. `designer` e `administrador` continuam como tabelas de especialização
   1:1 de `usuario` (`id_usuario` como PK/FK), agora em `uuid`.
5. RF002/RNF007 permanecem inalterados: autenticação por e-mail/senha, hash
   seguro, e-mail único, identificação de perfil e permissões correspondentes.
   Nenhum comportamento funcional visível ao usuário muda — apenas o mecanismo
   físico de armazenamento de credencial.
6. Perfil (`designer`/`administrador`) e status operacional continuam
   persistidos na camada de aplicação (`public.usuario.perfil`,
   `public.usuario.status`), nunca inferidos apenas por convenção de e-mail no
   frontend (RN50/RN51).

## Consequências

- Login/sessão/refresh são delegados ao Supabase Auth (JWT), reduzindo
  superfície de ataque de gestão de senha própria.
- Todo acesso a `public.usuario`/`designer`/`administrador` deve considerar
  `auth.uid()` como identidade canônica.
- Diagramas físicos/DER do TFC II devem ser atualizados para refletir esta
  delegação explicitamente (pendência de documentação, não de código).
- Criação de novo usuário (designer/administrador) exige duas operações
  coordenadas: (a) criação da identidade em `auth.users` via Supabase Auth
  Admin API (service role) e (b) inserção da linha correspondente em
  `public.usuario`/`designer`/`administrador`. Implementado na Fase 3/4.

## Alternativas rejeitadas

- Manter `id_usuario` como `int` e duplicar `senha_hash` em tabela própria:
  rejeitado por violar a política preferida da seção 10 do `CLAUDE.md` e por
  reintroduzir gestão de senha própria fora do Supabase Auth sem necessidade.
