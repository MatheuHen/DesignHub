import { describe, expect, it } from 'vitest';
import { startOfDaySaoPaulo, startOfNextDaySaoPaulo } from './timezone.js';

/**
 * Item 10 (correções 13/09/2026): filtro de data em intervalo 09–10 não pode
 * incluir nada do dia 08 nem excluir o fim do dia 10, em horário de São
 * Paulo — os quatro casos de fronteira abaixo são exatamente os do escopo.
 */
describe('startOfDaySaoPaulo/startOfNextDaySaoPaulo (item 10 — fronteiras de fuso horário)', () => {
  const inicio = startOfDaySaoPaulo('2026-09-09');
  const fimExclusivo = startOfNextDaySaoPaulo('2026-09-10');

  function isDentroDoIntervalo(dataHoraSaoPauloOffset: string): boolean {
    const instante = new Date(dataHoraSaoPauloOffset).getTime();
    return instante >= new Date(inicio).getTime() && instante < new Date(fimExclusivo).getTime();
  }

  it('08/09 23:59 (São Paulo) fica FORA do intervalo [09, 10]', () => {
    expect(isDentroDoIntervalo('2026-09-08T23:59:00-03:00')).toBe(false);
  });

  it('09/09 00:00 (São Paulo) fica DENTRO do intervalo [09, 10]', () => {
    expect(isDentroDoIntervalo('2026-09-09T00:00:00-03:00')).toBe(true);
  });

  it('10/09 23:59 (São Paulo) fica DENTRO do intervalo [09, 10]', () => {
    expect(isDentroDoIntervalo('2026-09-10T23:59:00-03:00')).toBe(true);
  });

  it('11/09 00:00 (São Paulo) fica FORA do intervalo [09, 10]', () => {
    expect(isDentroDoIntervalo('2026-09-11T00:00:00-03:00')).toBe(false);
  });

  it('equivalente em UTC: 09/09 03:00Z é o mesmo instante que 09/09 00:00 em São Paulo', () => {
    expect(startOfDaySaoPaulo('2026-09-09')).toBe('2026-09-09T00:00:00-03:00');
    expect(new Date(startOfDaySaoPaulo('2026-09-09')).toISOString()).toBe('2026-09-09T03:00:00.000Z');
  });

  it('startOfNextDaySaoPaulo avança exatamente um dia de calendário, mesmo virando mês/ano', () => {
    expect(new Date(startOfNextDaySaoPaulo('2026-09-30')).toISOString()).toBe('2026-10-01T03:00:00.000Z');
    expect(new Date(startOfNextDaySaoPaulo('2026-12-31')).toISOString()).toBe('2027-01-01T03:00:00.000Z');
  });
});
