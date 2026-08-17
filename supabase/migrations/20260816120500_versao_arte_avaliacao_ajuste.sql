-- DesignHub — versao_arte / avaliacao / ajuste
-- RF: RF007, RF008, RF009, RF010. RN: RN17, RN18, RN20-RN26.

create table public.versao_arte (
  id_versao bigint generated always as identity primary key,
  id_solicitacao bigint not null references public.solicitacao (id_solicitacao) on delete restrict,
  numero_versao integer not null check (numero_versao > 0),
  arquivo_url text not null,
  formato text not null check (formato in ('PDF', 'JPG', 'PNG')),
  data_envio timestamptz not null default now(),
  observacoes text,
  unique (id_solicitacao, numero_versao)
);

comment on table public.versao_arte is 'RF008/RN17: V1, V2... sequenciais por solicitação. RN23: formatos aceitos.';

create index versao_arte_id_solicitacao_idx on public.versao_arte (id_solicitacao);

create table public.avaliacao (
  id_avaliacao bigint generated always as identity primary key,
  id_versao bigint not null references public.versao_arte (id_versao) on delete restrict,
  decisao text not null check (decisao in ('Aprovado', 'Ajustes', 'Cancelado')),
  motivo text,
  data_avaliacao timestamptz not null default now(),
  -- RF009: cada versão é avaliada uma única vez (proteção contra double-submit
  -- do link público de avaliação, que não é autenticado).
  unique (id_versao)
);

comment on table public.avaliacao is 'RF009: decisão do cliente sobre a versão em avaliação.';

create index avaliacao_id_versao_idx on public.avaliacao (id_versao);

create table public.ajuste (
  id_ajuste bigint generated always as identity primary key,
  id_avaliacao bigint not null references public.avaliacao (id_avaliacao) on delete cascade,
  descricao text not null check (char_length(btrim(descricao)) > 0),
  observacoes text,
  imagem_referencia_url text,
  created_at timestamptz not null default now()
);

comment on table public.ajuste is 'RF010/RN21: descrição obrigatória, referência opcional.';

create index ajuste_id_avaliacao_idx on public.ajuste (id_avaliacao);

-- RN20/RN24: um ajuste só é válido quando a avaliação associada decidiu
-- "Ajustes". CHECK não pode referenciar outra tabela, por isso o invariante
-- é aplicado via trigger.
create or replace function public.check_ajuste_avaliacao_decisao()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_decisao text;
begin
  select decisao into v_decisao
  from public.avaliacao
  where id_avaliacao = new.id_avaliacao;

  if v_decisao is distinct from 'Ajustes' then
    raise exception
      'ajuste só pode ser registrado para avaliação com decisao = Ajustes (id_avaliacao=%)',
      new.id_avaliacao
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger ajuste_requer_avaliacao_ajustes
  before insert or update on public.ajuste
  for each row
  execute function public.check_ajuste_avaliacao_decisao();
