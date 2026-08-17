import { Navigate } from 'react-router-dom';
import { useAuth } from './useAuth';
import { ConfigErrorNotice, LoadingScreen, ProfileErrorNotice } from './StatusScreens';

/** RN51: após identificar o perfil, direciona para a área correspondente. */
export function RootRedirect() {
  const { status, profile, profileError } = useAuth();

  if (status === 'config-error') {
    return <ConfigErrorNotice />;
  }

  if (status === 'loading') {
    return <LoadingScreen />;
  }

  if (status === 'signed-out') {
    return <Navigate to="/login" replace />;
  }

  if (profileError || !profile) {
    return <ProfileErrorNotice message={profileError ?? 'Perfil indisponível.'} />;
  }

  return <Navigate to={profile.perfil === 'administrador' ? '/admin' : '/designer'} replace />;
}
