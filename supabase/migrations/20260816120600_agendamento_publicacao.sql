-- DesignHub — agendamento_publicacao / publicacao
-- RF: RF012, RF013, RF014. RN: RN27-RN35, RN41.

create table public.agendamento_publicacao (
  id_agendamento bigint generated always as identity primary key,
  id_solicitacao bigint not null references public.solicitacao (id_solicitacao) on delete restrict,
  data_publicacao date not null,
  horario time not null,
  legenda text,
  status text not null default 'Agendado' check (status in ('Agendado', 'Cancelado', 'Publicado')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.agendamento_publicacao is
  'RF012/RN30: somente solicitação Aprovado pode ser agendada (validado na aplicação). RF013/RN31: cancelamento exige >= 3h de antecedência (validado na aplicação, pois depende de now()).';

create trigger agendamento_publicacao_set_updated_at
  before update on public.agendamento_publicacao
  for each row
  execute function public.set_updated_at();

create index agendamento_publicacao_id_solicitacao_idx on public.agendamento_publicacao (id_solicitacao);
create index agendamento_publicacao_status_idx on public.agendamento_publicacao (status);
create index agendamento_publicacao_data_horario_idx
  on public.agendamento_publicacao (data_publicacao, horario)
  where status = 'Agendado';
-- RF012/RN30: no máximo um agendamento ativo por solicitação (evita corrida
-- de dois agendamentos concorrentes para a mesma solicitação aprovada).
create unique index agendamento_ativo_unico_idx on public.agendamento_publicacao (id_solicitacao)
  where status = 'Agendado';

create table public.publicacao (
  id_publicacao bigint generated always as identity primary key,
  id_agendamento bigint not null references public.agendamento_publicacao (id_agendamento) on delete restrict,
  id_versao bigint not null references public.versao_arte (id_versao) on delete restrict,
  data_publicada timestamptz,
  tipo text not null check (tipo in ('automatica', 'manual')),
  status text not null check (status in ('sucesso', 'falha')),
  created_at timestamptz not null default now(),
  -- RN35: log de publicação deve conter data/hora; só faz sentido ausente
  -- quando a tentativa falhou.
  constraint publicacao_sucesso_tem_data check (status <> 'sucesso' or data_publicada is not null)
);

comment on table public.publicacao is
  'RF014/RN29/RN33-RN35: registro de cada tentativa de publicação (automática Instagram API oficial ou manual).';

create index publicacao_id_agendamento_idx on public.publicacao (id_agendamento);
create index publicacao_id_versao_idx on public.publicacao (id_versao);
-- Seção 12.4/Gate G: publicação idempotente — no máximo um registro de
-- sucesso por agendamento, mesmo que o job/webhook reexecute.
create unique index publicacao_unica_sucesso_idx on public.publicacao (id_agendamento)
  where status = 'sucesso';
