-- DesignHub — cliente
-- RF: RF003. RN: RN06, RN07, RN44.

create table public.cliente (
  id_cliente bigint generated always as identity primary key,
  id_designer uuid not null references public.designer (id_usuario) on delete restrict,
  nome text not null check (char_length(btrim(nome)) > 0),
  whatsapp text not null check (char_length(btrim(whatsapp)) > 0),
  instagram text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column public.cliente.instagram is 'RF003/RN07: campo opcional.';

create trigger cliente_set_updated_at
  before update on public.cliente
  for each row
  execute function public.set_updated_at();

create index cliente_id_designer_idx on public.cliente (id_designer);
create index cliente_whatsapp_idx on public.cliente (whatsapp);
create index cliente_nome_idx on public.cliente (nome);
