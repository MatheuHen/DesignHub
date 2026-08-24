# ADR 0004 — Preferência de agendamento informada pelo cliente

- Status: aceita e implementada
- Data: 2026-08-24
- RF/RN/RNF relacionados: RN.22, RN.27, RN.28, RN.29, RF012 (`CLAUDE.md` seção 5/7)

## Contexto

Texto primário (`03_TFC1_CORRECOES_CONSOLIDADAS.pdf`, fonte de maior
precedência entre TFC1.pdf e derivados):

> RN.22 – Toda arte aprovada, o cliente informa se deseja o agendamento da
> publicação, podendo indicar data e horário desejados.
>
> RN.27 – Após a aprovação da arte pelo cliente, será permitido definir o
> agendamento da publicação no Instagram. Esse agendamento poderá ser
> realizado pelo designer, diretamente pela plataforma, ou pelo cliente,
> quando ele informar a data e o horário desejados. Em ambos os casos, a
> publicação somente poderá ser agendada após a aprovação da arte.

O sistema, até esta versão, não coletava essa informação: o cliente só
tinha Aprovar/Ajustes/Cancelar no link de avaliação, e o agendamento
(RF012) era criado exclusivamente pelo Designer sem nenhuma entrada do
cliente.

## Decisão

1. Ao **Aprovar**, o cliente pode opcionalmente informar `desejaAgendamento`
   (sim/não) e, se sim, `dataDesejada`/`horarioDesejado` — no mesmo
   formulário público `/avaliacao/:token`, sem criar tela nova.
2. Persistido em `public.avaliacao` (novas colunas `deseja_agendamento`,
   `data_desejada`, `horario_desejado`), porque RN.22 vincula a informação
   ao exato momento da aprovação — mesma linha que já registra a decisão
   do cliente sobre aquela versão. Só populado quando `decisao = 'Aprovado'`
   (CHECK garante `data_desejada`/`horario_desejado` preenchidos quando
   `deseja_agendamento = true`).
3. **O cliente não cria o `agendamento_publicacao` diretamente** — RF012
   continua exclusivo do Designer (`POST /:id/agendamento`,
   `requireProfile('designer')`). A preferência do cliente só fica visível
   para o Designer no detalhe da solicitação, pré-preenchendo o formulário
   de agendamento quando presente. Isso preserva RF012 e RN44/RN49 (escrita
   restrita ao Designer responsável) e evita que o Cliente ganhe uma ação
   de escrita fora do que os RFs atribuem a ele — RN.27/RN.29 preveem o
   cliente "informando" a preferência, não operando a tela do Designer.
4. Legenda **não** é solicitada ao cliente — RN.22/RN.28 não atribuem esse
   campo a ele; permanece exclusivamente com o Designer no agendamento real.

## Consequências

- `submit_avaliacao` (RPC) ganha 3 parâmetros opcionais
  (`p_deseja_agendamento`, `p_data_desejada`, `p_horario_desejado`);
  assinatura antiga removida (nenhum outro consumidor).
- Nenhum novo RF/RN/ator/estado foi criado; nenhuma tela nova — o mesmo
  link de avaliação e a mesma tela de detalhe do Designer.

## Alternativas rejeitadas

- Permitir que o cliente crie o `agendamento_publicacao` diretamente:
  rejeitado — RF012/RN44/RN49 atribuem essa escrita ao Designer; o texto
  de RN.27 ("poderá ser realizado pelo designer... ou pelo cliente, quando
  ele informar a data e o horário") é lido como "o cliente informa a
  preferência", não como acesso de escrita à tabela de agendamento.
