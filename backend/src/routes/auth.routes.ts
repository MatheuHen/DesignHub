import { Router } from 'express';
import { getSupabaseAdminClient } from '../config/supabase.js';
import { attachProfile, requireAuth } from '../middleware/auth.js';
import { syncDesignerBloqueio } from '../repositories/solicitacao.repository.js';

export const authRouter = Router();

/**
 * RF002/RN51: após validar a sessão (Supabase Auth), devolve o perfil
 * persistido para o frontend decidir o direcionamento (área Designer x
 * Administrador). Nunca devolve credencial/senha — essas não existem
 * nesta aplicação (delegadas ao Supabase Auth, ver ADR 0001). Para
 * designers, inclui `bloqueado` (RF006) para a UI exibir o aviso de
 * bloqueio por solicitação vencida sem precisar de uma chamada extra.
 *
 * Item 5.1 (rodada final): recalcula o bloqueio ao vivo (mesma função usada
 * como autoridade em `iniciarAtendimento`) em vez de ler a coluna
 * `designer.bloqueado` — que é só um cache de exibição e podia ficar
 * desatualizada até a próxima tentativa de iniciar atendimento. Isso permite
 * que o frontend recarregue o perfil (`refreshProfile`) depois de resolver a
 * pendência e o aviso desaparecer sem exigir logout/login.
 */
authRouter.get('/me', requireAuth, attachProfile, async (request, response, next) => {
  try {
    if (!request.auth || !request.profile) {
      response.status(401).json({ error: 'UNAUTHORIZED', message: 'Sessão não autenticada.' });
      return;
    }

    let bloqueado: boolean | null = null;
    if (request.profile.perfil === 'designer') {
      bloqueado = await syncDesignerBloqueio(getSupabaseAdminClient(), request.auth.userId);
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
