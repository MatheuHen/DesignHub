-- DesignHub — RF014/RN29/RN32: autorização do Instagram passa a ser POR
-- CLIENTE, nunca uma conta global compartilhada entre todos os clientes do
-- sistema (ver ADR 0005). Publicação automática só é elegível quando o
-- Cliente dono da solicitação concedeu, ele mesmo, acesso à própria conta
-- profissional do Instagram via OAuth oficial da Meta (Instagram API with
-- Instagram Login) — nunca com o token/conta de outro cliente nem com uma
-- conta de teste genérica.
--
-- Duas tabelas de infraestrutura técnica (não são entidades novas do DER —
-- mesmo raciocínio já aplicado a `whatsapp_webhook_evento`/
-- `avaliacao_link_token`): a conexão em si, e o estado efêmero do
-- handshake OAuth (equivalente ao "state" de CSRF do fluxo OAuth2).

create table public.cliente_instagram_conexao (
  id_cliente bigint primary key references public.cliente (id_cliente) on delete cascade,
  instagram_user_id text not null,
  access_token text not null,
  token_expira_em timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.cliente_instagram_conexao is
  'RF014/ADR 0005: token de acesso Instagram (Instagram Login for Business) autorizado pelo próprio Cliente, nunca compartilhado entre clientes.';

alter table public.cliente_instagram_conexao enable row level security;
-- Sem policies para anon/authenticated (mesmo padrão de whatsapp_webhook_evento/
-- avaliacao_link_token): toda leitura/escrita passa pelo backend via service_role,
-- nunca diretamente pelo navegador — o access_token nunca pode ser lido pelo cliente.

create table public.instagram_oauth_state (
  id_state bigint generated always as identity primary key,
  state_hash text not null unique,
  id_cliente bigint not null references public.cliente (id_cliente) on delete cascade,
  id_designer uuid not null references public.designer (id_usuario) on delete cascade,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

comment on table public.instagram_oauth_state is
  'RF014/ADR 0005: estado efêmero (CSRF) do handshake OAuth do Instagram — vincula o "code" retornado pela Meta ao Cliente/Designer que iniciaram a autorização. Token opaco, só o hash é armazenado (mesmo padrão de avaliacao_link_token).';

create index instagram_oauth_state_expires_at_idx on public.instagram_oauth_state (expires_at);

alter table public.instagram_oauth_state enable row level security;
-- Sem policies para anon/authenticated: o callback público do OAuth (rota sem
-- sessão de usuário, chamada pelo redirect do instagram.com) só é resolvido
-- pelo backend via service_role, nunca lido diretamente pelo navegador.
