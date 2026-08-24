import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { AdminHome } from '../features/admin/AdminHome';
import { DesignersPage } from '../features/admin/designers/DesignersPage';
import { AdminSolicitacaoDetailPage } from '../features/admin/solicitacoes/AdminSolicitacaoDetailPage';
import { AuthProvider } from '../features/auth/AuthContext';
import { ForgotPasswordPage } from '../features/auth/ForgotPasswordPage';
import { LoginPage } from '../features/auth/LoginPage';
import { ProtectedRoute } from '../features/auth/ProtectedRoute';
import { ResetPasswordPage } from '../features/auth/ResetPasswordPage';
import { RootRedirect } from '../features/auth/RootRedirect';
import { AvaliacaoPage } from '../features/avaliacao/AvaliacaoPage';
import { AgendamentosPage } from '../features/designer/agendamentos/AgendamentosPage';
import { ClientesPage } from '../features/designer/clientes/ClientesPage';
import { DesignerHome } from '../features/designer/DesignerHome';
import { SolicitacaoDetailPage } from '../features/designer/solicitacoes/SolicitacaoDetailPage';
import { SolicitacoesPage } from '../features/designer/solicitacoes/SolicitacoesPage';

export function AppRouter() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/esqueci-senha" element={<ForgotPasswordPage />} />
          <Route path="/redefinir-senha" element={<ResetPasswordPage />} />
          <Route path="/avaliacao/:token" element={<AvaliacaoPage />} />
          <Route
            path="/designer"
            element={
              <ProtectedRoute allowed={['designer']}>
                <Outlet />
              </ProtectedRoute>
            }
          >
            <Route index element={<DesignerHome />} />
            <Route path="clientes" element={<ClientesPage />} />
            <Route path="solicitacoes" element={<SolicitacoesPage />} />
            <Route path="solicitacoes/:id" element={<SolicitacaoDetailPage />} />
            <Route path="agendamentos" element={<AgendamentosPage />} />
          </Route>
          <Route
            path="/admin"
            element={
              <ProtectedRoute allowed={['administrador']}>
                <Outlet />
              </ProtectedRoute>
            }
          >
            <Route index element={<AdminHome />} />
            <Route path="designers" element={<DesignersPage />} />
            <Route path="solicitacoes/:id" element={<AdminSolicitacaoDetailPage />} />
          </Route>
          <Route path="/" element={<RootRedirect />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
