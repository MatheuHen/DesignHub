import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { BlockedExternalCredentialError } from '../lib/errors.js';
import { env, supabaseConfigStatus } from './env.js';

let cachedPublicClient: SupabaseClient | null = null;
let cachedAdminClient: SupabaseClient | null = null;

/**
 * Cliente autenticado com a chave publicável, sujeito a RLS.
 * Uso: operações que devem respeitar as policies do usuário autenticado
 * (ex.: validar token de sessão recebido do frontend).
 */
export function getSupabasePublicClient(): SupabaseClient {
  if (!supabaseConfigStatus.hasPublicClient) {
    throw new BlockedExternalCredentialError(
      'SUPABASE_URL/SUPABASE_PUBLISHABLE_KEY ausentes.',
    );
  }
  if (!cachedPublicClient) {
    cachedPublicClient = createClient(env.SUPABASE_URL!, env.SUPABASE_PUBLISHABLE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return cachedPublicClient;
}

/**
 * Cliente escopado ao token de acesso do usuário autenticado (JWT do
 * Supabase Auth recebido no header Authorization). Toda query feita com
 * este cliente respeita RLS como o próprio usuário — é o mecanismo usado
 * para validar sessão (`auth.getUser`) e para ler dados de perfil próprio
 * sem depender de service role.
 */
export function getSupabaseUserClient(accessToken: string): SupabaseClient {
  if (!supabaseConfigStatus.hasPublicClient) {
    throw new BlockedExternalCredentialError(
      'SUPABASE_URL/SUPABASE_PUBLISHABLE_KEY ausentes.',
    );
  }
  return createClient(env.SUPABASE_URL!, env.SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  }) as SupabaseClient;
}

/**
 * Cliente com service role — ignora RLS. Nunca deve ser exposto ao
 * frontend. Uso restrito a operações administrativas server-only
 * (ex.: criação de usuários Auth, jobs internos).
 */
export function getSupabaseAdminClient(): SupabaseClient {
  if (!supabaseConfigStatus.hasAdminClient) {
    throw new BlockedExternalCredentialError(
      'SUPABASE_SERVICE_ROLE_KEY ausente. Operações administrativas indisponíveis até a credencial ser configurada.',
    );
  }
  if (!cachedAdminClient) {
    cachedAdminClient = createClient(env.SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return cachedAdminClient;
}
