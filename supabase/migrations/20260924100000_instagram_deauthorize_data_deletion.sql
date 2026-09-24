-- DesignHub — callbacks obrigatórios da Meta para o produto "Instagram API
-- with Instagram Login" (RF014/ADR 0005): Deauthorize Callback e Data
-- Deletion Request Callback. Sem eles, o App não passa na revisão da Meta.
--
-- Ambos identificam a conexão pelo `instagram_user_id` (o ID com escopo no
-- Instagram que o `signed_request` da Meta traz) — nunca por um id_cliente
-- vindo de fora, mesmo raciocínio de segurança já aplicado ao callback OAuth
-- normal (o `id_cliente` sempre vem de dado já persistido no nosso banco).
--
-- Nenhum dos dois apaga cliente, solicitação, arte ou histórico — só a
-- conexão/token da integração Instagram daquele Instagram user, exatamente
-- como pedido.

-- Índice de apoio: ambos os callbacks buscam a conexão por instagram_user_id
-- (consulta real, não especulativa).
create index if not exists cliente_instagram_conexao_instagram_user_id_idx
  on public.cliente_instagram_conexao (instagram_user_id);

-- Infraestrutura técnica do Data Deletion Request Callback (mesmo raciocínio
-- de whatsapp_webhook_evento/instagram_oauth_state: não é entidade do DER).
-- A exclusão da conexão acontece de forma síncrona na mesma requisição que
-- recebe o pedido da Meta, então `completed_at` já nasce preenchido — não há
-- processamento assíncrono para acompanhar depois.
create table public.instagram_data_deletion_request (
  id_deletion_request bigint generated always as identity primary key,
  confirmation_code text not null unique,
  instagram_user_id text not null,
  conexao_removida boolean not null,
  requested_at timestamptz not null default now(),
  completed_at timestamptz not null default now()
);

comment on table public.instagram_data_deletion_request is
  'RF014/ADR 0005: registro do Data Deletion Request Callback da Meta — permite responder ao endpoint de status com o confirmation_code emitido. Nunca contém token nem dado pessoal do cliente, só o instagram_user_id (identificador técnico da integração).';

alter table public.instagram_data_deletion_request enable row level security;
-- Sem policies para anon/authenticated: os dois callbacks são rotas públicas
-- chamadas pela Meta, resolvidas exclusivamente pelo backend via service_role.
