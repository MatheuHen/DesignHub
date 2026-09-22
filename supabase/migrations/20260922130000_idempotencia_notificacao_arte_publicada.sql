-- DesignHub — rodada correções 22/09/2026, item 14 (RF014/item 9.2-9.4):
-- teste manual do usuário reportou a mensagem "ARTE PUBLICADA!" chegando
-- duas vezes no mesmo horário. A auditoria confirmou que o caminho
-- automático (`registerPublicacaoSucesso`) e o manual já são protegidos por
-- pré-condição de status (só sucedem uma vez por agendamento), então não há
-- reprodução determinística de uma segunda publicação real — mas o envio do
-- AVISO em si não tinha nenhuma trava própria: se `notificarClientePublicacaoBestEffort`
-- fosse chamada mais de uma vez para a mesma publicação por qualquer motivo
-- (nova instância concorrente do job, retry de infraestrutura), nada
-- impedia um segundo envio idêntico. Esta migration fecha essa lacuna
-- diretamente no envio do aviso, sem depender apenas da idempotência da
-- publicação em si.

alter table public.publicacao
  add column notificado_arte_publicada_em timestamptz;

comment on column public.publicacao.notificado_arte_publicada_em is
  'Item 14 (rodada correções): marca quando o aviso automático "ARTE PUBLICADA!" foi enviado — reivindicado atomicamente antes do envio para nunca duplicar. O reenvio manual explícito ("Reenviar aviso ao cliente") ignora esta marca de propósito, mas também a atualiza.';
