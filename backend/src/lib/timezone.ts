/**
 * Item 10 (correções 13/09/2026): filtros de data em UI/API usam dias no
 * fuso America/Sao_Paulo (RN13/RN14 — o cliente e o designer pensam em
 * "dia 09" no horário local), mas as colunas afetadas (`data_criacao` etc.)
 * são `timestamptz` armazenadas em UTC. Brasil não observa horário de
 * verão desde 2019, então o offset de São Paulo é um -03:00 fixo — não é
 * necessário resolver fuso horário dinâmico/DST aqui.
 *
 * Bug corrigido: `new Date('2026-09-09T00:00:00.000Z')` é meia-noite UTC,
 * que corresponde a 08/09 21:00 em São Paulo — um filtro "dia 09" construído
 * assim inclui 3h do dia 08 (horário local) e exclui as últimas 3h do
 * próprio dia 09. Construir o limite com o offset explícito `-03:00` (em vez
 * de `Z`) resolve isso: o texto ISO com offset é um instante inequívoco,
 * interpretado corretamente pelo Postgres/PostgREST independentemente do
 * timezone da sessão.
 */
const SAO_PAULO_FIXED_OFFSET = '-03:00';

/** Início do dia (00:00) em América/São Paulo, como instante UTC absoluto. */
export function startOfDaySaoPaulo(isoDate: string): string {
  return `${isoDate}T00:00:00${SAO_PAULO_FIXED_OFFSET}`;
}

/** Início do dia seguinte (00:00) em América/São Paulo — limite superior exclusivo de um filtro "até o dia X" inclusivo. */
export function startOfNextDaySaoPaulo(isoDate: string): string {
  // Aritmética de calendário pura sobre a STRING da data (âncora 'Z' neutra,
  // descartada em seguida) — não representa um instante real, só avança o
  // componente de dia antes de aplicar o offset de fato.
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  const nextIsoDate = date.toISOString().slice(0, 10);
  return startOfDaySaoPaulo(nextIsoDate);
}
