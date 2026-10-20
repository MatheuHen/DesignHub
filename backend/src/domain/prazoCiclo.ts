import type { SolicitacaoStatus } from '../lib/statusTransitions.js';

/**
 * RF006/RN11/RN12 — fonte de verdade ÚNICA, no lado da aplicação, de "em que
 * etapas o prazo de 5 dias corre contra o designer" e de "o que conta como
 * atrasado".
 *
 * A autoridade de negócio do BLOQUEIO continua sendo a função SQL
 * `public.sync_designer_bloqueio` (e o cálculo do prazo em si continua sendo
 * a trigger `set_prazo_primeira_versao`) — ver
 * `supabase/migrations/20261019100000_prazo_ciclo_versao.sql`. Este módulo
 * existe para que os pontos de LEITURA/EXIBIÇÃO do backend
 * (`solicitacao.repository.ts`) não reimplementem o predicado cada um à sua
 * maneira, o que era exatamente a causa de o prazo valer só para a primeira
 * versão em alguns lugares.
 *
 * A lista abaixo precisa permanecer idêntica à retornada por
 * `public.status_com_prazo_designer()`.
 */
export const STATUS_COM_PRAZO_DESIGNER = ['Em produção', 'Ajustes'] as const satisfies readonly SolicitacaoStatus[];

/**
 * `true` quando a solicitação aguarda uma versão da arte do designer e,
 * portanto, o prazo do ciclo corrente corre (RN11) e o atraso bloqueia novas
 * solicitações (RN12).
 */
export function statusTemPrazoDesigner(status: SolicitacaoStatus): boolean {
  return (STATUS_COM_PRAZO_DESIGNER as readonly SolicitacaoStatus[]).includes(status);
}

/**
 * `true` quando o prazo do ciclo de versão corrente já venceu.
 *
 * `agoraMs` é parâmetro explícito (em vez de `Date.now()` embutido) para que
 * os testes possam fixar o instante sem depender de timers globais.
 */
export function isPrazoVencido(prazoIso: string, agoraMs: number = Date.now()): boolean {
  const prazoMs = new Date(prazoIso).getTime();
  if (Number.isNaN(prazoMs)) return false;
  return prazoMs < agoraMs;
}

/**
 * RN11/RN12: a solicitação está atrasada quando a entrega está com o designer
 * (primeira versão OU qualquer versão seguinte) e o prazo daquele ciclo
 * venceu. Antes desta centralização o predicado considerava apenas
 * `Em produção`, de modo que um pedido de ajuste podia ficar indefinidamente
 * sem versão nova sem nunca contar como atraso.
 */
export function isSolicitacaoAtrasada(
  status: SolicitacaoStatus,
  prazoIso: string,
  agoraMs: number = Date.now(),
): boolean {
  return statusTemPrazoDesigner(status) && isPrazoVencido(prazoIso, agoraMs);
}
