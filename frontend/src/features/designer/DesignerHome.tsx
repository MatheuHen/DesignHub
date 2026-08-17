import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError } from '../../lib/apiClient';
import { useAuth } from '../auth/useAuth';
import { listSolicitacoes, type SolicitacaoStatus } from './solicitacoes/api';

/**
 * RF005/RF011 ("toda transição deve atualizar dashboard/listagens")/
 * RN13-RN14 (acompanhamento dos estados): contagens reais por status,
 * cada uma linkando para a listagem já filtrada (`/designer/solicitacoes
 * ?status=...`). Sem indicador inventado — apenas os totais que a própria
 * API de listagem já calcula.
 */
const PENDENCIA_STATUSES: { status: SolicitacaoStatus; label: string }[] = [
  { status: 'Ajustes', label: 'Aguardando nova versão (ajustes solicitados)' },
  { status: 'Enviado para avaliação', label: 'Aguardando avaliação do cliente' },
  { status: 'Aprovado', label: 'Aprovadas aguardando agendamento' },
  { status: 'Agendado', label: 'Agendadas aguardando publicação' },
];

interface PendenciaCount {
  status: SolicitacaoStatus;
  label: string;
  total: number;
}

/**
 * Área do Designer. RF003 (clientes) em `/designer/clientes`, RF005
 * (solicitações) em `/designer/solicitacoes`. RF004 (atendimento
 * WhatsApp) é acionado a partir da lista de clientes.
 */
export function DesignerHome() {
  const { profile, signOut } = useAuth();

  const [pendencias, setPendencias] = useState<PendenciaCount[] | null>(null);
  const [pendenciasLoading, setPendenciasLoading] = useState(true);
  const [pendenciasError, setPendenciasError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setPendenciasLoading(true);
    setPendenciasError(null);

    Promise.all(
      PENDENCIA_STATUSES.map(({ status, label }) =>
        listSolicitacoes({ status }).then((result) => ({ status, label, total: result.total })),
      ),
    )
      .then((results) => {
        if (!cancelled) setPendencias(results);
      })
      .catch((loadError: unknown) => {
        if (!cancelled) {
          setPendenciasError(
            loadError instanceof ApiError ? loadError.message : 'Não foi possível carregar as pendências.',
          );
        }
      })
      .finally(() => {
        if (!cancelled) setPendenciasLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="dev-shell">
      <section className="dev-card">
        <span className="eyebrow">Área do Designer</span>
        <h1>Olá, {profile?.nomeCompleto}</h1>

        {profile?.bloqueado && (
          <p role="alert" className="auth-error">
            Você está bloqueado para iniciar novos atendimentos: há uma solicitação vencida sem a
            primeira versão enviada (RF006). Envie a versão pendente ou aguarde o cancelamento
            para ser desbloqueado.
          </p>
        )}

        <h2>Pendências</h2>
        {pendenciasLoading && <p role="status">Carregando pendências…</p>}
        {pendenciasError && (
          <p role="alert" className="auth-error">
            {pendenciasError}
          </p>
        )}
        {!pendenciasLoading && !pendenciasError && pendencias && (
          <>
            {pendencias.every((item) => item.total === 0) ? (
              <p>Nenhuma pendência no momento.</p>
            ) : (
              <ul>
                {pendencias
                  .filter((item) => item.total > 0)
                  .map((item) => (
                    <li key={item.status}>
                      <Link to={`/designer/solicitacoes?status=${encodeURIComponent(item.status)}`}>
                        {item.label}: {item.total}
                      </Link>
                    </li>
                  ))}
              </ul>
            )}
          </>
        )}

        <p>Gerencie seus clientes e solicitações de arte.</p>
        <p>
          <Link to="/designer/clientes">Meus clientes</Link>
        </p>
        <p>
          <Link to="/designer/solicitacoes">Minhas solicitações</Link>
        </p>
        <p>
          <Link to="/designer/agendamentos">Agendamentos de publicação</Link>
        </p>
        <button type="button" onClick={() => void signOut()}>
          Sair
        </button>
      </section>
    </main>
  );
}
