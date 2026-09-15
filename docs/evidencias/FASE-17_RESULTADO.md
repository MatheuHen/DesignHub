# FASE 17 — Entrega e banca (resultado)

Data: 2026-09-15. Consolida o fechamento técnico do DesignHub para
apresentação à banca. Não substitui `docs/traceability/matriz-rastreabilidade.md`
(fonte de verdade RF-a-RF) nem `docs/evidencias/CONTROLE_EXECUCAO.md`
(histórico cronológico completo) — este documento é a síntese final.

## 1. Cobertura funcional (RF001–RF016)

As 16 funcionalidades estão `IMPLEMENTADO_E2E_REAL` na matriz de
rastreabilidade (`docs/rastreabilidade/MATRIZ_RASTREABILIDADE_DESIGNHUB.csv`):
código completo, revisado por subagentes especializados (segurança/banco/API/
frontend) sem CRITICAL/HIGH em aberto, coberto por testes unitários e de
integração, e validado ao vivo contra o backend/Supabase reais em produção
(dados sintéticos, criados e removidos na mesma sessão de validação).

Estados oficiais (RN39) mantidos exatamente como documentados: `Em produção`,
`Enviado para avaliação`, `Ajustes`, `Aprovado`, `Cancelado`, `Agendado`,
`Publicado`. Nenhum estado, ator, RF ou RN foi criado/removido/fundido.

## 2. Segurança

- RLS habilitada nas 17 tabelas de negócio; `authenticated` só tem `SELECT`
  (RLS decide as linhas); `anon` não tem nenhum privilégio de tabela.
  `TRUNCATE`/`TRIGGER`/`REFERENCES` (privilégios de plataforma não usados
  pela aplicação) foram revogados explicitamente de `anon`/`authenticated`
  em 15/09/2026 como endurecimento defensivo.
- Todas as funções `SECURITY DEFINER` (23) têm `search_path` fixo e
  `revoke`/`grant` explícitos para `anon`/`authenticated` (mitigação do
  achado CRITICAL da Fase 4 — grants de plataforma via
  `ALTER DEFAULT PRIVILEGES`).
- Autorização sempre validada no servidor por perfil **e** ownership; nenhum
  endpoint confia em `id_designer`/`id_cliente`/`id_solicitacao` enviado
  pelo cliente como prova de autorização.
- Segredos: `SUPABASE_SERVICE_ROLE_KEY`/`SUPABASE_SECRET_KEY`, tokens Meta e
  a nova `INSTAGRAM_TOKEN_ENC_KEY` existem apenas no backend/Vercel — nunca
  no frontend, nunca versionados (`.env.local` confirmado fora do Git,
  histórico do repositório sem nenhum commit de `.env`/`.env.local`).
  `cliente_instagram_conexao.access_token` passou a ser cifrado em repouso
  (pgcrypto) em 15/09/2026.
- Dependências: `npm audit` limpo para o caminho de produção (multer, qs,
  js-yaml corrigidos em 15/09/2026, upgrades não-destrutivos dentro da
  mesma major version). Pendência de baixo risco, aceita: `vitest`/
  `@vitest/mocker` (moderate) exige major breaking bump e é dependência de
  teste, não vai para produção — não forçado sem tarefa dedicada.

## 3. Automático × manual (limitações reais das APIs oficiais Meta)

- **WhatsApp (RF004, RF012/RF013 item 8.6, RF014 item 9.2-9.4)**: a Cloud
  API só permite texto livre dentro da janela de 24h aberta pelo **cliente**
  (nunca pelo sistema). Fora dela, é obrigatório um template pré-aprovado
  pela Meta (`business-initiated`). Hoje aprovados e ativos: o template de
  abertura do questionário (RF004) e o alerta ao designer no cancelamento de
  agendamento (item 8.6, categoria `UTILITY`, sem risco de custo
  perceptível). O aviso complementar de "arte publicada" ao cliente
  (RF014/item 9.2-9.4) tem um 3º template em revisão pela Meta; sem ele
  aprovado como `UTILITY`, esse aviso específico fica em
  `BLOCKED_EXTERNAL_WHATSAPP_PUBLICACAO` — **a publicação em si nunca é
  afetada**, e o cliente continua acompanhando o status pelo estado da
  solicitação. Detalhe completo e decisão em
  `docs/decisions/meta-whatsapp-templates-business-initiated.md`.
- **Instagram (RF014)**: publicação automática só ocorre quando o **cliente**
  (dono da solicitação) autorizou a própria conta profissional via OAuth
  oficial ("Instagram API with Instagram Login", ADR 0005) — nunca uma
  conta/token compartilhado entre clientes. Sem essa autorização, ou se a
  API oficial falhar, o sistema cai automaticamente para o **fluxo manual
  documentado** (registro da publicação feita fora do sistema) — a falha
  automática nunca marca a solicitação como `Publicado` silenciosamente.
- Em ambos os casos, a ausência de uma integração automática nunca é
  mascarada: o sistema informa o estado real (`BLOCKED_EXTERNAL_*` nos logs,
  fallback manual na UI) em vez de simular sucesso.

## 4. Pendência real remanescente (não bloqueia entrega)

Único item aberto: aprovação do template `designhub_publicacao_concluida`
pela Meta (categoria declarada `UTILITY`). Depende exclusivamente da
revisão automática da Meta, fora do controle do time. Não impede nenhum RF
obrigatório — o aviso ao cliente continua disponível via estado da
solicitação no sistema.

## 5. Validação final

`npm run verify` (lint + typecheck + test + build, 2 workspaces): **456
testes backend + testes frontend, 0 falhas, 0 regressão**. Build de
produção limpo nos dois workspaces. Deploy final: backend e frontend na
Vercel, migrations aplicadas no Supabase real (40 migrations, `local ==
remote`), `git status` limpo, `origin/main` sincronizado.

## 6. Conclusão

Nenhum achado `CRITICAL`/`HIGH` em aberto. Nenhum bloqueio externo impede
requisito obrigatório do TFC. **`PROJETO_CONCLUIDO`** no sentido da seção
16.5 do `CLAUDE.md`, com a pendência não-bloqueante do item 4 acima
registrada para acompanhamento.
