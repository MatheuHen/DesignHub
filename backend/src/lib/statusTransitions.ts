/**
 * RF011/RN39/RN41: fonte única de verdade do grafo de transições de
 * `solicitacao.status`. Os 7 estados oficiais e os 8 passos numerados do
 * RF011 (CLAUDE.md seção "Requisitos funcionais") são exatamente estes.
 *
 * Este módulo é documentação/rastreabilidade executável (RF011 aparece
 * assim como uma unidade explícita na matriz de rastreabilidade, em vez de
 * ficar apenas implícito nas RPCs individuais das Fases 6-12) e serve como
 * fixture para os testes de "todos os caminhos" (roadmap, Fase 10). Ele
 * **não substitui** a aplicação real da regra: a autoridade que decide se
 * uma transição é aceita continua sendo as RPCs SECURITY DEFINER no banco
 * (`complete_atendimento_and_create_solicitacao`, `register_versao_arte`,
 * `submit_avaliacao`, `create_agendamento`/`cancel_agendamento`,
 * `register_publicacao_sucesso`), seguindo a arquitetura já estabelecida
 * desde a Fase 2 (seção 11: "toda escrita de
 * negócio acontece via API REST do backend... persiste usando... service
 * role"). Duplicar a validação aqui em runtime criaria uma segunda fonte de
 * verdade sujeita a divergir da primeira — por isso este módulo só é usado
 * para teste/documentação, nunca importado pelas rotas para decidir uma
 * resposta HTTP.
 */

export const SOLICITACAO_STATUSES = [
  'Em produção',
  'Enviado para avaliação',
  'Ajustes',
  'Aprovado',
  'Cancelado',
  'Agendado',
  'Publicado',
] as const;
export type SolicitacaoStatus = (typeof SOLICITACAO_STATUSES)[number];

export interface SolicitacaoStatusTransition {
  /** `null` representa a criação da solicitação (não há status anterior). */
  from: SolicitacaoStatus | null;
  to: SolicitacaoStatus;
  /** RF/RN/fase responsável por esta aresta do grafo. */
  trigger: string;
  /** `false` = aresta documentada pelo RF011, ainda não implementada nesta fase do roadmap. */
  implemented: boolean;
}

/**
 * Os 8 passos numerados de RF011, na ordem em que aparecem no CLAUDE.md.
 * RN41 ("estados mudam automaticamente conforme o processo") é satisfeita
 * porque cada aresta é disparada dentro da mesma transação atômica que
 * grava `historico_solicitacao` (RN48) — nunca por um passo manual
 * separado.
 */
export const SOLICITACAO_STATUS_TRANSITIONS: readonly SolicitacaoStatusTransition[] = [
  {
    from: null,
    to: 'Em produção',
    trigger: 'RF004/RN03 — solicitação criada a partir do questionário WhatsApp concluído',
    implemented: true,
  },
  {
    from: 'Em produção',
    to: 'Enviado para avaliação',
    trigger: 'RF007 — 1ª versão da arte enviada (RN11)',
    implemented: true,
  },
  {
    from: 'Ajustes',
    to: 'Enviado para avaliação',
    trigger: 'RF007/RN25/RN26 — nova versão enviada após pedido de ajustes',
    implemented: true,
  },
  {
    from: 'Enviado para avaliação',
    to: 'Aprovado',
    trigger: 'RF009/RN20 — cliente aprova a arte via link de avaliação',
    implemented: true,
  },
  {
    from: 'Enviado para avaliação',
    to: 'Ajustes',
    trigger: 'RF009/RF010/RN20/RN21/RN24 — cliente solicita ajustes via link de avaliação',
    implemented: true,
  },
  {
    from: 'Enviado para avaliação',
    to: 'Cancelado',
    trigger: 'RF009/RN20 — cliente cancela via link de avaliação',
    implemented: true,
  },
  {
    from: 'Aprovado',
    to: 'Agendado',
    trigger: 'RF012/RN27/RN30 — publicação agendada',
    implemented: true,
  },
  {
    from: 'Agendado',
    to: 'Aprovado',
    trigger:
      'RF013/RN31 — cancelamento do agendamento (o design continua aprovado, só deixa de estar agendado; distinto do "Cancelado" de RF009, que encerra a solicitação inteira)',
    implemented: true,
  },
  {
    from: 'Agendado',
    to: 'Publicado',
    trigger:
      'RF014/RN32/RN33 — publicação realizada (automática via Instagram API oficial ou registrada manualmente)',
    implemented: true,
  },
];

/** Verifica se `to` é alcançável a partir de `from` segundo o grafo canônico de RF011. */
export function isValidSolicitacaoTransition(
  from: SolicitacaoStatus | null,
  to: SolicitacaoStatus,
): boolean {
  return SOLICITACAO_STATUS_TRANSITIONS.some((edge) => edge.from === from && edge.to === to);
}

/** Estados a partir dos quais existe pelo menos uma transição já implementada nesta fase do roadmap. */
export function implementedOriginStatuses(): Array<SolicitacaoStatus | null> {
  const origins = new Set<SolicitacaoStatus | null>();
  for (const edge of SOLICITACAO_STATUS_TRANSITIONS) {
    if (edge.implemented) origins.add(edge.from);
  }
  return [...origins];
}
