-- DesignHub — observação complementar do cadastro de cliente
-- RF: RF003. RN: RN07.
-- Campo opcional, sem alterar o questionário do atendimento (RF004) nem
-- qualquer outro requisito. Preserva dados existentes (coluna nullable).

alter table public.cliente
  add column observacao text;

alter table public.cliente
  add constraint cliente_observacao_length_check
  check (observacao is null or char_length(observacao) <= 1000);

comment on column public.cliente.observacao is
  'RF003: observação opcional do cadastro do cliente, distinta das respostas do atendimento (RF004).';
