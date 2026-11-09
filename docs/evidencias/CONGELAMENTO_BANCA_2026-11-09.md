# Congelamento para a banca — 09/11/2026

Tag de restauração: `banca-tfc2-2026-11-09` (commit `c9efd9a`).

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
- backend: 793 testes
- frontend: 182 testes
- produção: `/api/health` com todas as dependências `configured`
- produção: job de publicação executado pelo cron, com publicação real registrada

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
3. `SUPABASE_DB_URL` no ambiente local aponta para `aws-0-…:5432`, host que
   não resolve mais; o acesso direto ao banco funciona na porta `6543`. Não
   afeta produção (o backend usa a API do Supabase).
4. Aviso de depreciação do Node (`url.parse()`, DEP0169) vindo de dependência
   transitiva: é aviso, não erro, e não afeta comportamento.
