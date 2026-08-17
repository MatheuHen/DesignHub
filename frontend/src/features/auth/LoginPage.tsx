import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './useAuth';
import { ConfigErrorNotice } from './StatusScreens';

export function LoginPage() {
  const { status, signIn } = useAuth();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (status === 'config-error') {
    return <ConfigErrorNotice />;
  }

  if (status === 'signed-in') {
    const from = (location.state as { from?: { pathname: string } } | null)?.from;
    return <Navigate to={from?.pathname ?? '/'} replace />;
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
        <input
          id="login-password"
          name="password"
          type="password"
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
