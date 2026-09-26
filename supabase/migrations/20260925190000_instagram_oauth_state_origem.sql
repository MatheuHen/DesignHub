-- DesignHub — rodada final (item 12.2/13.3): o callback de OAuth do
-- Instagram hoje sempre redireciona para `/designer/clientes`, mesmo quando
-- quem abriu o link foi o CLIENTE (fluxo "enviar link ao cliente" via
-- WhatsApp, item 13.3), nunca o designer autenticado. Isso faz o navegador
-- do cliente cair numa rota protegida do designer (tela de login, na
-- prática) em vez de uma página pública simples de sucesso/erro.
--
-- `origem` distingue os dois pontos de entrada já existentes
-- (`gerarAutorizacaoInstagramUrl` = designer; `enviarLinkConexaoInstagram` =
-- cliente_link) para o callback escolher o destino correto sem inventar
-- nenhuma regra de negócio nova — só corrige o redirect.
alter table public.instagram_oauth_state
  add column origem text not null default 'designer'
  constraint instagram_oauth_state_origem_check check (origem in ('designer', 'cliente_link'));

alter table public.instagram_oauth_state alter column origem drop default;
