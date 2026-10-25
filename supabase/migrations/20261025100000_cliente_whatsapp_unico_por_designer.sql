-- DesignHub — WhatsApp único por designer (segunda camada contra TOCTOU)
-- RF003. Regra desta rodada: o mesmo WhatsApp não pode se repetir para o
-- mesmo designer, mas pode existir livremente em designers diferentes.
--
-- Pré-requisito já cumprido antes desta migration: os 4 pares antigos de
-- clientes duplicados dentro do mesmo designer (2/3, 4/6, 20/21, 14/36)
-- foram consolidados manualmente, preservando todo o histórico
-- (solicitação, atendimento, conexão/oauth do Instagram) no cliente
-- canônico antes da remoção do duplicado. A consulta de verificação
-- confirmou zero duplicidades por (id_designer, whatsapp normalizado)
-- antes de aplicar esta constraint.
--
-- `whatsapp` já é gravado só com dígitos desde a normalização do schema
-- Zod (backend/src/schemas/cliente.schemas.ts) e do backfill
-- (20261024100100_cliente_whatsapp_backfill_normalizado.sql), então a
-- UNIQUE abaixo compara exatamente o valor armazenado — não precisa
-- normalizar de novo na própria constraint.
--
-- Não altera RLS, Auth nem qualquer outra regra. A validação de
-- aplicação já existente (service) continua a primeira camada; esta
-- constraint é só a segunda camada contra condição de corrida (TOCTOU).

alter table public.cliente
  add constraint cliente_designer_whatsapp_unico unique (id_designer, whatsapp);
