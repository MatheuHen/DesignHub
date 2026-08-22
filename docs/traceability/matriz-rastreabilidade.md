# Matriz de Rastreabilidade — DesignHub (TFC II)

Atualizado em: 2026-08-22. Fonte: código real do repositório (não é
planejamento — cada linha aponta para arquivo/rota/tabela/teste existente).

Legenda de status: `OK` = implementado, testado e (quando aplicável) validado
em produção real. `BLOCKED_EXTERNAL` = código completo, aguardando apenas
credencial/aprovação externa (Meta) para o teste real acontecer.

## RF001 — Manter Designer

| Item | Onde |
|---|---|
| Tela | `frontend/src/features/admin/designers/DesignersPage.tsx`, `DesignerFormPanel.tsx` |
| API | `GET/POST /api/designers`, `GET/PATCH/PATCH :id/status/DELETE /api/designers/:id` (`backend/src/routes/designer.routes.ts`) |
| Serviço/Repo | `backend/src/services/designer.service.ts`, `repositories/designer.repository.ts` |
| Banco | `usuario`, `designer` (`20260816120100_usuario_designer_administrador.sql`); RPC `create_designer_profile` (`20260816130100_...sql`) |
| Teste | `designer.routes.test.ts`, `designer.service.test.ts`, `designer.repository.test.ts` |
| Status | **OK** — CRUD completo, exclusão respeita impedimento histórico. Criação define a senha diretamente na tela (FIGURA 28, `auth.admin.createUser` com `email_confirm=true`) — não depende mais de e-mail de convite; designer pode logar imediatamente após o cadastro. |

## RF002 — Autenticar Usuário

| Item | Onde |
|---|---|
| Tela | `frontend/src/features/auth/LoginPage.tsx`, `ForgotPasswordPage.tsx`, `ResetPasswordPage.tsx`, `RootRedirect.tsx` |
| API | Supabase Auth (frontend) + `GET /api/auth/me` (`backend/src/routes/auth.routes.ts`) |
| Serviço/Repo | `backend/src/middleware/auth.ts` (`requireAuth`, `attachProfile`, `requireProfile`) |
| Banco | `auth.users` (Supabase Auth) + `public.usuario` |
| Teste | `auth.middleware.test.ts` (10 casos), `auth.routes.test.ts` |
| Status | **OK** — login, recuperação de senha, identificação de perfil e rotas protegidas validados. |

## RF003 — Manter Cliente

| Item | Onde |
|---|---|
| Tela | `frontend/src/features/designer/clientes/ClientesPage.tsx`, `ClienteFormPanel.tsx` |
| API | `GET/POST /api/clientes`, `GET/PATCH/DELETE /api/clientes/:id` (`cliente.routes.ts`) |
| Serviço/Repo | `cliente.service.ts`, `cliente.repository.ts` |
| Banco | `cliente` (`20260816120200_cliente.sql`), RLS ownership por `id_designer` |
| Teste | `cliente.routes.test.ts`, `.service.test.ts`, `.repository.test.ts` |
| Status | **OK** — CRUD, listagem/busca, ownership testado (designer não vê cliente de outro). |

## RF004 — Registrar Respostas do Cliente (WhatsApp)

| Item | Onde |
|---|---|
| Tela | Botão "Iniciar atendimento" em `ClientesPage.tsx`; conversa acontece no WhatsApp do cliente |
| API | `POST /api/clientes/:id/atendimentos`; webhook público `POST/GET /api/webhooks/whatsapp` (`whatsapp.routes.ts`) |
| Serviço/Repo | `atendimento.service.ts`, `atendimento.repository.ts`, `integrations/whatsapp/whatsappClient.ts`, `webhookSignature.ts`, `atendimentoQuestions.ts` |
| Banco | `atendimento`, `resposta_cliente`, `whatsapp_webhook_evento` (`20260816120400_...`, `20260816140000_...`) |
| Teste | `atendimento.service.test.ts`, `atendimento.repository.test.ts`, `whatsapp.routes.test.ts`, `webhookSignature.test.ts` |
| Status | **OK — validado em produção real em 2026-08-22.** Template `inicio_atendimento_designhub` (pt_BR) aprovado pela Meta; fluxo completo exercitado de ponta a ponta via API real (designer autenticado → `POST /clientes/:id/atendimentos` → template abre a conversa + pergunta de confirmação como texto → 5 respostas reais recebidas via webhook → `solicitacao` criada automaticamente ao concluir). Duas causas raiz de infraestrutura encontradas e corrigidas nesta validação: (1) WABA não estava inscrita no webhook do app (`subscribed_apps` vazio) e o app não tinha nenhum webhook registrado (`/{app-id}/subscriptions` vazio) — ambos configurados via Graph API; (2) `wa_id` que a Meta envia para números BR pode omitir o 9º dígito do celular — `normalizePhone` (`atendimento.repository.ts`) agora canoniza os dois lados da comparação. |

