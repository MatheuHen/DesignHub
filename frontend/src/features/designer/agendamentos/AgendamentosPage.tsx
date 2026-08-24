import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AppShell } from '../../../app/AppShell';
import { ApiError } from '../../../lib/apiClient';
import { statusSlug } from '../../../lib/statusStyle';
import { listClientes, type Cliente } from '../clientes/api';
import { AGENDAMENTO_STATUSES, listAgendamentos, type Agendamento, type AgendamentoStatus } from './api';

function formatDate(value: string): string {
  return new Date(`${value}T00:00:00`).toLocaleDateString('pt-BR');
}

function formatHorario(value: string): string {
  return value.slice(0, 5);
}

/** RF012: listagem com filtros das publicações agendadas do designer. */
export function AgendamentosPage() {
  const [items, setItems] = useState<Agendamento[]>([]);
  const [total, setTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState<AgendamentoStatus | ''>('');
  const [clienteFilter, setClienteFilter] = useState('');
  const [dataInicioFilter, setDataInicioFilter] = useState('');
  const [dataFimFilter, setDataFimFilter] = useState('');
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listClientes({ pageSize: 100 })
      .then((result) => setClientes(result.items))
      .catch(() => setClientes([]));
  }, []);

  const reload = useCallback(() => {
    setLoading(true);
    setError(null);
    listAgendamentos({
      status: statusFilter || undefined,
      idCliente: clienteFilter ? Number(clienteFilter) : undefined,
      dataInicio: dataInicioFilter || undefined,
      dataFim: dataFimFilter || undefined,
    })
      .then((result) => {
        setItems(result.items);
        setTotal(result.total);
      })
      .catch((loadError: unknown) => {
        setError(
          loadError instanceof ApiError ? loadError.message : 'Não foi possível carregar os agendamentos.',
        );
      })
      .finally(() => setLoading(false));
  }, [statusFilter, clienteFilter, dataInicioFilter, dataFimFilter]);

  useEffect(() => {
    reload();
  }, [reload]);

  return (
    <AppShell>
      <div className="page-header">
        <h1>Publicações e agendamentos</h1>
      </div>

      <div className="designer-filters">
        <label htmlFor="agendamento-status-filter">Status</label>
        <select
          id="agendamento-status-filter"
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value as AgendamentoStatus | '')}
        >
          <option value="">Todos</option>
          {AGENDAMENTO_STATUSES.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>

        <label htmlFor="agendamento-cliente-filter">Cliente</label>
        <select
          id="agendamento-cliente-filter"
          value={clienteFilter}
          onChange={(event) => setClienteFilter(event.target.value)}
        >
          <option value="">Todos</option>
          {clientes.map((cliente) => (
            <option key={cliente.id} value={cliente.id}>
              {cliente.nome}
            </option>
          ))}
        </select>

        <label htmlFor="agendamento-data-inicio-filter">De</label>
        <input
          id="agendamento-data-inicio-filter"
          type="date"
          value={dataInicioFilter}
          onChange={(event) => setDataInicioFilter(event.target.value)}
        />

        <label htmlFor="agendamento-data-fim-filter">Até</label>
        <input
          id="agendamento-data-fim-filter"
          type="date"
          value={dataFimFilter}
          onChange={(event) => setDataFimFilter(event.target.value)}
        />
      </div>

      {loading && <p role="status">Carregando agendamentos…</p>}
      {error && (
        <p role="alert" className="auth-error">
          {error}
        </p>
      )}

      {!loading && !error && items.length === 0 && <p>Nenhum agendamento encontrado.</p>}

      {!loading && !error && items.length > 0 && (
        <table className="designer-table">
          <caption className="sr-only">Lista de agendamentos ({total} no total)</caption>
          <thead>
            <tr>
              <th scope="col">Cliente</th>
              <th scope="col">Tema</th>
              <th scope="col">Data</th>
              <th scope="col">Horário</th>
              <th scope="col">Legenda</th>
              <th scope="col">Status</th>
              <th scope="col">Ações</th>
            </tr>
          </thead>
          <tbody>
            {items.map((agendamento) => (
              <tr key={agendamento.idAgendamento}>
                <td>{agendamento.clienteNome}</td>
                <td>{agendamento.tema ?? '—'}</td>
                <td>{formatDate(agendamento.dataPublicacao)}</td>
                <td>{formatHorario(agendamento.horario)}</td>
                <td>{agendamento.legenda ?? '—'}</td>
                <td>
                  <span className={`status-badge status-badge--${statusSlug(agendamento.status)}`}>
                    {agendamento.status}
                  </span>
                </td>
                <td className="designer-actions">
                  <Link to={`/designer/solicitacoes/${agendamento.idSolicitacao}`}>Ver solicitação</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </AppShell>
  );
}
