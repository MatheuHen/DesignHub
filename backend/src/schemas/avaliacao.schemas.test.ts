import { describe, expect, it } from 'vitest';
import { submitAvaliacaoBodySchema } from './avaliacao.schemas.js';

describe('submitAvaliacaoBodySchema (RN22: preferência de agendamento na aprovação)', () => {
  it('aceita Aprovado sem preferência de agendamento', () => {
    expect(submitAvaliacaoBodySchema.safeParse({ decisao: 'Aprovado' }).success).toBe(true);
  });

  it('aceita Aprovado com desejaAgendamento="true" + data/horário (campos vêm como string do multipart/form-data)', () => {
    const result = submitAvaliacaoBodySchema.safeParse({
      decisao: 'Aprovado',
      desejaAgendamento: 'true',
      dataDesejada: '2026-09-01',
      horarioDesejado: '14:30',
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.desejaAgendamento).toBe(true);
  });

  it('rejeita Aprovado com desejaAgendamento="true" sem data/horário', () => {
    const result = submitAvaliacaoBodySchema.safeParse({
      decisao: 'Aprovado',
      desejaAgendamento: 'true',
    });
    expect(result.success).toBe(false);
  });

  it('aceita Aprovado com desejaAgendamento="false" sem data/horário', () => {
    const result = submitAvaliacaoBodySchema.safeParse({
      decisao: 'Aprovado',
      desejaAgendamento: 'false',
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.desejaAgendamento).toBe(false);
  });
});
