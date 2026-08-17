import type { Session } from '@supabase/supabase-js';
import { createContext } from 'react';

export interface AuthProfile {
  id: string;
  email: string;
  nomeCompleto: string;
  perfil: 'designer' | 'administrador';
  status: 'ativo' | 'inativo';
  /** RF006: só se aplica a designers; null para administrador. */
  bloqueado: boolean | null;
}

export type AuthStatus = 'loading' | 'signed-out' | 'signed-in' | 'config-error';

export interface AuthState {
  status: AuthStatus;
  session: Session | null;
  profile: AuthProfile | null;
  profileError: string | null;
}

export interface AuthContextValue extends AuthState {
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);
