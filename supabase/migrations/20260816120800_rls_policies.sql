-- DesignHub — RLS e policies
-- RNF007 + seção 12.1/12.4 do CLAUDE.md.
--
-- Modelo adotado: toda escrita de negócio acontece via API REST do backend,
-- que valida perfil/tenant/ownership no servidor e persiste usando a chave
-- service role (que ignora RLS por padrão no Supabase). RLS aqui é a
-- segunda camada de defesa e o único caminho para leitura direta via
-- Supabase (chave publicável): somente SELECT, restrito por ownership ou
-- perfil administrador. Nenhuma policy de INSERT/UPDATE/DELETE é concedida a
-- 'authenticated'/'anon' nas tabelas de negócio — isso é intencional.
--
-- RN49: designer só visualiza globalmente onde a tela exigir (ex.: dashboards
-- agregados na Fase 13); por padrão aqui a leitura é restrita ao próprio
-- designer. Ampliações pontuais devem ser feitas com views dedicadas, nunca
-- afrouxando esta policy base.

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.usuario u
    where u.id_usuario = auth.uid()
      and u.perfil = 'administrador'
      and u.status = 'ativo'
  );
$$;

grant execute on function public.is_admin() to authenticated;

alter table public.usuario enable row level security;
alter table public.designer enable row level security;
alter table public.administrador enable row level security;
alter table public.cliente enable row level security;
alter table public.solicitacao enable row level security;
alter table public.atendimento enable row level security;
alter table public.resposta_cliente enable row level security;
alter table public.versao_arte enable row level security;
alter table public.avaliacao enable row level security;
alter table public.ajuste enable row level security;
alter table public.agendamento_publicacao enable row level security;
alter table public.publicacao enable row level security;
alter table public.historico_solicitacao enable row level security;

create policy usuario_select_own_or_admin on public.usuario
  for select to authenticated
  using (id_usuario = auth.uid() or public.is_admin());

create policy designer_select_own_or_admin on public.designer
  for select to authenticated
  using (id_usuario = auth.uid() or public.is_admin());

create policy administrador_select_own_or_admin on public.administrador
  for select to authenticated
  using (id_usuario = auth.uid() or public.is_admin());

create policy cliente_select_owner_or_admin on public.cliente
  for select to authenticated
  using (id_designer = auth.uid() or public.is_admin());

create policy solicitacao_select_owner_or_admin on public.solicitacao
  for select to authenticated
  using (id_designer = auth.uid() or public.is_admin());

create policy atendimento_select_owner_or_admin on public.atendimento
  for select to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.solicitacao s
      where s.id_solicitacao = atendimento.id_solicitacao
        and s.id_designer = auth.uid()
    )
    or exists (
      select 1 from public.cliente c
      where c.id_cliente = atendimento.id_cliente
        and c.id_designer = auth.uid()
    )
  );

create policy resposta_cliente_select_owner_or_admin on public.resposta_cliente
  for select to authenticated
  using (
    public.is_admin()
    or exists (
      select 1
      from public.atendimento a
      join public.cliente c on c.id_cliente = a.id_cliente
      where a.id_atendimento = resposta_cliente.id_atendimento
        and c.id_designer = auth.uid()
    )
  );

create policy versao_arte_select_owner_or_admin on public.versao_arte
  for select to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.solicitacao s
      where s.id_solicitacao = versao_arte.id_solicitacao
        and s.id_designer = auth.uid()
    )
  );

create policy avaliacao_select_owner_or_admin on public.avaliacao
  for select to authenticated
  using (
    public.is_admin()
    or exists (
      select 1
      from public.versao_arte v
      join public.solicitacao s on s.id_solicitacao = v.id_solicitacao
      where v.id_versao = avaliacao.id_versao
        and s.id_designer = auth.uid()
    )
  );

create policy ajuste_select_owner_or_admin on public.ajuste
  for select to authenticated
  using (
    public.is_admin()
    or exists (
      select 1
      from public.avaliacao av
      join public.versao_arte v on v.id_versao = av.id_versao
      join public.solicitacao s on s.id_solicitacao = v.id_solicitacao
      where av.id_avaliacao = ajuste.id_avaliacao
        and s.id_designer = auth.uid()
    )
  );

create policy agendamento_select_owner_or_admin on public.agendamento_publicacao
  for select to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.solicitacao s
      where s.id_solicitacao = agendamento_publicacao.id_solicitacao
        and s.id_designer = auth.uid()
    )
  );

create policy publicacao_select_owner_or_admin on public.publicacao
  for select to authenticated
  using (
    public.is_admin()
    or exists (
      select 1
      from public.agendamento_publicacao ap
      join public.solicitacao s on s.id_solicitacao = ap.id_solicitacao
      where ap.id_agendamento = publicacao.id_agendamento
        and s.id_designer = auth.uid()
    )
  );

create policy historico_select_owner_or_admin on public.historico_solicitacao
  for select to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.solicitacao s
      where s.id_solicitacao = historico_solicitacao.id_solicitacao
        and s.id_designer = auth.uid()
    )
  );
