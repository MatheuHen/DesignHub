-- DesignHub — backfill de normalização do WhatsApp existente
-- RF: RF003. RN: RN07. Item 2.2 (correções): cadastros feitos antes da
-- normalização podem ter máscara ("(64) 98403-5274"); este backfill
-- reescreve para somente dígitos, igual ao formato gravado a partir de agora,
-- evitando duplicidade aparente só por diferença de formatação. Não remove
-- nem perde nenhum dado — apenas reescreve o mesmo número sem máscara.

update public.cliente
set whatsapp = regexp_replace(whatsapp, '\D', '', 'g')
where whatsapp ~ '\D';
