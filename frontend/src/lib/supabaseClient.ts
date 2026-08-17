import { createClient } from '@supabase/supabase-js';

const supabaseUrl: string | undefined =
  import.meta.env.VITE_SUPABASE_URL ?? import.meta.env.NEXT_PUBLIC_SUPABASE_URL;
const supabasePublishableKey: string | undefined =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  import.meta.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabasePublishableKey);

/**
 * Cliente Supabase do navegador. Usa somente a chave publicável (anon),
 * sujeita a RLS. Nunca deve receber service role key.
 */
export const supabase =
  supabaseUrl && supabasePublishableKey ? createClient(supabaseUrl, supabasePublishableKey) : null;
