import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './useAuth';
import { ConfigErrorNotice } from './StatusScreens';
import { PasswordInput } from '../../components/PasswordInput';

const INACTIVITY_LOGOUT_STORAGE_KEY = 'designhub:logout-reason';

export function LoginPage() {
  const { status, signIn } = useAuth();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  /**
   * Correção de segurança (item 7): mensagem exibida após logout automático
   * por inatividade (1h). Usa `sessionStorage` (não `location.state`)
   * porque o redirecionamento para /login pode ter sido disparado pelo
   * `ProtectedRoute` assim que a sessão caiu, antes da navegação imperativa
   * do próprio timer de inatividade rodar — `location.state` perderia a
   * corrida nesse caso. Consumida uma única vez (removida logo em seguida)
   * para não reaparecer em um login manual futuro.
   */
  const [inactivityMessage] = useState<string | null>(() => {
    if (sessionStorage.getItem(INACTIVITY_LOGOUT_STORAGE_KEY) !== 'inactivity') return null;
    sessionStorage.removeItem(INACTIVITY_LOGOUT_STORAGE_KEY);
    return 'Sua sessão expirou por inatividade.';
  });

  const locationState = location.state as { from?: { pathname: string } } | null;

  if (status === 'config-error') {
    return <ConfigErrorNotice />;
  }

  if (status === 'signed-in') {
    return <Navigate to={locationState?.from?.pathname ?? '/'} replace />;
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    void signIn(email, password).then((result) => {
      setSubmitting(false);
      if (result.error) setError(result.error);
    });
  }

  return (
    <main className="auth-shell">
      <form className="auth-card" onSubmit={handleSubmit} aria-labelledby="login-title">
        <span className="eyebrow">DesignHub</span>
        <h1 id="login-title">Entrar</h1>

        {inactivityMessage && (
          <p role="status" className="auth-error">
            {inactivityMessage}
          </p>
        )}

        <label htmlFor="login-email">E-mail</label>
        <input
          id="login-email"
          name="email"
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />

        <label htmlFor="login-password">Senha</label>
        <PasswordInput
          id="login-password"
          name="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />

        {error && (
          <p role="alert" className="auth-error">
            {error}
          </p>
        )}

        <button type="submit" disabled={submitting}>
          {submitting ? 'Entrando…' : 'Entrar'}
        </button>

        <Link to="/esqueci-senha">Esqueci minha senha</Link>
      </form>
    </main>
  );
}
