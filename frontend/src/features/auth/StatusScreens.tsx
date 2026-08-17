export function LoadingScreen() {
  return (
    <main className="dev-shell">
      <p role="status" aria-live="polite">
        Carregando…
      </p>
    </main>
  );
}

export function ConfigErrorNotice() {
  return (
    <main className="dev-shell">
      <section className="dev-card">
        <span className="eyebrow">Configuração ausente</span>
        <h1>Supabase não configurado</h1>
        <p>
          As variáveis de ambiente do Supabase não foram encontradas neste ambiente. Configure
          `VITE_SUPABASE_URL`/`VITE_SUPABASE_PUBLISHABLE_KEY` para habilitar o login.
        </p>
      </section>
    </main>
  );
}

export function ProfileErrorNotice({ message }: { message: string }) {
  return (
    <main className="dev-shell">
      <section className="dev-card">
        <span className="eyebrow">Não foi possível continuar</span>
        <h1>Perfil indisponível</h1>
        <p>{message}</p>
      </section>
    </main>
  );
}
