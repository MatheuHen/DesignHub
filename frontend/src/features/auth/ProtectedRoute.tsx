import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import type { AuthProfile } from './auth-context';
import { useAuth } from './useAuth';
import { ConfigErrorNotice, LoadingScreen, ProfileErrorNotice } from './StatusScreens';

interface ProtectedRouteProps {
  allowed: Array<AuthProfile['perfil']>;
  children: ReactNode;
}

/**
 * RF002 seção 11: "Rotas autenticadas por perfil". A decisão de acesso é
 * apenas de UX aqui — a autorização real acontece no backend (seção 12.1),
 * então esta checagem nunca é a única camada de proteção.
 */
export function ProtectedRoute({ allowed, children }: ProtectedRouteProps) {
  const { status, profile, profileError } = useAuth();
  const location = useLocation();

  if (status === 'config-error') {
    return <ConfigErrorNotice />;
  }

  if (status === 'loading') {
    return <LoadingScreen />;
  }

  if (status === 'signed-out') {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (profileError || !profile) {
    return <ProfileErrorNotice message={profileError ?? 'Perfil indisponível.'} />;
  }

  if (!allowed.includes(profile.perfil)) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
