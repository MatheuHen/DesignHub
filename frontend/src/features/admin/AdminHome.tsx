import { Link } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';

/**
 * Área do Administrador. RF001/RF015 (gerenciar designers) já estão
 * implementados em `/admin/designers`. RF016 (reatribuir solicitações)
 * chega junto da tela de solicitações na Fase 7, quando existir uma lista
 * de solicitações para selecionar o alvo da reatribuição.
 */
export function AdminHome() {
  const { profile, signOut } = useAuth();

  return (
    <main className="dev-shell">
      <section className="dev-card">
        <span className="eyebrow">Área do Administrador</span>
        <h1>Olá, {profile?.nomeCompleto}</h1>
        <p>Gerencie os designers responsáveis pelo atendimento dos clientes do DesignHub.</p>
        <p>
          <Link to="/admin/designers">Gerenciar designers</Link>
        </p>
        <button type="button" onClick={() => void signOut()}>
          Sair
        </button>
      </section>
    </main>
  );
}
