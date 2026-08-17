import { Router } from 'express';
import { getSupabaseUserClient } from '../config/supabase.js';
import { attachProfile, requireAuth } from '../middleware/auth.js';
import { getDesignerById } from '../repositories/designer.repository.js';

export const authRouter = Router();

/**
 * RF002/RN51: após validar a sessão (Supabase Auth), devolve o perfil
 * persistido para o frontend decidir o direcionamento (área Designer x
 * Administrador). Nunca devolve credencial/senha — essas não existem
 * nesta aplicação (delegadas ao Supabase Auth, ver ADR 0001). Para
 * designers, inclui `bloqueado` (RF006) para a UI exibir o aviso de
 * bloqueio por solicitação vencida sem precisar de uma chamada extra.
 */
authRouter.get('/me', requireAuth, attachProfile, async (request, response, next) => {
  try {
    if (!request.auth || !request.profile) {
      response.status(401).json({ error: 'UNAUTHORIZED', message: 'Sessão não autenticada.' });
      return;
    }

    let bloqueado: boolean | null = null;
    if (request.profile.perfil === 'designer') {
      const client = getSupabaseUserClient(request.auth.accessToken);
      const designer = await getDesignerById(client, request.auth.userId);
      bloqueado = designer?.bloqueado ?? false;
    }

    response.status(200).json({
      id: request.auth.userId,
      email: request.profile.email,
      nomeCompleto: request.profile.nomeCompleto,
      perfil: request.profile.perfil,
      status: request.profile.status,
      bloqueado,
    });
  } catch (error) {
    next(error);
  }
});
