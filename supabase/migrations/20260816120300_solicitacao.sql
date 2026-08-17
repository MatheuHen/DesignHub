-- DesignHub — solicitacao
-- RF: RF005, RF006, RF011. RN: RN11, RN12, RN39-RN45.

create table public.solicitacao (
  id_solicitacao bigint generated always as identity primary key,
  id_cliente bigint not null references public.cliente (id_cliente) on delete restrict,
  id_designer uuid not null references public.designer (id_usuario) on delete restrict,
  tema text,
  descricao text,
  cores text,
  observacoes text,
  status text not null default 'Em produção' check (
    status in (
      'Em produção',
      'Enviado para avaliação',
      'Ajustes',
      'Aprovado',
      'Cancelado',
      'Agendado',
      'Publicado'
    )
  ),
  data_criacao timestamptz not null default now(),
  prazo_primeira_versao timestamptz generated always as (data_criacao + interval '5 days') stored,
  updated_at timestamptz not null default now()
);

comment on table public.solicitacao is
  'RN39: os 7 status listados são os únicos válidos. RN11: prazo_primeira_versao é sempre data_criacao + 5 dias.';

create trigger solicitacao_set_updated_at
  before update on public.solicitacao
  for each row
  execute function public.set_updated_at();

create index solicitacao_id_cliente_idx on public.solicitacao (id_cliente);
create index solicitacao_id_designer_idx on public.solicitacao (id_designer);
create index solicitacao_status_idx on public.solicitacao (status);
create index solicitacao_data_criacao_idx on public.solicitacao (data_criacao);
-- RF006: localizar rapidamente solicitações vencidas sem primeira versão.
create index solicitacao_prazo_vencido_idx on public.solicitacao (prazo_primeira_versao)
  where status = 'Em produção';
