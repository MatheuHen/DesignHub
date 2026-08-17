-- DesignHub — historico_solicitacao
-- RF: RF011, RF016. RN: RN13, RN14, RN41, RN48.
-- Escrito pelo serviço de transição de estados (Fase 10), na mesma transação
-- que altera solicitacao.status, para garantir rastreabilidade (Gate H/RN48).

create table public.historico_solicitacao (
  id_historico bigint generated always as identity primary key,
  id_solicitacao bigint not null references public.solicitacao (id_solicitacao) on delete restrict,
  id_usuario uuid references public.usuario (id_usuario) on delete set null,
  acao text not null check (char_length(btrim(acao)) > 0),
  status_anterior text check (
    status_anterior is null or status_anterior in (
      'Em produção', 'Enviado para avaliação', 'Ajustes', 'Aprovado',
      'Cancelado', 'Agendado', 'Publicado'
    )
  ),
  status_novo text check (
    status_novo is null or status_novo in (
      'Em produção', 'Enviado para avaliação', 'Ajustes', 'Aprovado',
      'Cancelado', 'Agendado', 'Publicado'
    )
  ),
  data_hora timestamptz not null default now()
);

comment on column public.historico_solicitacao.id_usuario is
  'Nulo quando a transição é executada por Serviço Automático (RF006/RF011/RF014), nunca por ausência de auditoria.';
comment on column public.historico_solicitacao.acao is
  'RF016/RN48: o DER não reserva colunas próprias para designer_anterior/designer_novo, então uma reatribuição (que normalmente não muda status_anterior/status_novo) deve descrever ambos os designers neste texto livre, ex.: "Reatribuído de <designer A> para <designer B>".';

create index historico_solicitacao_id_solicitacao_idx on public.historico_solicitacao (id_solicitacao);
create index historico_solicitacao_data_hora_idx on public.historico_solicitacao (data_hora);

-- RN48: histórico não pode ser apagado/reescrito por usuário comum (nem pelo backend
-- fora do fluxo de auditoria). Sem policy de update/delete para authenticated/anon:
-- apenas service_role (usado pelo backend após autorização) pode escrever, e mesmo
-- assim apenas via INSERT — nunca UPDATE/DELETE nesta tabela pela aplicação.
revoke update, delete on public.historico_solicitacao from authenticated, anon;
