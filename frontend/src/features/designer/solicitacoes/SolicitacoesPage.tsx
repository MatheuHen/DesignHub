import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AppShell } from '../../../app/AppShell';
import { ApiError } from '../../../lib/apiClient';
import { statusSlug } from '../../../lib/statusStyle';
import { listClientes, type Cliente } from '../clientes/api';
import { listSolicitacoes, SOLICITACAO_STATUSES, type PrazoAtual, type Solicitacao, type SolicitacaoStatus } from './api';

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString('pt-BR');
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const RESPONSAVEL_LABEL: Record<NonNullable<PrazoAtual['responsavel']>, string> = {
  designer: 'Designer',
  cliente: 'Cliente',
  sistema: 'Sistema',
};

/** Mesma convenção visual (`prazo-tag--*`) já usada no Dashboard do Designer para prazos. */
function prazoAtualTag(dataHoraIso: string): { label: string; className: string } {
  const diffMs = new Date(dataHoraIso).getTime() - Date.now();
  if (diffMs < 0) return { label: 'Atrasado', className: 'prazo-tag--atrasado' };
  const diffDias = Math.floor(diffMs / 86_400_000);
  if (diffDias === 0) return { label: 'Vence hoje', className: 'prazo-tag--hoje' };
  return {
    label: `${diffDias} dia${diffDias === 1 ? '' : 's'} restante${diffDias === 1 ? '' : 's'}`,
    className: 'prazo-tag--ok',
  };
}

/**
 * Item 6/6.1/6.2 (rodada final): "Prazo para vencimento" reflete a etapa
 * ATUAL — nunca fica travado no prazo estático da 1ª versão depois que ela
 * já foi entregue. Etapas sem SLA de negócio documentado mostram
 * explicitamente "Sem prazo definido" em vez de inventar um valor.
 */
function PrazoAtualCell({ prazoAtual }: { prazoAtual: PrazoAtual }) {
  if (prazoAtual.tipo === 'terminal' || !prazoAtual.dataHora) {
    return <span className="prazo-atual-vazio">{prazoAtual.tipo === 'terminal' ? '—' : 'Sem prazo definido'}</span>;
  }

  const tag = prazoAtualTag(prazoAtual.dataHora);
  const rotulo = prazoAtual.tipo === 'validade_link_avaliacao' ? 'Link válido até' : null;

  return (
    <div className="prazo-atual-cell">
      {prazoAtual.responsavel && (
        <span className="prazo-atual-responsavel">{RESPONSAVEL_LABEL[prazoAtual.responsavel]}</span>
      )}
      <span>
        {rotulo ? `${rotulo} ` : ''}
        {formatDateTime(prazoAtual.dataHora)}
      </span>
      <span className={`prazo-tag ${tag.className}`}>{tag.label}</span>
    </div>
  );
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
    listSolicitacoes({
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
          loadError instanceof ApiError ? loadError.message : 'Não foi possível carregar as solicitações.',
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
        <h1>Solicitações</h1>
      </div>

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

        <label htmlFor="solicitacao-cliente-filter">Cliente</label>
        <select
          id="solicitacao-cliente-filter"
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

        <label htmlFor="solicitacao-data-inicio-filter">De</label>
        <input
          id="solicitacao-data-inicio-filter"
          type="date"
          value={dataInicioFilter}
          onChange={(event) => setDataInicioFilter(event.target.value)}
        />

        <label htmlFor="solicitacao-data-fim-filter">Até</label>
        <input
          id="solicitacao-data-fim-filter"
          type="date"
          value={dataFimFilter}
          onChange={(event) => setDataFimFilter(event.target.value)}
        />
      </div>

      {loading && <p role="status">Carregando solicitações…</p>}
      {error && (
        <p role="alert" className="auth-error">
          {error}
        </p>
      )}

      {!loading && !error && items.length === 0 && <p>Nenhuma solicitação encontrada.</p>}

      {!loading && !error && items.length > 0 && (
        <div className="table-scroll">
        <table className="designer-table">
          <caption className="sr-only">Lista de solicitações ({total} no total)</caption>
          <thead>
            <tr>
              <th scope="col">Cliente</th>
              <th scope="col">Tema</th>
              <th scope="col">Status</th>
              <th scope="col">Criada em</th>
              <th scope="col">Prazo para vencimento</th>
              <th scope="col">Ações</th>
            </tr>
          </thead>
          <tbody>
            {items.map((solicitacao) => (
              <tr key={solicitacao.id}>
                <td>{solicitacao.clienteNome}</td>
                <td>{solicitacao.tema ?? '—'}</td>
                <td>
                  <span className={`status-badge status-badge--${statusSlug(solicitacao.status)}`}>
                    {solicitacao.status}
                  </span>
                </td>
                <td>{formatDate(solicitacao.dataCriacao)}</td>
                <td>
                  <PrazoAtualCell prazoAtual={solicitacao.prazoAtual} />
                </td>
                <td className="designer-actions">
                  <Link to={`/designer/solicitacoes/${solicitacao.id}`}>Ver detalhes</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}
    </AppShell>
  );
}
