-- DesignHub — usuario / designer / administrador
-- RF: RF001, RF002, RF015. RN: RN43-RN51. RNF: RNF007.
-- id_usuario é uuid e FK para auth.users (ver ADR 0001). senha_hash é
-- delegado ao Supabase Auth e não existe como coluna física nesta tabela.

create table public.usuario (
  id_usuario uuid primary key references auth.users (id) on delete cascade,
  nome_completo text not null check (char_length(btrim(nome_completo)) > 0),
  email extensions.citext not null unique,
  perfil text not null check (perfil in ('designer', 'administrador')),
  status text not null default 'ativo' check (status in ('ativo', 'inativo')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.usuario is
  'RF002/RNF007. senha_hash é gerenciado por auth.users (Supabase Auth) e nunca duplicado aqui — ver docs/decisions/0001-supabase-auth-vs-der.md.';

create trigger usuario_set_updated_at
  before update on public.usuario
  for each row
  execute function public.set_updated_at();

create table public.designer (
  id_usuario uuid primary key references public.usuario (id_usuario) on delete cascade,
  whatsapp text,
  bloqueado boolean not null default false,
  status_operacional text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column public.designer.bloqueado is
  'RF006/RN12: true quando há solicitação vencida sem primeira versão nem cancelamento.';

create trigger designer_set_updated_at
  before update on public.designer
  for each row
  execute function public.set_updated_at();

create table public.administrador (
  id_usuario uuid primary key references public.usuario (id_usuario) on delete cascade,
  created_at timestamptz not null default now()
);

create index usuario_perfil_idx on public.usuario (perfil);
