-- DesignHub — rodada final (item 7/7.1): "link gerado" não é o mesmo que
-- "link enviado". Hoje o resultado do envio via WhatsApp só existe na
-- resposta HTTP daquela requisição (`GerarLinkAvaliacaoResult.whatsappNotified`)
-- — se o designer sair da tela e voltar depois, não há como saber se o
-- envio realmente aconteceu. Esta coluna persiste esse resultado no próprio
-- token gerado, para o histórico sobreviver a um reload/nova sessão.
--
-- Nullable e sem valor derivado de linhas existentes: tokens já gerados
-- antes desta coluna existir não têm como saber retroativamente se a
-- notificação foi aceita pela Meta — aparecem como "não confirmado" em vez
-- de inventar um valor.
alter table public.avaliacao_link_token
  add column whatsapp_notificado_em timestamptz;

comment on column public.avaliacao_link_token.whatsapp_notificado_em is
  'RF009/item 7.1: preenchido somente quando a WhatsApp Cloud API aceitou o envio da mensagem com o link — nunca marcado só porque o token foi gerado.';
