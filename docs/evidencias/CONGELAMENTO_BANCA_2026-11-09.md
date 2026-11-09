# Congelamento para a banca — 09/11/2026

Tag de restauração: `banca-tfc2-2026-11-09` (commit `70be63a`).

Estado publicado em produção neste commit, migrations aplicadas no Supabase.
Qualquer alteração posterior pode ser revertida para esta tag; os deploys
correspondentes seguem disponíveis como rollback na Vercel.

## Correções desta rodada

| # | Defeito | Evidência da causa | Situação |
|---|---|---|---|
| 1 | Publicação automática no Instagram nunca funcionava | `user_id` da Meta (40108102008836949) acima de `Number.MAX_SAFE_INTEGER`; `JSON.parse` gravava 40108102008836950, objeto inexistente | Corrigido e **comprovado em produção** |
| 2 | Mesma tentativa repetida indefinidamente pelo cron | `register_publicacao_falha` liberava a reserva sempre; 268 falhas no agendamento 45 | Corrigido (classificação permanente/transitório + limite) |
| 3 | Agendamento automático recusado após aprovação do cliente | Validação da tela em minutos vs. RPC em segundos (corrida de ≤60 s) | Corrigido (margem de 2 min nas duas telas) |
| 4 | Aviso "ARTE PUBLICADA", detalhe da publicação e comprovante quebravam | Consulta da publicação concluída alcançava linhas de tentativa falhada (`data_publicada` null, primeiro em `ORDER BY DESC`) | Corrigido (filtro de sucesso) |
| 5 | Agendamento reagendado nunca mais tentava publicar (regressão da correção nº 2) | `update_agendamento` não limpava as marcas de automação desligada | Corrigido (migration `20261109210000`) |
| 6 | Arte recusada pelo Instagram consumia 5 tentativas | `code 36003 / subcode 2207009` (proporção) classificado como transitório | Corrigido (família 2207xxx é permanente) + aviso ao designer explica a recusa |

## Evidência do fluxo automático (RF014/RN32-RN35)

```
agendamento 45 → solicitação 71 → status Publicado
publicacao #303 · tipo automatica · status sucesso
data_publicada 2026-11-09T18:14:14Z
permalink https://www.instagram.com/p/Dfh8yvno1fI/
```

Primeira publicação automática bem-sucedida registrada pelo sistema.

## Validação executada

- `lint`, `typecheck`, `build`: sem erro
- backend: 797 testes
- frontend: 182 testes
- produção: `/api/health` com todas as dependências `configured`
- produção: job de publicação executado pelo cron, com publicação real registrada

### Conferência do banco real (09/11, por consulta direta ao Postgres)

As migrations `20261109120000` (falha permanente) e `20261109210000`
(reagendamento reabilita a automação) apareciam no `supabase migration list`
com `remote` vazio. Conferido por consulta direta que **o banco já estava
correto**: `agendamento_publicacao` tem as colunas
`publicacao_automatica_falhas`, `publicacao_automatica_indisponivel_em` e
`publicacao_automatica_motivo`; `update_agendamento` contém as cláusulas que
zeram/limpam as três; `register_publicacao_falha` já classifica falha
permanente. Ou seja, o SQL tinha sido aplicado por fora do `db push`, sem
registro no histórico.

Histórico sincronizado com `supabase migration repair --status applied` para
as duas versões — comando que escreve apenas em
`supabase_migrations.schema_migrations`, sem executar SQL de migration nem
tocar em tabela, função ou dado. Depois do reparo, `supabase migration list`
mostra `local == remote` nas duas, e um `db push` futuro não tentará
reaplicá-las.

## Pendências conhecidas (não bloqueiam o fluxo, mas devem ser ditas)

1. **Conexão do Instagram do cliente "teste" (id 62)**: token invalidado pela
   Meta (`code 190` — senha da conta alterada). Reconectar antes de usar esse
   cliente em demonstração. Não há agendamento pendente nele.
2. **Avisos por WhatsApp fora da janela de 24 h**: a Cloud API aceita texto
   livre com HTTP 200 e recusa depois, de forma assíncrona (`131047` no
   webhook `statuses`), então o fallback por `catch` não dispara. O link de
   avaliação já usa template como caminho preferencial; os demais avisos ao
   cliente dependem da janela aberta. Procedimento de demonstração: cada
   número usado deve enviar uma mensagem ao número do DesignHub pouco antes,
   o que abre a janela.
3. ~~`SUPABASE_DB_URL` aponta para host que não resolve mais~~ — **diagnóstico
   anterior estava errado, resolvido em 09/11.** O host
   `aws-0-sa-east-1.pooler.supabase.com:5432` resolve e conecta normalmente. A
   falha real era de parsing: o `.env.local` tinha linhas de anotação solta
   (notas de conta, trechos de `curl`) fora do formato `CHAVE=VALOR`, e a CLI
   do Supabase lê o arquivo como dotenv, abortando com `failed to parse
   environment file`. As linhas de nota foram comentadas com `#`, sem alterar
   nenhuma variável ou valor. O acesso local ao banco e a CLI voltaram a
   funcionar. Nunca afetou produção (o backend usa a API do Supabase e as
   variáveis da Vercel).
4. **Proporção da arte**: o feed do Instagram só aceita imagens entre 4:5
   (0,80) e 1.91:1. A arte da solicitação 79 é 360x106 (proporção 3,40) e é
   recusada pela Meta — não é falha do sistema. Para demonstração, usar
   imagens quadradas (ex.: 1080x1080) ou dentro desse intervalo.
5. Aviso de depreciação do Node (`url.parse()`, DEP0169) vindo de dependência
   transitiva: é aviso, não erro, e não afeta comportamento.
