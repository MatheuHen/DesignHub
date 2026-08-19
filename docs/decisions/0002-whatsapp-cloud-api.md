# ADR 0002 — WhatsApp Web (não oficial) → WhatsApp Cloud API oficial da Meta

- Status: aceita e implementada
- Data: 2026-08-16
- RF/RN/RNF relacionados: RF004, RN01-RN10, RN19, seção 2 (item "Alteração
  técnica aprovada para TFC II") e seção 2.1 do `CLAUDE.md`

## Contexto

Os documentos originais do TFC (`TFC1.pdf`) descreviam a coleta estruturada
inicial do cliente via automação do WhatsApp Web (navegador). Essa abordagem
não é oficial, depende de sessão de navegador persistente, é frágil a
mudanças de layout da Meta e pode violar os termos de uso do WhatsApp.

A seção 2 do `CLAUDE.md` já pré-aprova a substituição: "substituir mecanismo
antigo baseado em WhatsApp Web pela WhatsApp Cloud API oficial da Meta,
preservando integralmente RFs/RNs e o fluxo funcional".

## Decisão

1. Adotar exclusivamente a **WhatsApp Cloud API oficial da Meta** como
   mecanismo de envio/recebimento de mensagens (`backend/src/integrations/whatsapp/whatsappClient.ts`).
2. Nenhuma automação de navegador/WhatsApp Web é usada em nenhum ambiente
   (dev, teste ou produção) — proibido pela seção 2.1 do `CLAUDE.md`.
3. Recebimento de mensagens via webhook HTTPS público
   (`POST/GET /api/webhooks/whatsapp`), única rota do sistema sem JWT,
   protegida por verificação de assinatura HMAC-SHA256
   (`X-Hub-Signature-256`, `webhookSignature.ts`) e pelo handshake
   `hub.verify_token` no `GET` inicial.
4. Idempotência de entrega garantida por deduplicação de `wamid` em
   `whatsapp_webhook_evento` (RLS sem policies para `anon`/`authenticated`,
   só acessível via service role).
5. O fluxo funcional documentado (RN01-RN10: designer inicia atendimento,
   perguntas predefinidas RN08, registro de toda pergunta/resposta RN09,
   prazo de 2 dias RN05) permanece **idêntico** ao especificado — a mudança é
   estritamente o mecanismo de transporte da mensagem.
6. Ambiente de teste: número de teste gratuito da Meta (Fase 16), sem custo.

## Consequências

- Exige App Meta configurado (App ID/Secret, número de telefone, token de
  acesso, verify token) — dependência externa registrada como
  `BLOCKED_EXTERNAL`/`BLOCKED_EXTERNAL_META` sempre que a credencial estiver
  ausente, inválida ou o template de mensagem não estiver aprovado pela
  Meta; o restante do sistema continua funcionando e sendo desenvolvido
  independentemente desse bloqueio.
- Template de mensagem para iniciar conversa (`RF004`/RN03) precisa de
  aprovação prévia da Meta Business — item fora do controle do código,
  acompanhado como pendência externa no `docs/evidencias/CONTROLE_EXECUCAO.md`.
- Nenhum novo RF/RN foi criado; nenhum ator, estado ou tela foi adicionado.

## Alternativas rejeitadas

- Manter automação de WhatsApp Web (Selenium/Puppeteer/similar): rejeitado
  por violar a stack congelada (seção 2.1) e por ser tecnicamente frágil e
  não oficial.
- Usar um provedor terceirizado pago (ex.: Twilio) sobre o WhatsApp:
  rejeitado por gerar custo, proibido pela seção 2.1 sem decisão formal.
