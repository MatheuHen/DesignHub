import type { Session } from '@supabase/supabase-js';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { translateAuthErrorMessage } from '../../lib/authErrorMessages';
import { isSupabaseConfigured, supabase } from '../../lib/supabaseClient';
import { AuthContext, type AuthContextValue, type AuthProfile, type AuthState } from './auth-context';

/**
 * Correção de segurança (rotas/sessão): logout automático após 1h de
 * INATIVIDADE real do usuário — nunca 1h de sessão fixa. Mouse, teclado,
 * clique e navegação interna (troca de rota) reiniciam a contagem.
 */
const INACTIVITY_LIMIT_MS = 60 * 60 * 1000;
/** Evita recalcular o timeout a cada pixel de `mousemove`; folga irrelevante frente a 1h. */
const ACTIVITY_RESET_THROTTLE_MS = 5_000;
const ACTIVITY_EVENTS = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'] as const;

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
  const navigate = useNavigate();
  const location = useLocation();
  const inactivityTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastActivityResetRef = useRef(0);

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

  /**
   * Correção de segurança (botão voltar/cache): quando o navegador restaura
   * a página a partir do bfcache (`event.persisted`) sem recarregar o JS —
   * ex.: usuário deslogou, fechou a aba e o navegador restaura o documento
   * anterior — revalida a sessão real do Supabase em vez de confiar no
   * estado em memória potencialmente obsoleto.
   */
  useEffect(() => {
    if (!supabase) return;

    function handlePageShow(event: PageTransitionEvent) {
      if (!event.persisted || !supabase) return;
      void supabase.auth.getSession().then(({ data }) => {
        void loadProfile(data.session);
      });
    }

    window.addEventListener('pageshow', handlePageShow);
    return () => window.removeEventListener('pageshow', handlePageShow);
  }, [loadProfile]);

  const handleInactivityLogout = useCallback(async () => {
    if (!supabase) return;
    // sessionStorage (não router state): o redirecionamento para /login pode
    // já ter sido disparado declarativamente por `ProtectedRoute` (assim que
    // `signOut()` muda o status para `signed-out`) antes desta chamada
    // imperativa de `navigate` rodar — nesse caso o `state` do `Navigate`
    // do ProtectedRoute venceria a corrida e a razão se perderia.
    sessionStorage.setItem('designhub:logout-reason', 'inactivity');
    await supabase.auth.signOut();
    void navigate('/login', { replace: true });
  }, [navigate]);

  const resetInactivityTimer = useCallback(() => {
    if (inactivityTimeoutRef.current) clearTimeout(inactivityTimeoutRef.current);
    inactivityTimeoutRef.current = setTimeout(() => {
      void handleInactivityLogout();
    }, INACTIVITY_LIMIT_MS);
  }, [handleInactivityLogout]);

  /** Correção de segurança: logout automático após 1h sem atividade real (mouse/teclado/clique/navegação). */
  useEffect(() => {
    if (state.status !== 'signed-in') {
      if (inactivityTimeoutRef.current) {
        clearTimeout(inactivityTimeoutRef.current);
        inactivityTimeoutRef.current = null;
      }
      return;
    }

    function handleActivity() {
      const now = Date.now();
      if (now - lastActivityResetRef.current < ACTIVITY_RESET_THROTTLE_MS) return;
      lastActivityResetRef.current = now;
      resetInactivityTimer();
    }

    ACTIVITY_EVENTS.forEach((eventName) => window.addEventListener(eventName, handleActivity, { passive: true }));
    resetInactivityTimer();

    return () => {
      ACTIVITY_EVENTS.forEach((eventName) => window.removeEventListener(eventName, handleActivity));
      if (inactivityTimeoutRef.current) {
        clearTimeout(inactivityTimeoutRef.current);
        inactivityTimeoutRef.current = null;
      }
    };
  }, [state.status, resetInactivityTimer]);

  /** Navegação interna também conta como atividade (item 6 do pedido). */
  useEffect(() => {
    if (state.status === 'signed-in') resetInactivityTimer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  const signIn = useCallback(async (email: string, password: string) => {
    if (!supabase) return { error: 'Supabase não está configurado neste ambiente.' };
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error ? translateAuthErrorMessage(error.message) : null };
  }, []);

  const signOut = useCallback(async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
  }, []);

  /** Item 5.1: recarrega o perfil (inclui `bloqueado` recalculado ao vivo) sem exigir logout/login. */
  const refreshProfile = useCallback(async () => {
    if (!supabase) return;
    const { data } = await supabase.auth.getSession();
    await loadProfile(data.session);
  }, [loadProfile]);

  const value = useMemo<AuthContextValue>(
    () => ({ ...state, signIn, signOut, refreshProfile }),
    [state, signIn, signOut, refreshProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
