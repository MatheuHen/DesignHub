/**
 * Item 8 (rodada correções): timezone oficial do sistema para agendamento é
 * America/Sao_Paulo (mesma referência já usada nas RPCs `create_agendamento`/
 * `create_agendamento_cliente`, seção "Fase 11" do roadmap). Esta é só uma
 * validação de UX no cliente — o backend permanece a fonte de verdade e
 * revalida com o mesmo timezone.
 */
const SAO_PAULO_TIME_ZONE = 'America/Sao_Paulo';

function formatPart(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): string {
  return parts.find((part) => part.type === type)?.value ?? '00';
}

/** Data (AAAA-MM-DD) e horário (HH:MM) atuais em America/Sao_Paulo. */
export function getSaoPauloNow(): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: SAO_PAULO_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date());

  return {
    date: `${formatPart(parts, 'year')}-${formatPart(parts, 'month')}-${formatPart(parts, 'day')}`,
    time: `${formatPart(parts, 'hour')}:${formatPart(parts, 'minute')}`,
  };
}

/** `true` quando `data` (AAAA-MM-DD) + `horario` (HH:MM) já ficou no passado em America/Sao_Paulo. */
export function isDataHorarioPassadoSaoPaulo(data: string, horario: string): boolean {
  const agora = getSaoPauloNow();
  if (data !== agora.date) return data < agora.date;
  return horario.slice(0, 5) <= agora.time;
}
