import { z } from 'zod';

const AGENDAMENTO_STATUSES = ['Agendado', 'Cancelado', 'Publicado'] as const;

/**
 * RF012/RN28: data, horário e legenda são obrigatórios no agendamento.
 * Regexes já restringem a faixas plausíveis de mês/dia/hora/minuto (não só
 * o formato) para que entrada fora de faixa vire 400 aqui, em vez de um
 * erro genérico de cast do Postgres.
 */
export const agendamentoBodySchema = z.object({
  dataPublicacao: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, 'Data inválida (use AAAA-MM-DD).'),
  horario: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, 'Horário inválido (use HH:MM).'),
  legenda: z.string().trim().min(1, 'Informe a legenda da publicação.').max(2200),
});
export type AgendamentoBody = z.infer<typeof agendamentoBodySchema>;

/** RF012: listagem com filtros por cliente, status e data — só os agendamentos do próprio designer (RN44). */
export const listAgendamentosQuerySchema = z.object({
  status: z.enum(AGENDAMENTO_STATUSES).optional(),
  idCliente: z.coerce.number().int().positive().optional(),
  dataInicio: z.string().date().optional(),
  dataFim: z.string().date().optional(),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type ListAgendamentosQuery = z.infer<typeof listAgendamentosQuerySchema>;
