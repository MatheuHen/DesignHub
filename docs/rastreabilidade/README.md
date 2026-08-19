# Matriz de rastreabilidade — legenda

Resolve a pendência registrada em `docs/evidencias/CONTROLE_EXECUCAO.md`
sobre a semântica da coluna `Status_Inicial`.

## Decisão

`Status_Inicial` **não é reescrita**: representa o estado da matriz no
momento em que ela foi criada (baseline documental, sempre `PENDENTE`) e
fica preservada como registro histórico.

O estado real e atual de cada RF é rastreado nas três colunas novas
(2026-08-17, Fase 15):

- **`Status_Atual`** — um dos valores abaixo.
- **`Evidencia_Real`** — o que foi de fato executado/validado e onde
  (sessão, mecanismo), não apenas o que o código permite.
- **`Bloqueio_Externo`** — motivo técnico externo que impede validação
  100% ao vivo, quando aplicável; vazio quando não há bloqueio.

## Valores de `Status_Atual`

- **`IMPLEMENTADO_E2E_REAL`** — código + testes unitários/integração
  (mocks) + validado ao vivo contra Supabase real (e, quando aplicável,
  contra o backend rodando de verdade), incluindo os casos negativos e de
  concorrência relevantes.
- **`IMPLEMENTADO_E2E_PARCIAL`** — parte do requisito validada ao vivo,
  parte ainda coberta só por testes unitários/integração (mocks). Ver
  `Evidencia_Real` para o detalhe de qual parte é qual.
- **`IMPLEMENTADO_TESTES_UNITARIOS`** — código completo, revisado
  (security/database reviewers, sem CRITICAL/HIGH) e coberto por testes
  unitários/integração com mocks, mas ainda não exercitado ao vivo contra
  banco/serviço real nesta fase.
- **`BLOQUEADO_EXTERNO_META`** — código+testes completos; validação ao
  vivo depende de credencial/autorização da Meta (WhatsApp Cloud API ou
  Instagram API) que ainda não foi exercitada por decisão do usuário
  (aguardando sinal de que WhatsApp/Instagram estão prontos).

## Registro de evidência

A validação ao vivo referida nesta matriz foi executada em 2026-08-17
(Fase 15) contra o projeto Supabase real do DesignHub, com dados de teste
sintéticos criados e depois removidos na mesma sessão (ver
`docs/evidencias/CONTROLE_EXECUCAO.md`, entradas "Fase 15"). Não há dados
de produção nem dados pessoais reais envolvidos.
