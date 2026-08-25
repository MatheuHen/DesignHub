import { useState, type FormEvent } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { translateAuthErrorMessage } from '../../lib/authErrorMessages';
import { isSupabaseConfigured, supabase } from '../../lib/supabaseClient';
import { ConfigErrorNotice } from './StatusScreens';

/**
 * RF002: tela acessada a partir do link de e-mail de recuperação. O
 * Supabase Auth já estabelece uma sessão de recuperação antes desta tela
 * carregar; aqui apenas coletamos a nova senha.
 */
export function ResetPasswordPage() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (!isSupabaseConfigured || !supabase) {
    return <ConfigErrorNotice />;
  }

  if (done) {
    return <Navigate to="/login" replace />;
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (password !== confirmPassword) {
      setError('As senhas informadas não coincidem.');
      return;
    }

    setSubmitting(true);
    setError(null);

    void supabase
      ?.auth.updateUser({ password })
      .then(({ error: updateError }) => {
        setSubmitting(false);
        if (updateError) {
          setError(translateAuthErrorMessage(updateError.message));
          return;
        }
        setDone(true);
      });
  }

  return (
    <main className="auth-shell">
      <form className="auth-card" onSubmit={handleSubmit} aria-labelledby="reset-title">
        <span className="eyebrow">DesignHub</span>
        <h1 id="reset-title">Definir nova senha</h1>

        <label htmlFor="reset-password">Nova senha</label>
        <input
          id="reset-password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />

        <label htmlFor="reset-password-confirm">Confirmar nova senha</label>
        <input
          id="reset-password-confirm"
          name="passwordConfirm"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
        />

        {error && (
          <p role="alert" className="auth-error">
            {error}
          </p>
        )}

        <button type="submit" disabled={submitting}>
          {submitting ? 'Salvando…' : 'Salvar nova senha'}
        </button>

        <Link to="/login">Voltar ao login</Link>
      </form>
    </main>
  );
}
