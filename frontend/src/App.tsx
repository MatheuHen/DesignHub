import { useEffect, useState } from 'react';

type HealthState =
  | { status: 'loading' }
  | { status: 'online'; service: string }
  | { status: 'offline' };

export function App() {
  const [health, setHealth] = useState<HealthState>({ status: 'loading' });

  useEffect(() => {
    const controller = new AbortController();

    void fetch('/api/health', { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('Backend indisponível');
        return response.json() as Promise<{ service?: string }>;
      })
      .then((data) => {
        setHealth({ status: 'online', service: data.service ?? 'designhub-api' });
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setHealth({ status: 'offline' });
      });

    return () => controller.abort();
  }, []);

  return (
    <main className="dev-shell">
      <section className="dev-card" aria-labelledby="designhub-title">
        <span className="eyebrow">Base técnica inicial</span>
        <h1 id="designhub-title">DesignHub</h1>
        <p>
          Fundacao React + TypeScript conectada a API Express. Esta tela inicial sera substituida pelas interfaces previstas nos requisitos do DesignHub.
          conforme os protótipos e requisitos congelados, sem inventar funcionalidades.
        </p>
        <div className="status" role="status" aria-live="polite">
          <span className={`status-dot status-dot--${health.status}`} aria-hidden="true" />
          {health.status === 'loading' && 'Verificando backend…'}
          {health.status === 'online' && `Backend online (${health.service})`}
          {health.status === 'offline' && 'Backend não respondeu. Inicie o workspace com npm run dev.'}
        </div>
      </section>
    </main>
  );
}
