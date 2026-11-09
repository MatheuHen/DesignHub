import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getHorarioMinimoSaoPaulo,
  getSaoPauloNow,
  isDataHorarioPassadoSaoPaulo,
  MARGEM_MINIMA_AGENDAMENTO_MINUTOS,
} from './saoPauloDate';

describe('isDataHorarioPassadoSaoPaulo (item 8 — rodada correções Instagram)', () => {
  it('considera passado uma data muito antiga', () => {
    expect(isDataHorarioPassadoSaoPaulo('2000-01-01', '10:00')).toBe(true);
  });

  it('considera futuro uma data muito distante', () => {
    expect(isDataHorarioPassadoSaoPaulo('2099-12-31', '23:59')).toBe(false);
  });
});

/**
 * Regressão da falha real em produção (solicitação 70, 09/11/2026): o cliente
 * aprovou escolhendo o minuto seguinte, a validação de minuto aprovou, e a RPC
 * — que compara com `now()` em segundos — recusou o agendamento por já ser
 * passado. A aprovação valia, mas o agendamento automático não acontecia.
 */
describe('margem mínima do agendamento (corrida de 1 minuto)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  /** Fixa o relógio num horário conhecido de São Paulo (UTC-3). */
  function fixarAgoraSaoPaulo(data: string, horario: string, segundos = 30) {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(`${data}T${horario}:${String(segundos).padStart(2, '0')}-03:00`));
  }

  it('recusa o minuto seguinte, que expiraria durante o envio', () => {
    fixarAgoraSaoPaulo('2026-11-09', '10:25', 59);
    expect(isDataHorarioPassadoSaoPaulo('2026-11-09', '10:26')).toBe(true);
  });

  it('recusa o minuto atual', () => {
    fixarAgoraSaoPaulo('2026-11-09', '10:25');
    expect(isDataHorarioPassadoSaoPaulo('2026-11-09', '10:25')).toBe(true);
  });

  it('aceita a partir da margem mínima', () => {
    fixarAgoraSaoPaulo('2026-11-09', '10:25');
    expect(isDataHorarioPassadoSaoPaulo('2026-11-09', '10:27')).toBe(false);
    expect(MARGEM_MINIMA_AGENDAMENTO_MINUTOS).toBe(2);
  });

  it('aceita qualquer horário em um dia futuro', () => {
    fixarAgoraSaoPaulo('2026-11-09', '23:58');
    expect(isDataHorarioPassadoSaoPaulo('2026-11-10', '00:01')).toBe(false);
  });

  it('getHorarioMinimoSaoPaulo limita só o dia de hoje', () => {
    fixarAgoraSaoPaulo('2026-11-09', '10:25');
    const hoje = getSaoPauloNow().date;
    expect(getHorarioMinimoSaoPaulo(hoje)).toBe('10:27');
    expect(getHorarioMinimoSaoPaulo('2026-11-10')).toBeUndefined();
  });

  it('getHorarioMinimoSaoPaulo não devolve horário inválido na virada do dia', () => {
    fixarAgoraSaoPaulo('2026-11-09', '23:59');
    expect(getHorarioMinimoSaoPaulo(getSaoPauloNow().date)).toBeUndefined();
  });
});
