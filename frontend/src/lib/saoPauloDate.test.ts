import { describe, expect, it } from 'vitest';
import { isDataHorarioPassadoSaoPaulo } from './saoPauloDate';

describe('isDataHorarioPassadoSaoPaulo (item 8 — rodada correções Instagram)', () => {
  it('considera passado uma data muito antiga', () => {
    expect(isDataHorarioPassadoSaoPaulo('2000-01-01', '10:00')).toBe(true);
  });

  it('considera futuro uma data muito distante', () => {
    expect(isDataHorarioPassadoSaoPaulo('2099-12-31', '23:59')).toBe(false);
  });
});
