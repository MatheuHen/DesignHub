-- DesignHub — atendimento / resposta_cliente (RF004, coleta via WhatsApp)
-- RF: RF004. RN: RN02, RN03, RN05, RN08, RN09, RN10.

create table public.atendimento (
  id_atendimento bigint generated always as identity primary key,
  id_cliente bigint not null references public.cliente (id_cliente) on delete restrict,
  id_solicitacao bigint references public.solicitacao (id_solicitacao) on delete set null,
  data_inicio timestamptz not null default now(),
  data_fim timestamptz,
  status text not null default 'em_andamento' check (
    status in ('em_andamento', 'concluido', 'expirado')
  ),
  created_at timestamptz not null default now()
);

comment on table public.atendimento is
  'RN05: cliente tem até 2 dias para responder; status expirado indica encerramento sem resposta completa.';
comment on column public.atendimento.id_solicitacao is
  'Nulo até a solicitação ser efetivamente criada a partir do questionário concluído.';

create index atendimento_id_cliente_idx on public.atendimento (id_cliente);
create index atendimento_id_solicitacao_idx on public.atendimento (id_solicitacao);
create index atendimento_status_idx on public.atendimento (status);
-- RF004: "Se já houver solicitação aplicável, registrar interação sem duplicar
-- questionário indevidamente" — no máximo um atendimento em andamento por cliente.
create unique index atendimento_ativo_unico_idx on public.atendimento (id_cliente)
  where status = 'em_andamento';

create table public.resposta_cliente (
  id_resposta bigint generated always as identity primary key,
  id_atendimento bigint not null references public.atendimento (id_atendimento) on delete cascade,
  pergunta text not null,
  resposta text not null,
  data_hora timestamptz not null default now()
);

comment on table public.resposta_cliente is 'RN08/RN09: perguntas predefinidas e respostas do questionário estruturado.';

create index resposta_cliente_id_atendimento_idx on public.resposta_cliente (id_atendimento);
-- Seção 12.4: duas mensagens distintas do mesmo cliente processadas por
-- requisições concorrentes do webhook não podem gravar duas respostas para
-- a mesma pergunta do mesmo atendimento — a aplicação trata a violação
-- (23505) como "já respondida por outra requisição, nada a fazer".
create unique index resposta_cliente_atendimento_pergunta_idx
  on public.resposta_cliente (id_atendimento, pergunta);
