import { useEffect, useState, type FormEvent } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { translateAuthErrorMessage } from '../../lib/authErrorMessages';
import { isSupabaseConfigured, supabase } from '../../lib/supabaseClient';
import { ConfigErrorNotice } from './StatusScreens';
import { PasswordInput } from '../../components/PasswordInput';

/**
 * RF002: tela acessada a partir do link de e-mail de recuperação. O
 * Supabase Auth já estabelece uma sessão de recuperação antes desta tela
 * carregar; aqui apenas coletamos a nova senha.
 *
 * Quando o link é inválido/expirado/já usado, o Supabase não estabelece
 * sessão e, em vez disso, anexa `error`/`error_code` na própria URL de
 * redirecionamento. Sem checar isso, o formulário aparecia normalmente e só
 * falhava de forma confusa ao clicar em salvar.
 */
type LinkState = 'checking' | 'valid' | 'invalid';

export function ResetPasswordPage() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [linkState, setLinkState] = useState<LinkState>('checking');

  useEffect(() => {
    if (!supabase) return;

    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const searchParams = new URLSearchParams(window.location.search);
    const errorDescription =
      hashParams.get('error_description') ?? searchParams.get('error_description');
    const errorCode = hashParams.get('error_code') ?? searchParams.get('error_code');

    if (errorDescription || errorCode) {
      setLinkState('invalid');
      return;
    }

    let resolved = false;
    const resolve = (state: LinkState) => {
      if (resolved) return;
      resolved = true;
      setLinkState(state);
    };

    const { data: subscription } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || (session && event === 'INITIAL_SESSION')) {
        resolve('valid');
      }
    });

    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) resolve('valid');
    });

    const timeout = setTimeout(() => resolve('invalid'), 4000);

    return () => {
      clearTimeout(timeout);
      subscription.subscription.unsubscribe();
    };
  }, []);

  if (!isSupabaseConfigured || !supabase) {
    return <ConfigErrorNotice />;
  }

  if (done) {
    return <Navigate to="/login" replace />;
  }

  if (linkState === 'checking') {
    return (
      <main className="auth-shell">
        <section className="auth-card">
          <span className="eyebrow">DesignHub</span>
          <h1>Definir nova senha</h1>
          <p role="status" aria-live="polite">
            Verificando link…
          </p>
        </section>
      </main>
    );
  }

  if (linkState === 'invalid') {
    return (
      <main className="auth-shell">
        <section className="auth-card">
          <span className="eyebrow">DesignHub</span>
          <h1>Link inválido ou expirado</h1>
          <p>
            Este link de redefinição de senha não é mais válido. Solicite um novo link para
            continuar.
          </p>
          <Link to="/esqueci-senha">Solicitar novo link</Link>
          <Link to="/login">Voltar ao login</Link>
        </section>
      </main>
    );
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
        <PasswordInput
          id="reset-password"
          name="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />

        <label htmlFor="reset-password-confirm">Confirmar nova senha</label>
        <PasswordInput
          id="reset-password-confirm"
          name="passwordConfirm"
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
