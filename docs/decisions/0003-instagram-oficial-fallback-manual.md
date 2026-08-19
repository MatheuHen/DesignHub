# ADR 0003 — Instagram API oficial da Meta + fallback manual obrigatório

- Status: aceita e implementada (publicação automática validada em produção
  real em 2026-08-19)
- Data: 2026-08-16 (decisão) / 2026-08-19 (validação end-to-end real)
- RF/RN/RNF relacionados: RF014, RN27-RN35, RN41, seção 2 e seção 2.1 do
  `CLAUDE.md`

## Contexto

O TFC exige publicação da arte aprovada no Instagram do cliente no horário
agendado. A seção 2 do `CLAUDE.md` determina: "usar a Instagram API oficial
da Meta quando a conta permitir integração; preservar obrigatoriamente o
caminho manual previsto nos documentos quando não houver acesso/integrabilidade".

## Decisão

1. Adapter `InstagramProvider`
   (`backend/src/integrations/instagram/instagramClient.ts`) usa a
   **Instagram Content Publishing API oficial** (produto "Instagram API with
   Instagram Login"), contra o host `graph.instagram.com` (não
   `graph.facebook.com` — decisão técnica corrigida em 2026-08-19 após teste
   real: o token desse produto só é aceito nesse host).
2. Fluxo de publicação automática: cria container de mídia, faz *polling* do
   `status_code` até `FINISHED` (`waitForContainerReady`, até 5 tentativas de
   1.5s — exigência documentada pela própria Meta antes de `media_publish`),
   então publica e registra o resultado em `publicacao` (RN34/RN35).
3. Gatilho de horário: job `pg_cron` no Supabase chamando o endpoint interno
   protegido `POST /api/internal/publicacoes/processar` a cada 5 minutos
   (mecanismo já congelado pela seção 11 do `CLAUDE.md` para plano
   gratuito), autenticado por segredo (`INTERNAL_JOB_SECRET`, Supabase
   Vault), nunca exposto publicamente sem credencial.
4. **Falha automática nunca marca como publicado** — a solicitação/
   agendamento permanecem pendentes e o erro é registrado em `publicacao`
   (`status='falha'`), preservando RN34/RN35 mesmo sob erro externo. Validado
   com 3 falhas reais consecutivas (token errado → host errado → container
   não pronto) antes do sucesso, nenhuma delas marcou sucesso falso.
5. Publicação idempotente: reprocessamento do job não publica duas vezes
   (índice único parcial `publicacao_unica_sucesso_idx`, criado na Fase 2).
6. **Fallback manual obrigatório**: quando não há
   `INSTAGRAM_ACCESS_TOKEN`/`INSTAGRAM_ACCOUNT_ID` configurados ou válidos, o
   caminho documental de publicação manual + registro pelo fluxo previsto
   continua disponível — a ausência/erro de integração nunca bloqueia o
   registro do resultado real da publicação feita fora do sistema.
7. Validação real: em 2026-08-19, com credencial válida fornecida pelo
   usuário, o sistema publicou de fato um post real na conta de teste
   `designhub_26`, confirmado por consulta direta ao banco
   (`solicitacao.status='Publicado'`, `agendamento.status='Publicado'`,
   `publicacao.status='sucesso'`).

## Consequências

- Exige conta Instagram Profissional de teste + App Meta com produto
  "Instagram API with Instagram Login" configurado — dependência externa;
  ausência/invalidez de token é registrada como `BLOCKED_EXTERNAL_META`,
  sem nunca simular sucesso.
- `maxDuration` da função Vercel do backend elevado de 10s para 30s para
  acomodar o polling do container (`backend/vercel.json`).
- Nenhum novo RF/RN/ator/estado foi criado; a máquina de estados RF011 e os
  estados oficiais (`Agendado`→`Publicado`) permanecem exatamente os
  documentados.

## Alternativas rejeitadas

- Automação de navegador para postar no Instagram: rejeitado pela seção 2.1
  (proibição de automação não oficial).
- Usar `graph.facebook.com` (Graph API clássica) para todos os tokens:
  rejeitado após teste real mostrar que o token do produto "Instagram API
  with Instagram Login" só é aceito em `graph.instagram.com`; mantida
  detecção pelo host correto conforme o produto Meta configurado.
