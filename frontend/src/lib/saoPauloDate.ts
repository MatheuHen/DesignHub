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

/**
 * Margem mínima entre "agora" e o horário escolhido.
 *
 * CAUSA RAIZ da falha real em produção (solicitação 70, 09/11/2026:
 * "Data/horário do agendamento são obrigatórios e devem ser no futuro" logo
 * depois de o cliente aprovar): a comparação aqui tem resolução de MINUTO,
 * mas a RPC compara com `now()` em resolução de segundo. Escolher o minuto
 * seguinte passava nesta validação durante até 59 segundos e, quando o envio
 * chegava ao banco já dentro daquele minuto, virava passado e o agendamento
 * automático era recusado — o cliente aprovava achando que havia agendado.
 *
 * Dois minutos de margem fecham essa janela com folga para o envio (upload da
 * referência + RPC) sem mudar nenhuma regra de negócio: continua valendo
 * apenas "o horário precisa ser no futuro" (RN27/RN30).
 */
export const MARGEM_MINIMA_AGENDAMENTO_MINUTOS = 2;

function paraMinutosDoDia(horario: string): number {
  const [hora, minuto] = horario.slice(0, 5).split(':');
  return Number(hora) * 60 + Number(minuto);
}

/**
 * `true` quando `data` (AAAA-MM-DD) + `horario` (HH:MM) já passou em
 * America/Sao_Paulo ou está perto demais de agora para sobreviver ao envio
 * (ver `MARGEM_MINIMA_AGENDAMENTO_MINUTOS`).
 */
export function isDataHorarioPassadoSaoPaulo(data: string, horario: string): boolean {
  const agora = getSaoPauloNow();
  if (data !== agora.date) return data < agora.date;
  return paraMinutosDoDia(horario) < paraMinutosDoDia(agora.time) + MARGEM_MINIMA_AGENDAMENTO_MINUTOS;
}

/** Menor horário aceitável para HOJE (`min` do input time); `undefined` nos demais dias. */
export function getHorarioMinimoSaoPaulo(data: string): string | undefined {
  const agora = getSaoPauloNow();
  if (data !== agora.date) return undefined;
  const minutos = paraMinutosDoDia(agora.time) + MARGEM_MINIMA_AGENDAMENTO_MINUTOS;
  if (minutos >= 24 * 60) return undefined; // vira o dia: só com outra data
  const hora = String(Math.floor(minutos / 60)).padStart(2, '0');
  const minuto = String(minutos % 60).padStart(2, '0');
  return `${hora}:${minuto}`;
}
