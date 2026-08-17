import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { isSupabaseConfigured, supabase } from '../../lib/supabaseClient';
import { ConfigErrorNotice } from './StatusScreens';

/**
 * RF002: "Deve existir recuperação de senha por e-mail." O envio do e-mail
 * é responsabilidade do Supabase Auth; esta tela apenas dispara o fluxo.
 */
export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  if (!isSupabaseConfigured || !supabase) {
    return <ConfigErrorNotice />;
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    void supabase
      ?.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/redefinir-senha`,
      })
      .then(({ error: resetError }) => {
        setSubmitting(false);
        if (resetError) {
          setError(resetError.message);
          return;
        }
        setSent(true);
      });
  }

  if (sent) {
    return (
      <main className="auth-shell">
        <section className="auth-card">
          <span className="eyebrow">DesignHub</span>
          <h1>Verifique seu e-mail</h1>
          <p>Se o e-mail informado estiver cadastrado, enviamos um link para redefinir a senha.</p>
          <Link to="/login">Voltar ao login</Link>
        </section>
      </main>
    );
  }

  return (
    <main className="auth-shell">
      <form className="auth-card" onSubmit={handleSubmit} aria-labelledby="forgot-title">
        <span className="eyebrow">DesignHub</span>
        <h1 id="forgot-title">Recuperar senha</h1>
        <p>Informe o e-mail cadastrado para receber o link de redefinição.</p>

        <label htmlFor="forgot-email">E-mail</label>
        <input
          id="forgot-email"
          name="email"
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />

        {error && (
          <p role="alert" className="auth-error">
            {error}
          </p>
        )}

        <button type="submit" disabled={submitting}>
          {submitting ? 'Enviando…' : 'Enviar link de redefinição'}
        </button>

        <Link to="/login">Voltar ao login</Link>
      </form>
    </main>
  );
}
