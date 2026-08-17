import { describe, expect, it } from 'vitest';
import {
  SOLICITACAO_STATUSES,
  SOLICITACAO_STATUS_TRANSITIONS,
  isValidSolicitacaoTransition,
} from './statusTransitions.js';

describe('SOLICITACAO_STATUSES (RN39 — exatamente 7 estados oficiais)', () => {
  it('tem exatamente os 7 estados na ordem documentada, sem duplicatas', () => {
    expect(SOLICITACAO_STATUSES).toEqual([
      'Em produção',
      'Enviado para avaliação',
      'Ajustes',
      'Aprovado',
      'Cancelado',
      'Agendado',
      'Publicado',
    ]);
    expect(new Set(SOLICITACAO_STATUSES).size).toBe(SOLICITACAO_STATUSES.length);
  });
});

describe('SOLICITACAO_STATUS_TRANSITIONS (RF011 — grafo completo, incluindo agendamento/publicação)', () => {
  it('tem exatamente 9 arestas, cada uma apontando para um estado oficial', () => {
    expect(SOLICITACAO_STATUS_TRANSITIONS).toHaveLength(9);
    for (const edge of SOLICITACAO_STATUS_TRANSITIONS) {
      expect(SOLICITACAO_STATUSES).toContain(edge.to);
      if (edge.from !== null) {
        expect(SOLICITACAO_STATUSES).toContain(edge.from);
      }
    }
  });

  it('marca todas as 9 arestas (Fases 4-12) como implementadas', () => {
    const implemented = SOLICITACAO_STATUS_TRANSITIONS.filter((edge) => edge.implemented);
    const pending = SOLICITACAO_STATUS_TRANSITIONS.filter((edge) => !edge.implemented);

    expect(implemented).toHaveLength(9);
    expect(pending).toHaveLength(0);
  });

  it('não tem arestas duplicadas (mesmo par from/to duas vezes)', () => {
    const seen = new Set<string>();
    for (const edge of SOLICITACAO_STATUS_TRANSITIONS) {
      const key = `${edge.from}->${edge.to}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });

  it('"Cancelado" e "Publicado" são estados terminais (nenhuma aresta parte deles)', () => {
    const originsFromCancelado = SOLICITACAO_STATUS_TRANSITIONS.filter((edge) => edge.from === 'Cancelado');
    const originsFromPublicado = SOLICITACAO_STATUS_TRANSITIONS.filter((edge) => edge.from === 'Publicado');
    expect(originsFromCancelado).toHaveLength(0);
    expect(originsFromPublicado).toHaveLength(0);
  });
});

describe('isValidSolicitacaoTransition', () => {
  it('aceita as transições implementadas do RF011', () => {
    expect(isValidSolicitacaoTransition(null, 'Em produção')).toBe(true);
    expect(isValidSolicitacaoTransition('Em produção', 'Enviado para avaliação')).toBe(true);
    expect(isValidSolicitacaoTransition('Ajustes', 'Enviado para avaliação')).toBe(true);
    expect(isValidSolicitacaoTransition('Enviado para avaliação', 'Aprovado')).toBe(true);
    expect(isValidSolicitacaoTransition('Enviado para avaliação', 'Ajustes')).toBe(true);
    expect(isValidSolicitacaoTransition('Enviado para avaliação', 'Cancelado')).toBe(true);
    expect(isValidSolicitacaoTransition('Aprovado', 'Agendado')).toBe(true);
    expect(isValidSolicitacaoTransition('Agendado', 'Aprovado')).toBe(true);
    expect(isValidSolicitacaoTransition('Agendado', 'Publicado')).toBe(true);
  });

  it('rejeita saltos ilegais não documentados por nenhuma aresta', () => {
    expect(isValidSolicitacaoTransition('Em produção', 'Aprovado')).toBe(false);
    expect(isValidSolicitacaoTransition('Aprovado', 'Ajustes')).toBe(false);
    expect(isValidSolicitacaoTransition('Cancelado', 'Em produção')).toBe(false);
    expect(isValidSolicitacaoTransition('Publicado', 'Agendado')).toBe(false);
    expect(isValidSolicitacaoTransition(null, 'Aprovado')).toBe(false);
  });
});
