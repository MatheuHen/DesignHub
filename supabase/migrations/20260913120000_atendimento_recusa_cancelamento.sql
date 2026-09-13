-- DesignHub — correções 13/09/2026, itens 3.1/3.3 (RF004/RN08)
-- Amplia (ADITIVO) os status de atendimento para cobrir:
--   'recusado'              — cliente respondeu "não" à confirmação inicial
--                             (item 3.1): não avança para as demais
--                             perguntas nem cria solicitação.
--   'aguardando_cancelamento' — cliente pediu cancelamento explícito
--                             (item 3.3): aguarda confirmação antes de
--                             efetivar, para evitar cancelamento acidental.
--   'cancelado'             — cancelamento confirmado pelo cliente.
-- Não remove nem renomeia nenhum status existente; RF004/RN08 e a máquina
-- de estados de `solicitacao` (RF011) permanecem inalterados — este é um
-- controle interno do atendimento WhatsApp, não um dos 7 estados oficiais
-- de `solicitacao` (RN39).

alter table public.atendimento drop constraint atendimento_status_check;

alter table public.atendimento add constraint atendimento_status_check check (
  status in ('em_andamento', 'concluido', 'expirado', 'recusado', 'aguardando_cancelamento', 'cancelado')
);

-- 'aguardando_cancelamento' também é um atendimento "ativo" para efeito de
-- RN04 (não duplicar questionário) — o índice único parcial precisa cobrir
-- os dois status para continuar impedindo dois atendimentos simultâneos
-- para o mesmo cliente.
drop index public.atendimento_ativo_unico_idx;

create unique index atendimento_ativo_unico_idx on public.atendimento (id_cliente)
  where status in ('em_andamento', 'aguardando_cancelamento');
