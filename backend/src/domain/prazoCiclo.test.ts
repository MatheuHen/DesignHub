import { describe, expect, it } from 'vitest';
import { isPrazoVencido, isSolicitacaoAtrasada, statusTemPrazoDesigner, STATUS_COM_PRAZO_DESIGNER } from './prazoCiclo.js';

/**
 * RF006/RN11/RN12 — o prazo de 5 dias vale para TODA versão da arte, não só
 * para a primeira. Estes testes cobrem o predicado de atraso do lado da
 * aplicação; o cálculo do prazo e o bloqueio em si são autoridade do banco
 * (trigger `set_prazo_primeira_versao` + `sync_designer_bloqueio`) e estão
 * cobertos por `supabase/tests/prazo_ciclo_versao.sql`.
 */

const AGORA = new Date('2026-10-19T12:00:00Z').getTime();
const DIA = 86_400_000;

function iso(offsetDias: number): string {
  return new Date(AGORA + offsetDias * DIA).toISOString();
}

describe('STATUS_COM_PRAZO_DESIGNER', () => {
  it('cobre exatamente os status em que a entrega está com o designer', () => {
    expect([...STATUS_COM_PRAZO_DESIGNER]).toEqual(['Em produção', 'Ajustes']);
  });

  it('não inclui status em que a bola não está com o designer', () => {
    for (const status of ['Enviado para avaliação', 'Aprovado', 'Agendado', 'Publicado', 'Cancelado'] as const) {
      expect(statusTemPrazoDesigner(status)).toBe(false);
    }
  });
});

describe('isPrazoVencido', () => {
  it('prazo no futuro não está vencido', () => {
    expect(isPrazoVencido(iso(1), AGORA)).toBe(false);
  });

  it('prazo no passado está vencido', () => {
    expect(isPrazoVencido(iso(-1), AGORA)).toBe(true);
  });

  it('data inválida nunca é tratada como vencida (fail-safe: não bloqueia por dado corrompido)', () => {
    expect(isPrazoVencido('não-é-data', AGORA)).toBe(false);
  });
});

describe('isSolicitacaoAtrasada — ciclo de versão (RN11/RN12)', () => {
  it('primeira versão dentro do prazo: não atrasada', () => {
    expect(isSolicitacaoAtrasada('Em produção', iso(2), AGORA)).toBe(false);
  });

  it('primeira versão atrasada: atrasada', () => {
    expect(isSolicitacaoAtrasada('Em produção', iso(-1), AGORA)).toBe(true);
  });

  it('segunda versão (Ajustes) dentro do novo prazo: não atrasada', () => {
    expect(isSolicitacaoAtrasada('Ajustes', iso(4), AGORA)).toBe(false);
  });

  it('REGRESSÃO DO BUG: segunda versão (Ajustes) com prazo vencido agora conta como atrasada', () => {
    // Antes da correção este caso retornava `false` para sempre, porque o
    // predicado considerava apenas 'Em produção' — o designer podia ficar
    // semanas em 'Ajustes' sem nunca ser bloqueado.
    expect(isSolicitacaoAtrasada('Ajustes', iso(-30), AGORA)).toBe(true);
  });

  it('versão já entregue (Enviado para avaliação) nunca é atraso do designer, mesmo com prazo antigo vencido', () => {
    expect(isSolicitacaoAtrasada('Enviado para avaliação', iso(-30), AGORA)).toBe(false);
  });

  it('solicitação cancelada resolve a pendência (RN12) mesmo com prazo vencido', () => {
    expect(isSolicitacaoAtrasada('Cancelado', iso(-30), AGORA)).toBe(false);
  });

  it('aprovada/agendada/publicada não contam atraso de versão', () => {
    for (const status of ['Aprovado', 'Agendado', 'Publicado'] as const) {
      expect(isSolicitacaoAtrasada(status, iso(-30), AGORA)).toBe(false);
    }
  });
});
