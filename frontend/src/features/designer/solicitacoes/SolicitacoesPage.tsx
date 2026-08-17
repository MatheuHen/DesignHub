import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ApiError } from '../../../lib/apiClient';
import { listSolicitacoes, SOLICITACAO_STATUSES, type Solicitacao, type SolicitacaoStatus } from './api';

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString('pt-BR');
}

function isSolicitacaoStatus(value: string): value is SolicitacaoStatus {
  return (SOLICITACAO_STATUSES as readonly string[]).includes(value);
}

/**
 * RF005/RN44/RN13-RN14: listagem/filtro das próprias solicitações do
 * designer. O filtro de status é refletido na URL (`?status=`) para que
 * outras telas (ex.: pendências no painel do designer, Fase 13) possam
 * criar links diretos para uma visão já filtrada.
 */
export function SolicitacoesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const statusParam = searchParams.get('status') ?? '';
  const [items, setItems] = useState<Solicitacao[]>([]);
  const [total, setTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState<SolicitacaoStatus | ''>(
    isSolicitacaoStatus(statusParam) ? statusParam : '',
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    setLoading(true);
    setError(null);
    listSolicitacoes({ status: statusFilter || undefined })
      .then((result) => {
        setItems(result.items);
        setTotal(result.total);
      })
      .catch((loadError: unknown) => {
        setError(
          loadError instanceof ApiError ? loadError.message : 'Não foi possível carregar as solicitações.',
        );
      })
      .finally(() => setLoading(false));
  }, [statusFilter]);

  useEffect(() => {
    reload();
  }, [reload]);

  return (
    <main className="admin-shell">
      <header className="admin-header">
        <div>
          <Link to="/designer">← Voltar</Link>
          <h1>Solicitações</h1>
        </div>
      </header>

      <div className="designer-filters">
        <label htmlFor="solicitacao-status-filter">Status</label>
        <select
          id="solicitacao-status-filter"
          value={statusFilter}
          onChange={(event) => {
            const value = event.target.value as SolicitacaoStatus | '';
            setStatusFilter(value);
            setSearchParams(value ? { status: value } : {});
          }}
        >
          <option value="">Todos</option>
          {SOLICITACAO_STATUSES.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>
      </div>

      {loading && <p role="status">Carregando solicitações…</p>}
      {error && (
        <p role="alert" className="auth-error">
          {error}
        </p>
      )}

      {!loading && !error && items.length === 0 && <p>Nenhuma solicitação encontrada.</p>}

      {!loading && !error && items.length > 0 && (
        <table className="designer-table">
          <caption className="sr-only">Lista de solicitações ({total} no total)</caption>
          <thead>
            <tr>
              <th scope="col">Cliente</th>
              <th scope="col">Tema</th>
              <th scope="col">Status</th>
              <th scope="col">Criada em</th>
              <th scope="col">Prazo 1ª versão</th>
              <th scope="col">Ações</th>
            </tr>
          </thead>
          <tbody>
            {items.map((solicitacao) => (
              <tr key={solicitacao.id}>
                <td>{solicitacao.clienteNome}</td>
                <td>{solicitacao.tema ?? '—'}</td>
                <td>{solicitacao.status}</td>
                <td>{formatDate(solicitacao.dataCriacao)}</td>
                <td>{formatDate(solicitacao.prazoPrimeiraVersao)}</td>
                <td className="designer-actions">
                  <Link to={`/designer/solicitacoes/${solicitacao.id}`}>Ver detalhes</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
