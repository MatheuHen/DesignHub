import type { Session } from '@supabase/supabase-js';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { translateAuthErrorMessage } from '../../lib/authErrorMessages';
import { isSupabaseConfigured, supabase } from '../../lib/supabaseClient';
import { AuthContext, type AuthContextValue, type AuthProfile, type AuthState } from './auth-context';

async function fetchProfile(accessToken: string): Promise<AuthProfile | null> {
  const apiUrl = import.meta.env.VITE_API_URL ?? '';
  try {
    const response = await fetch(`${apiUrl}/api/auth/me`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) return null;
    return (await response.json()) as AuthProfile;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    status: isSupabaseConfigured ? 'loading' : 'config-error',
    session: null,
    profile: null,
    profileError: null,
  });

  const loadProfile = useCallback(async (session: Session | null) => {
    if (!session) {
      setState({ status: 'signed-out', session: null, profile: null, profileError: null });
      return;
    }

    const profile = await fetchProfile(session.access_token);
    if (!profile) {
      setState({
        status: 'signed-in',
        session,
        profile: null,
        profileError: 'Não foi possível carregar o perfil deste usuário.',
      });
      return;
    }

    setState({ status: 'signed-in', session, profile, profileError: null });
  }, []);

  useEffect(() => {
    if (!supabase) return;

    let active = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (active) void loadProfile(data.session);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      void loadProfile(session);
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, [loadProfile]);

  const signIn = useCallback(async (email: string, password: string) => {
    if (!supabase) return { error: 'Supabase não está configurado neste ambiente.' };
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error ? translateAuthErrorMessage(error.message) : null };
  }, []);

  const signOut = useCallback(async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ ...state, signIn, signOut }),
    [state, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
