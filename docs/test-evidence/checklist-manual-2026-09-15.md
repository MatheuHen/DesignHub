# Checklist manual — item 8.6 (novo) + regressão auditoria 14-15/09

Contexto: Fase 17 fechada, 16 RFs `IMPLEMENTADO_E2E_REAL` (ver
`docs/rastreabilidade/MATRIZ_RASTREABILIDADE_DESIGNHUB.csv`). Os itens abaixo
são o que ficou sem clique manual do usuário até agora — item 1 é
funcionalidade recém-ativada em produção; itens 2-7 são regressão dos fixes
da auditoria 14-15/09/2026. Marcar `OK`, `FALHOU` (descrever) ou `N/A`.

Status do template (referência, atualizado): `designhub_publicacao_concluida`
foi aprovado (`UTILITY`) em 2026-09-16 e ativado em produção — não fazia
parte deste checklist. Ver
`docs/decisions/meta-whatsapp-templates-business-initiated.md`.

## 1. Alerta WhatsApp ao designer — cliente cancela agendamento (RF012/RF013, item 8.6)

- [x] Login como designer; solicitação existente com status `Aprovado`.
- [x] Criar agendamento com data/hora ≥ 3h no futuro (RF012).
- [x] Pelo link de avaliação do cliente (ou tela correspondente), cancelar o
      agendamento com ≥ 3h de antecedência.
- [x] Confirmar que o designer responsável recebe WhatsApp usando o template
      `agendamento_cancelado_cliente`, citando nome do cliente e tema da arte.
- [x] Confirmar no histórico da solicitação o registro do cancelamento
      (auditoria RN47/RF013).
- [x] Repetir o cancelamento com < 3h de antecedência → deve **rejeitar**
      (RF013), sem alterar status e sem enviar alerta.

## 2. Token do Instagram cifrado em repouso

- [x] Reconectar (ou conectar) o Instagram de um cliente de teste pela tela
      de Clientes.
- [x] Confirmar que a publicação automática (agendada ou imediata) ainda
      funciona normalmente após a reconexão.

## 3. Corrida de mensagens WhatsApp concorrentes (RN09)

- [x] Enviar 2 respostas do cliente quase simultâneas no atendimento
      estruturado (ex.: responder rápido duas perguntas seguidas).
- [x] Confirmar que nenhuma resposta foi perdida nem duplicada em
      `resposta_cliente`.

## 4. Idempotência de webhook (Instagram/WhatsApp)

- [x] Reenviar (ou forçar reentrega) o mesmo evento de webhook já processado.
- [x] Confirmar que não duplica publicação, atendimento nem histórico.

## 5. Rate limit

- [x] Exercitar um endpoint sensível (ex.: login) acima do limite configurado.
- [x] Confirmar resposta de limite (429 ou equivalente) sem vazar detalhe
      interno.

## 6. Troca de senha

- [x] Como Designer ou Administrador, trocar a própria senha.
- [x] Confirmar sucesso e novo login funcionando; nenhuma mensagem de erro
      interna exposta em caso de senha atual incorreta.

## 7. Ownership entre designers

- [x] Como Designer A, tentar acessar diretamente pela URL uma solicitação
      pertencente ao Designer B.
- [x] Confirmar bloqueio (403/redirecionamento seguro), sem exposição de
      dados do Designer B.

## 8. Filtro de data da listagem de solicitações (America/Sao_Paulo)

- [x] Filtrar solicitações por uma data específica próxima da virada do dia
      (ex.: 23h-01h local).
- [x] Confirmar que o resultado respeita o fuso `America/Sao_Paulo`, sem
      itens do dia anterior/seguinte por erro de fuso.

---

**Resultado consolidado (executado em 2026-09-16 pelo usuário):**
OK: 8 / FALHOU: 0 / N/A: 0. Todos os 8 itens confirmados sem regressão.
