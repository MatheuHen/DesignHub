import { describe, expect, it } from 'vitest';
import { submitAvaliacaoBodySchema } from './avaliacao.schemas.js';

describe('submitAvaliacaoBodySchema (RN22/RN27/RN29: opção de publicação na aprovação)', () => {
  it('rejeita Aprovado sem escolher uma opção de publicação', () => {
    const result = submitAvaliacaoBodySchema.safeParse({ decisao: 'Aprovado' });
    expect(result.success).toBe(false);
  });

  it('aceita Aprovado + opcaoPublicacao="automatico" com data/horário', () => {
    const result = submitAvaliacaoBodySchema.safeParse({
      decisao: 'Aprovado',
      opcaoPublicacao: 'automatico',
      dataDesejada: '2026-09-01',
      horarioDesejado: '14:30',
    });
    expect(result.success).toBe(true);
  });

  it('rejeita Aprovado + opcaoPublicacao="automatico" sem data/horário', () => {
    const result = submitAvaliacaoBodySchema.safeParse({
      decisao: 'Aprovado',
      opcaoPublicacao: 'automatico',
    });
    expect(result.success).toBe(false);
  });

  it('aceita Aprovado + opcaoPublicacao="designer_manual" com data/horário e legenda opcional', () => {
    const result = submitAvaliacaoBodySchema.safeParse({
      decisao: 'Aprovado',
      opcaoPublicacao: 'designer_manual',
      dataDesejada: '2026-09-01',
      horarioDesejado: '14:30',
      legendaDesejada: 'Confira a novidade!',
    });
    expect(result.success).toBe(true);
  });

  it('rejeita Aprovado + opcaoPublicacao="designer_manual" sem data/horário', () => {
    const result = submitAvaliacaoBodySchema.safeParse({
      decisao: 'Aprovado',
      opcaoPublicacao: 'designer_manual',
    });
    expect(result.success).toBe(false);
  });

  it('aceita Aprovado + opcaoPublicacao="proprio_cliente" sem data/horário', () => {
    const result = submitAvaliacaoBodySchema.safeParse({
      decisao: 'Aprovado',
      opcaoPublicacao: 'proprio_cliente',
    });
    expect(result.success).toBe(true);
  });

  it('rejeita opcaoPublicacao inválida', () => {
    const result = submitAvaliacaoBodySchema.safeParse({
      decisao: 'Aprovado',
      opcaoPublicacao: 'qualquer-coisa',
    });
    expect(result.success).toBe(false);
  });

  it('rejeita campo desconhecido (mass assignment)', () => {
    const result = submitAvaliacaoBodySchema.safeParse({
      decisao: 'Aprovado',
      opcaoPublicacao: 'proprio_cliente',
      desejaAgendamento: 'true',
    });
    expect(result.success).toBe(false);
  });

  it('não exige opcaoPublicacao para Ajustes/Cancelado', () => {
    expect(
      submitAvaliacaoBodySchema.safeParse({ decisao: 'Ajustes', descricao: 'Trocar a cor de fundo' }).success,
    ).toBe(true);
    expect(submitAvaliacaoBodySchema.safeParse({ decisao: 'Cancelado' }).success).toBe(true);
  });
});
