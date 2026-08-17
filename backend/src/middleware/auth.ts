import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { getSupabasePublicClient, getSupabaseUserClient } from '../config/supabase.js';

export interface AuthContext {
  userId: string;
  email: string;
  accessToken: string;
}

export interface ProfileContext {
  perfil: 'designer' | 'administrador';
  status: 'ativo' | 'inativo';
  nomeCompleto: string;
  email: string;
}

declare module 'express-serve-static-core' {
  interface Request {
    auth?: AuthContext;
    profile?: ProfileContext;
  }
}

const usuarioProfileRowSchema = z.object({
  perfil: z.enum(['designer', 'administrador']),
  status: z.enum(['ativo', 'inativo']),
  nome_completo: z.string(),
  email: z.string(),
});

function extractBearerToken(header: string | undefined): string | null {
  if (!header) return null;
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) return null;
  return token;
}

/**
 * RF002/RNF007: valida a sessão do Supabase Auth enviada pelo frontend
 * (header Authorization: Bearer <access_token>). Nunca confia em
 * id/perfil enviados pelo cliente — apenas no token verificado junto ao
 * Supabase Auth.
 */
export async function requireAuth(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  const token = extractBearerToken(request.header('authorization'));
  if (!token) {
    response.status(401).json({ error: 'UNAUTHORIZED', message: 'Token de acesso ausente.' });
    return;
  }

  try {
    const { data, error } = await getSupabasePublicClient().auth.getUser(token);
    if (error || !data.user) {
      response.status(401).json({ error: 'UNAUTHORIZED', message: 'Sessão inválida ou expirada.' });
      return;
    }

    request.auth = { userId: data.user.id, email: data.user.email ?? '', accessToken: token };
    next();
  } catch {
    response
      .status(401)
      .json({ error: 'UNAUTHORIZED', message: 'Não foi possível validar a sessão.' });
  }
}

/**
 * RN50/RN51: identifica o perfil (designer/administrador) e o status a
 * partir da linha persistida em public.usuario — nunca por convenção de
 * e-mail no lado do servidor de aplicação. Usa o cliente escopado ao
 * token do usuário (RLS: id_usuario = auth.uid()), sem depender de
 * service role.
 */
export async function attachProfile(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  if (!request.auth) {
    response.status(401).json({ error: 'UNAUTHORIZED', message: 'Sessão não autenticada.' });
    return;
  }

  try {
    const client = getSupabaseUserClient(request.auth.accessToken);
    const result: unknown = await client
      .from('usuario')
      .select('perfil, status, nome_completo, email')
      .eq('id_usuario', request.auth.userId)
      .maybeSingle();

    const { data, error } = result as {
      data: unknown;
      error: { message: string } | null;
    };

    if (error) {
      response
        .status(500)
        .json({ error: 'INTERNAL_SERVER_ERROR', message: 'Falha ao carregar perfil.' });
      return;
    }

    const parsed = usuarioProfileRowSchema.safeParse(data);
    if (!parsed.success) {
      response
        .status(403)
        .json({ error: 'PROFILE_NOT_FOUND', message: 'Perfil não encontrado para este usuário.' });
      return;
    }

    if (parsed.data.status !== 'ativo') {
      response.status(403).json({ error: 'PROFILE_INACTIVE', message: 'Usuário inativo.' });
      return;
    }

    request.profile = {
      perfil: parsed.data.perfil,
      status: parsed.data.status,
      nomeCompleto: parsed.data.nome_completo,
      email: parsed.data.email,
    };
    next();
  } catch {
    response
      .status(500)
      .json({ error: 'INTERNAL_SERVER_ERROR', message: 'Falha ao carregar perfil.' });
  }
}

/**
 * Autorização por perfil (seção 12.1: nunca só no frontend). Deve ser
 * usado após requireAuth + attachProfile.
 */
export function requireProfile(...allowed: Array<'designer' | 'administrador'>) {
  return (request: Request, response: Response, next: NextFunction): void => {
    if (!request.profile || !allowed.includes(request.profile.perfil)) {
      response
        .status(403)
        .json({ error: 'FORBIDDEN', message: 'Perfil sem permissão para este recurso.' });
      return;
    }
    next();
  };
}
