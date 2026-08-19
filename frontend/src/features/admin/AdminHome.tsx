import { Navigate } from 'react-router-dom';

/**
 * RF001/RF015/RF016: a única área administrativa autorizada pelo backend
 * é o gerenciamento de designers (RF001/RF015) e a reatribuição de
 * solicitações (RF016), ambas em `/admin/designers`. Não há um "Dashboard"
 * documentado para o Administrador nos protótipos oficiais do TFC — as
 * FIGURA 2/27 (Gerenciamento de Designers) são a própria tela inicial.
 */
export function AdminHome() {
  return <Navigate to="/admin/designers" replace />;
}