## RF005 — Manter/Acompanhar Solicitação de Arte

| Item | Onde |
|---|---|
| Tela | `frontend/src/features/designer/solicitacoes/SolicitacoesPage.tsx`, `SolicitacaoDetailPage.tsx` |
| API | `GET /api/solicitacoes`, `GET/PATCH /api/solicitacoes/:id` (`solicitacao.routes.ts`) |
| Serviço/Repo | `solicitacao.service.ts`, `solicitacao.repository.ts` |
| Banco | `solicitacao` (`20260816120300_solicitacao.sql`) |
| Teste | `solicitacao.routes.test.ts`, `.service.test.ts`, `.repository.test.ts` |
| Status | **OK** — nasce em `Em produção` via RF004 (validado ao vivo em 2026-08-22, solicitação real #12), listagem/filtros (status, cliente, data)/detalhe/histórico/versões funcionando. |

## RF006 — Bloquear Designer por Atraso

| Item | Onde |
|---|---|
| Tela | Aviso de bloqueio em `frontend/src/features/designer/DesignerHome.tsx` |
| API | Refletido em `GET /api/auth/me` (campo `bloqueado`) |
| Serviço/Repo | `syncDesignerBloqueio` (`solicitacao.repository.ts`), chamado em `iniciarAtendimento` |
| Banco | RPC `sync_designer_bloqueio` (`20260816150000_designer_bloqueio_function.sql`), coluna gerada `prazo_primeira_versao` (+5 dias) |
| Teste | `DesignerHome.test.tsx`, `App.test.tsx`, testes de `solicitacao.repository.test.ts` |
| Status | **OK** — bloqueio/desbloqueio automático testado (RN11/RN12). |

## RF007/RF008 — Upload e Versionamento de Arte

| Item | Onde |
|---|---|
| Tela | Formulário de nova versão + botão "Baixar" em `SolicitacaoDetailPage.tsx` |
| API | `POST /api/solicitacoes/:id/versoes`, `GET /api/solicitacoes/:id/versoes/:versaoId/download-url` |
| Serviço/Repo | `versaoArte.service.ts`, `versaoArte.repository.ts`, `lib/fileSignature.ts`, `middleware/upload.ts` |
| Banco | `versao_arte` (`20260816120500_...`), bucket privado `artes` (`20260816120900_storage_artes.sql`), RPC `register_versao_arte` |
| Teste | `versaoArte.service.test.ts`, `.repository.test.ts`, `fileSignature.test.ts`, rotas em `solicitacao.routes.test.ts` |
| Status | **OK** — V1/V2... sequencial atômico, PDF/JPG/PNG validado por assinatura de bytes, URL assinada de download. |

## RF009/RF010 — Avaliação da Arte e Ajustes

| Item | Onde |
|---|---|
| Tela | `frontend/src/features/avaliacao/AvaliacaoPage.tsx` (rota pública `/avaliacao/:token`) |
| API | `GET/POST /api/avaliacao/:token` (público, sem JWT); `POST /api/solicitacoes/:id/link-avaliacao` (designer) |
| Serviço/Repo | `avaliacao.service.ts`, `avaliacao.repository.ts`, `lib/tokens.ts` |
| Banco | `avaliacao`, `ajuste` (`20260816120500_...`), `avaliacao_link_token` + RPCs `generate_avaliacao_link_token`/`submit_avaliacao` (`20260816170000_...`) |
| Teste | `avaliacao.routes.test.ts`, `.service.test.ts`, `.repository.test.ts`, `AvaliacaoPage.test.tsx` |
| Status | **OK** — token opaco de 256 bits, 4 estados do link tratados, Aprovar/Ajustes/Cancelar completos. |

## RF011 — Atualizar Status Automaticamente

| Item | Onde |
|---|---|
| Serviço/Repo | Transições implementadas dentro de cada RPC atômica (não há tabela separada de "máquina de estados" — é enforced por CHECK/lógica SQL) |
| Banco | CHECK `status` em `20260816120300_solicitacao.sql` (RN39, 7 estados exatos); `historico_solicitacao` grava toda transição |
| Teste | Testes de status inválido (409) em `solicitacao.service.test.ts`, `versaoArte.service.test.ts`, `avaliacao.service.test.ts`, `agendamento.service.test.ts` |
| Status | **OK** — todos os 8 passos da RN11/RF011 cobertos, sem saltos ilegais. |

## RF012/RF013 — Agendamento e Cancelamento

| Item | Onde |
|---|---|
| Tela | `frontend/src/features/designer/agendamentos/AgendamentosPage.tsx` |
| API | `GET /api/agendamentos`; `POST/PATCH/DELETE /api/solicitacoes/:id/agendamento` (`solicitacao.routes.ts`) |
| Serviço/Repo | `agendamento.service.ts`, `agendamento.repository.ts` |
| Banco | `agendamento_publicacao` (`20260816120600_...`), RPCs em `20260816180000_agendamento_publicacao_functions.sql` |
| Teste | `agendamento.routes.test.ts`, `.service.test.ts`, `.repository.test.ts`, `AgendamentosPage.test.tsx` |
| Status | **OK** — só `Aprovado` agenda; cancelamento com janela de 3h testada (permitido e bloqueado). |

## RF014 — Realizar Publicação da Arte

| Item | Onde |
|---|---|
| API | `POST /api/internal/publicacoes/processar` (interno, protegido por segredo) |
| Serviço/Repo | `publicacao.service.ts`, `integrations/instagram/instagramClient.ts` |
| Banco | `publicacao` (`20260816120600_...`), RPCs em `20260816190000_publicacao_functions.sql`, job `pg_cron` (`20260819110000_publicacao_cron_job.sql`) |
| Teste | `publicacao.service.test.ts`, `instagramClient.test.ts` |
| Status | **OK — validado em produção real em 2026-08-19** (post real publicado, `publicacao.status='sucesso'` confirmado no banco). Fallback manual disponível quando token ausente/inválido. |

## RF015/RF016 — Gerenciar Designers e Reatribuir Solicitações

| Item | Onde |
|---|---|
| API | `PATCH /api/solicitacoes/:id/reatribuir` (admin-only) |
| Serviço/Repo | `solicitacao.service.ts` (`reassignSolicitacao`) |
| Banco | RPC `reassign_solicitacao` (`20260816130000_reassign_solicitacao_function.sql`) — atômica, preserva histórico/versões/avaliações |
| Teste | Casos de reatribuição em `solicitacao.routes.test.ts`/`.service.test.ts` (designer de destino inválido, mesmo designer, auditoria) |
| Status | **OK**. |

## RNFs

| RNF | Evidência |
|---|---|
| RNF001 Responsividade | Telas revisadas em mobile/tablet/desktop (`designhub-frontend-reviewer`, fases 4-13) |
| RNF002 Usabilidade | Estados de loading/erro/vazio em todas as páginas listadas acima |
| RNF003 Web app | React SPA, sem instalação — `frontend/` |
| RNF004 Desempenho | Índices dedicados por consulta quente (ex.: `solicitacao_designer_vencida_idx`); revisão de performance nas fases |
| RNF005 Disponibilidade | Deploy Vercel + Supabase, healthcheck `/api/health` |
| RNF006 Compatibilidade | Build Vite padrão, sem APIs proprietárias de navegador |
| RNF007 Segurança | Supabase Auth, hash gerenciado pelo Auth (nunca em `public.usuario`), e-mail único (`citext` unique) |
| RNF008 Nuvem | Supabase Storage, bucket privado `artes` |
| RNF009 Integridade | FKs/UNIQUEs/CHECKs em todas as migrations; transações via RPC SECURITY DEFINER |
| RNF010 LGPD | Minimização de dados (só nome/WhatsApp/Instagram/mensagens/referências), acesso restrito por RLS+ownership |

## ADRs relacionadas

- `docs/decisions/0001-supabase-auth-vs-der.md`
- `docs/decisions/0002-whatsapp-cloud-api.md`
- `docs/decisions/0003-instagram-oficial-fallback-manual.md`

## Bloqueios externos reais (não são falhas de implementação)

Nenhum bloqueio externo pendente nesta data (2026-08-22). RF004 (template
Meta) e RF014 (token Instagram) foram validados com sucesso real em
produção; RF001 deixou de depender de e-mail de convite (fluxo trocado para
definição de senha pelo admin na criação, FIGURA 28).
