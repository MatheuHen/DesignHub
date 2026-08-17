import { Router } from 'express';
import { getSupabaseUserClient } from '../config/supabase.js';
import { toAppError } from '../lib/errors.js';
import { attachProfile, requireAuth, requireProfile } from '../middleware/auth.js';
import { listAgendamentosQuerySchema } from '../schemas/agendamento.schemas.js';
import { listAgendamentos } from '../services/agendamento.service.js';

export const agendamentoRouter = Router();

agendamentoRouter.use(requireAuth, attachProfile);

/** RF012: listagem com filtros das próprias publicações agendadas do designer. */
agendamentoRouter.get('/', requireProfile('designer'), async (request, response, next) => {
  try {
    const query = listAgendamentosQuerySchema.parse(request.query);
    const client = getSupabaseUserClient(request.auth!.accessToken);
    const result = await listAgendamentos(client, query);
    response.status(200).json(result);
  } catch (error) {
    next(toAppError(error));
  }
});
