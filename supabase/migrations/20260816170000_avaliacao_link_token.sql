-- DesignHub — RF009: link de avaliação seguro (token opaco, escopado à
-- versão em avaliação, expirável e revogável — seção 12.1 do CLAUDE.md).
--
-- Esta tabela é infraestrutura de segurança para o mecanismo de link
-- público, não uma nova entidade de negócio do DER (seção 9): ela não
-- representa dado de domínio (tema, cores, decisão, ajuste...), apenas o
-- estado técnico de um token de acesso — mesmo raciocínio já aplicado a
-- `whatsapp_webhook_evento` (Fase 6, idempotência) e a `designer.bloqueado`
-- (Fase 2, cache derivado).
--
-- Só o hash SHA-256 do token é armazenado (nunca o valor bruto), mesmo
-- princípio de nunca persistir credencial em texto claro — se o banco
-- vazar, os hashes sozinhos não permitem reconstruir links utilizáveis.
create table public.avaliacao_link_token (
  id_token bigint generated always as identity primary key,
  id_versao bigint not null references public.versao_arte (id_versao) on delete restrict,
  token_hash text not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

comment on table public.avaliacao_link_token is
  'RF009/seção 12.1: token opaco (hash) do link público de avaliação. Escopado a uma versão específica, expirável e revogável.';

create index avaliacao_link_token_id_versao_idx on public.avaliacao_link_token (id_versao);

alter table public.avaliacao_link_token enable row level security;
-- Sem policies para authenticated/anon (mesmo padrão de `whatsapp_webhook_evento`):
-- toda leitura/escrita passa pelo backend via service_role. O link público
-- nunca consulta o Supabase diretamente — sempre pela API REST do backend.

-- RF009: gera (e revoga tokens anteriores não usados da mesma versão) um
-- novo token de avaliação para a versão atualmente aguardando avaliação.
-- Chamada pelo backend, autenticado como designer dono da solicitação
-- (ownership já checado na camada de aplicação antes desta chamada — esta
-- é a segunda camada, mesmo padrão já usado nas funções das Fases 4/6/7/8).
create or replace function public.generate_avaliacao_link_token(
  p_id_solicitacao bigint,
  p_id_designer uuid,
  p_token_hash text,
  p_expires_at timestamptz
)
returns table (id_versao bigint, numero_versao integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id_designer uuid;
  v_status text;
  v_id_versao bigint;
  v_numero_versao integer;
begin
  select s.id_designer, s.status
  into v_id_designer, v_status
  from public.solicitacao s
  where s.id_solicitacao = p_id_solicitacao
  for update;

  if v_id_designer is null or v_id_designer <> p_id_designer then
    raise exception 'solicitação % não encontrada', p_id_solicitacao using errcode = 'P0002';
  end if;

  if v_status <> 'Enviado para avaliação' then
    raise exception
      'solicitação % não está aguardando avaliação (status atual: %)', p_id_solicitacao, v_status
      using errcode = 'P0001';
  end if;

  select v.id_versao, v.numero_versao
  into v_id_versao, v_numero_versao
  from public.versao_arte v
  where v.id_solicitacao = p_id_solicitacao
  order by v.numero_versao desc
  limit 1;

  if v_id_versao is null then
    raise exception 'solicitação % não possui versão enviada', p_id_solicitacao using errcode = 'P0002';
  end if;

  update public.avaliacao_link_token
  set revoked_at = now()
  where id_versao = v_id_versao
    and used_at is null
    and revoked_at is null;

  insert into public.avaliacao_link_token (id_versao, token_hash, expires_at)
  values (v_id_versao, p_token_hash, p_expires_at);

  return query select v_id_versao, v_numero_versao;
end;
$$;

revoke all on function public.generate_avaliacao_link_token(bigint, uuid, text, timestamptz) from public;
revoke all on function public.generate_avaliacao_link_token(bigint, uuid, text, timestamptz) from anon, authenticated;
grant execute on function public.generate_avaliacao_link_token(bigint, uuid, text, timestamptz) to service_role;

-- RF009/RF010/RN20/RN21/RN24: registra a decisão do cliente (Aprovar/
-- Ajustes/Cancelar) de forma atômica. Chamada pelo backend a partir da
-- rota pública (sem autenticação de usuário — a única prova de autorização
-- é o próprio token), nunca diretamente pelo cliente do navegador.
create or replace function public.submit_avaliacao(
  p_token_hash text,
  p_decisao text,
  p_descricao_ajuste text,
  p_observacoes_ajuste text,
  p_imagem_referencia_path text
)
returns table (id_solicitacao bigint, status_novo text, numero_versao integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id_token bigint;
  v_id_versao bigint;
  v_expires_at timestamptz;
  v_revoked_at timestamptz;
  v_used_at timestamptz;
  v_id_solicitacao bigint;
  v_status text;
  v_numero_versao integer;
  v_id_avaliacao bigint;
  v_acao text;
begin
  -- Leitura sem lock só para descobrir a qual solicitação este token
  -- pertence — necessário para travar `solicitacao` ANTES do token
  -- (mesma ordem de `generate_avaliacao_link_token`, que trava
  -- `solicitacao` primeiro e só depois toca `avaliacao_link_token` ao
  -- revogar tokens antigos). Travar sempre nessa ordem evita deadlock
  -- entre um `generate_avaliacao_link_token` e um `submit_avaliacao`
  -- concorrentes para a mesma versão (Gate G). A validade do token em si
  -- só é decidida abaixo, sob lock — esta leitura inicial não é a fonte de
  -- verdade.
  select t.id_token, t.id_versao
  into v_id_token, v_id_versao
  from public.avaliacao_link_token t
  where t.token_hash = p_token_hash;

  if v_id_token is null then
    raise exception 'link de avaliação inválido' using errcode = 'P0002';
  end if;

  select v.id_solicitacao, v.numero_versao
  into v_id_solicitacao, v_numero_versao
  from public.versao_arte v
  where v.id_versao = v_id_versao;

  select s.status
  into v_status
  from public.solicitacao s
  where s.id_solicitacao = v_id_solicitacao
  for update;

  -- Só agora trava a linha do token (por PK, já sabido) e relê seu estado
  -- sob lock — os valores de `revoked_at`/`used_at`/`expires_at` lidos
  -- acima seriam stale; a decisão real usa sempre a releitura abaixo.
  select t.expires_at, t.revoked_at, t.used_at
  into v_expires_at, v_revoked_at, v_used_at
  from public.avaliacao_link_token t
  where t.id_token = v_id_token
  for update;

  -- Códigos distintos só para permitir uma mensagem amigável mais precisa
  -- no frontend (RF009 "tratado de modo seguro e amigável") — nenhum deles
  -- vaza informação sobre a solicitação/cliente para quem não possui o
  -- token (um token de 256 bits não é adivinhável por força bruta).
  if v_revoked_at is not null then
    raise exception 'link de avaliação inválido' using errcode = 'P0002';
  end if;

  if v_used_at is not null then
    raise exception 'link de avaliação já utilizado' using errcode = 'P0004';
  end if;

  if v_expires_at < now() then
    raise exception 'link de avaliação expirado' using errcode = 'P0003';
  end if;

  if v_status <> 'Enviado para avaliação' then
    raise exception
      'solicitação % não está mais aguardando avaliação (status atual: %)', v_id_solicitacao, v_status
      using errcode = 'P0001';
  end if;

  -- Validado explicitamente antes do insert para nunca deixar a CHECK
  -- constraint de `avaliacao`/`ajuste` ser a única barreira: um valor
  -- inválido cairia direto num erro Postgres cru (23514), vazando nome de
  -- tabela/constraint ao invés de um erro amigável (seção 12.6). Na
  -- prática `p_decisao` já chega validado pelo enum do Zod no backend —
  -- este é o backstop, não o caminho esperado.
  if p_decisao not in ('Aprovado', 'Ajustes', 'Cancelado') then
    raise exception 'decisão % inválida', p_decisao using errcode = 'P0001';
  end if;

  -- unique(id_versao) em avaliacao é o backstop final contra double-submit
  -- concorrente (além do lock em avaliacao_link_token acima).
  insert into public.avaliacao (id_versao, decisao)
  values (v_id_versao, p_decisao)
  returning id_avaliacao into v_id_avaliacao;

  if p_decisao = 'Ajustes' then
    insert into public.ajuste (id_avaliacao, descricao, observacoes, imagem_referencia_url)
    values (v_id_avaliacao, p_descricao_ajuste, p_observacoes_ajuste, p_imagem_referencia_path);
  end if;

  case p_decisao
    when 'Aprovado' then
      v_acao := 'Cliente aprovou a arte via link de avaliação (RF009)';
    when 'Ajustes' then
      v_acao := 'Cliente solicitou ajustes via link de avaliação (RF009/RF010)';
    when 'Cancelado' then
      v_acao := 'Cliente cancelou a solicitação via link de avaliação (RF009)';
  end case;

  update public.solicitacao
  set status = p_decisao
  where id_solicitacao = v_id_solicitacao;

  -- RF009 é decidido pelo cliente, que não é um `usuario` autenticado no
  -- sistema (só Designer/Administrador têm conta) — mesma convenção de
  -- id_usuario nulo já usada para transições sem usuário autenticado
  -- correspondente (Serviço Automático, Fase 6).
  insert into public.historico_solicitacao (id_solicitacao, id_usuario, acao, status_anterior, status_novo)
  values (v_id_solicitacao, null, v_acao, 'Enviado para avaliação', p_decisao);

  update public.avaliacao_link_token
  set used_at = now()
  where id_token = v_id_token;

  return query select v_id_solicitacao, p_decisao, v_numero_versao;
end;
$$;

revoke all on function public.submit_avaliacao(text, text, text, text, text) from public;
revoke all on function public.submit_avaliacao(text, text, text, text, text) from anon, authenticated;
grant execute on function public.submit_avaliacao(text, text, text, text, text) to service_role;
