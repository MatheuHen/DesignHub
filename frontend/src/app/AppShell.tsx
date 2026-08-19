import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../features/auth/useAuth';

interface NavItem {
  to: string;
  label: string;
  end?: boolean;
}

/**
 * Itens de navegação por perfil, conforme os protótipos oficiais do TFC
 * (FIGURA 7/21/22/23/27). O Administrador só recebe "Designers" porque é a
 * única área administrativa autorizada pelo backend (RF001/RF015/RF016) —
 * os demais itens do menu do protótipo (Clientes/Solicitações/Publicações)
 * pertencem exclusivamente ao Designer (RF003/RF005/RF012) e retornariam
 * 403 se o administrador tentasse acessá-los, então não são exibidos aqui
 * para não sugerir uma ação que o servidor recusa.
 */
const NAV_ITEMS: Record<'designer' | 'administrador', NavItem[]> = {
  designer: [
    { to: '/designer', label: 'Dashboard', end: true },
    { to: '/designer/clientes', label: 'Clientes' },
    { to: '/designer/solicitacoes', label: 'Solicitações' },
    { to: '/designer/agendamentos', label: 'Publicações' },
  ],
  administrador: [{ to: '/admin/designers', label: 'Designers' }],
};

const SIDEBAR_ICON: Record<string, ReactNode> = {
  Dashboard: <path d="M4 4h7v7H4V4Zm9 0h7v4h-7V4ZM4 13h7v7H4v-7Zm9-2h7v9h-7v-9Z" />,
  Clientes: (
    <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0 2c-4.4 0-8 2-8 4.5V20h16v-1.5c0-2.5-3.6-4.5-8-4.5Z" />
  ),
  Solicitações: <path d="M6 2h9l5 5v15H6V2Zm8 1.5V8h4.5L14 3.5ZM8 12h8v1.5H8V12Zm0 4h8v1.5H8V16Z" />,
  Publicações: (
    <path d="M3 10h4v10H3V10Zm7-6h4v16h-4V4Zm7 3h4v13h-4V7Z" />
  ),
  Designers: (
    <path d="M8 12a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm8 0a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM8 14c-3 0-6 1.5-6 4v2h12v-2c0-2.5-3-4-6-4Zm8 0c-.6 0-1.3.07-2 .2 1.3.9 2 2.1 2 3.8v2h6v-2c0-2.5-3-4-6-4Z" />
  ),
};

export function AppShell({ children }: { children: ReactNode }) {
  const { profile, signOut } = useAuth();
  const items = profile ? NAV_ITEMS[profile.perfil] : [];

  return (
    <div className="app-shell">
      <aside className="app-sidebar" aria-label="Menu principal">
        <div className="app-sidebar-logo">
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6">
            <path d="M12 2 3 7v10l9 5 9-5V7l-9-5Z" />
            <path d="M3 7l9 5 9-5M12 12v10" />
          </svg>
          <span>DesignHub</span>
        </div>
        <nav className="app-sidebar-nav">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end ?? false}
              className={({ isActive }) => `app-sidebar-link${isActive ? ' app-sidebar-link--active' : ''}`}
            >
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="currentColor">
                {SIDEBAR_ICON[item.label]}
              </svg>
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="app-content">
        <header className="app-topbar">
          <div className="app-topbar-greeting">
            <span>Olá, {profile?.nomeCompleto ?? '...'}</span>
            <span className="app-avatar" aria-hidden="true">
              {profile?.nomeCompleto?.trim().charAt(0).toUpperCase() ?? '?'}
            </span>
          </div>
          <button type="button" className="app-signout" onClick={() => void signOut()}>
            Sair
          </button>
        </header>
        <main className="app-main">{children}</main>
      </div>
    </div>
  );
}
