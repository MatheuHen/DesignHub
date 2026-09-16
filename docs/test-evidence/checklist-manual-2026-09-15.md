# Checklist manual — item 8.6 (novo) + regressão auditoria 14-15/09

Contexto: Fase 17 fechada, 16 RFs `IMPLEMENTADO_E2E_REAL` (ver
`docs/rastreabilidade/MATRIZ_RASTREABILIDADE_DESIGNHUB.csv`). Os itens abaixo
são o que ficou sem clique manual do usuário até agora — item 1 é
funcionalidade recém-ativada em produção; itens 2-7 são regressão dos fixes
da auditoria 14-15/09/2026. Marcar `OK`, `FALHOU` (descrever) ou `N/A`.

Status do template pendente (referência): `designhub_publicacao_concluida`
segue `PENDING` na Meta em 2026-09-15 (checagem via Graph API) — não faz
parte deste checklist, RF014/item 9.2-9.4 permanece `BLOCKED_EXTERNAL_WHATSAPP_PUBLICACAO`
até aprovação. Ver `docs/decisions/meta-whatsapp-templates-business-initiated.md`.

## 1. Alerta WhatsApp ao designer — cliente cancela agendamento (RF012/RF013, item 8.6)

- [ ] Login como designer; solicitação existente com status `Aprovado`.
- [ ] Criar agendamento com data/hora ≥ 3h no futuro (RF012).
- [ ] Pelo link de avaliação do cliente (ou tela correspondente), cancelar o
      agendamento com ≥ 3h de antecedência.
- [ ] Confirmar que o designer responsável recebe WhatsApp usando o template
      `agendamento_cancelado_cliente`, citando nome do cliente e tema da arte.
- [ ] Confirmar no histórico da solicitação o registro do cancelamento
      (auditoria RN47/RF013).
- [ ] Repetir o cancelamento com < 3h de antecedência → deve **rejeitar**
      (RF013), sem alterar status e sem enviar alerta.

## 2. Token do Instagram cifrado em repouso

- [ ] Reconectar (ou conectar) o Instagram de um cliente de teste pela tela
      de Clientes.
- [ ] Confirmar que a publicação automática (agendada ou imediata) ainda
      funciona normalmente após a reconexão.

## 3. Corrida de mensagens WhatsApp concorrentes (RN09)

- [ ] Enviar 2 respostas do cliente quase simultâneas no atendimento
      estruturado (ex.: responder rápido duas perguntas seguidas).
- [ ] Confirmar que nenhuma resposta foi perdida nem duplicada em
      `resposta_cliente`.

## 4. Idempotência de webhook (Instagram/WhatsApp)

- [ ] Reenviar (ou forçar reentrega) o mesmo evento de webhook já processado.
- [ ] Confirmar que não duplica publicação, atendimento nem histórico.

## 5. Rate limit

- [ ] Exercitar um endpoint sensível (ex.: login) acima do limite configurado.
- [ ] Confirmar resposta de limite (429 ou equivalente) sem vazar detalhe
      interno.

## 6. Troca de senha

- [ ] Como Designer ou Administrador, trocar a própria senha.
- [ ] Confirmar sucesso e novo login funcionando; nenhuma mensagem de erro
      interna exposta em caso de senha atual incorreta.

## 7. Ownership entre designers

- [ ] Como Designer A, tentar acessar diretamente pela URL uma solicitação
      pertencente ao Designer B.
- [ ] Confirmar bloqueio (403/redirecionamento seguro), sem exposição de
      dados do Designer B.

## 8. Filtro de data da listagem de solicitações (America/Sao_Paulo)

- [ ] Filtrar solicitações por uma data específica próxima da virada do dia
      (ex.: 23h-01h local).
- [ ] Confirmar que o resultado respeita o fuso `America/Sao_Paulo`, sem
      itens do dia anterior/seguinte por erro de fuso.

---

**Resultado consolidado:** preencher após execução —
OK: __ / FALHOU: __ / N/A: __.
Se algum item `FALHOU`, registrar aqui a descrição e abrir correção conforme
severidade (CLAUDE.md seção 3.5) antes de considerar a rodada concluída.
