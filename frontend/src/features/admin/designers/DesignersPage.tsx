import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AppShell } from '../../../app/AppShell';
import { ApiError } from '../../../lib/apiClient';
import { statusSlug } from '../../../lib/statusStyle';
import { SOLICITACAO_STATUSES, type Solicitacao, type SolicitacaoStatus } from '../../designer/solicitacoes/api';
import {
  createDesigner,
  deleteDesigner,
  listDesigners,
  listSolicitacoesAdmin,
  reassignSolicitacao,
  setDesignerStatus,
  updateDesigner,
  type Designer,
} from './api';
import { DesignerFormPanel, type CreateFormValues, type EditFormValues } from './DesignerFormPanel';

type PanelState = { mode: 'closed' } | { mode: 'create' } | { mode: 'edit'; designer: Designer };

/** Solicitações ainda em andamento fazem sentido para reatribuir (RF016/RN47). */
const REATRIBUIVEIS = new Set(['Em produção', 'Enviado para avaliação', 'Ajustes', 'Aprovado', 'Agendado']);

/** RF001/RF015/RF016: gerenciamento de designers e reatribuição de solicitações pelo Administrador. */
export function DesignersPage() {
  const [items, setItems] = useState<Designer[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ativo' | 'inativo' | ''>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [panel, setPanel] = useState<PanelState>({ mode: 'closed' });
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<{ id: string; message: string } | null>(null);

  const [solicitacoes, setSolicitacoes] = useState<Solicitacao[]>([]);
  const [solicitacoesLoading, setSolicitacoesLoading] = useState(true);
  const [reatribuindoId, setReatribuindoId] = useState<number | null>(null);
  const [novoDesignerId, setNovoDesignerId] = useState('');
  const [reatribuirSaving, setReatribuirSaving] = useState(false);
  const [reatribuirError, setReatribuirError] = useState<string | null>(null);

  /** QUADRO 59 (RF016): filtros da listagem de solicitações atribuídas — Designer atual, Cliente, Status. */
  const [solicDesignerFilter, setSolicDesignerFilter] = useState('');
  const [solicDesignerSearchText, setSolicDesignerSearchText] = useState('');
  const [solicClienteFilter, setSolicClienteFilter] = useState('');
  const [solicStatusFilter, setSolicStatusFilter] = useState<SolicitacaoStatus | ''>('');

  const reload = useCallback(() => {
    setLoading(true);
    setError(null);
    listDesigners({ search: search || undefined, status: statusFilter || undefined })
      .then((result) => {
        setItems(result.items);
        setTotal(result.total);
      })
      .catch((loadError: unknown) => {
        setError(
          loadError instanceof ApiError
            ? loadError.message
            : 'Não foi possível carregar os designers.',
        );
      })
      .finally(() => setLoading(false));
  }, [search, statusFilter]);

  const reloadSolicitacoes = useCallback(() => {
    setSolicitacoesLoading(true);
    listSolicitacoesAdmin({
      status: solicStatusFilter || undefined,
      idDesigner: solicDesignerFilter || undefined,
      clienteNome: solicClienteFilter || undefined,
    })
      .then((result) => setSolicitacoes(result.items))
      .catch(() => setSolicitacoes([]))
      .finally(() => setSolicitacoesLoading(false));
  }, [solicStatusFilter, solicDesignerFilter, solicClienteFilter]);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    reloadSolicitacoes();
  }, [reloadSolicitacoes]);

  const designerNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const designer of items) map.set(designer.id, designer.nomeCompleto);
    return map;
  }, [items]);

  async function handleCreate(values: CreateFormValues) {
    await createDesigner(values);
    setPanel({ mode: 'closed' });
    reload();
  }

  async function handleEdit(designer: Designer, values: EditFormValues) {
    await updateDesigner(designer.id, {
      nomeCompleto: values.nomeCompleto,
      whatsapp: values.whatsapp,
      statusOperacional: values.statusOperacional || null,
    });
    setPanel({ mode: 'closed' });
    reload();
  }

  function handleToggleStatus(designer: Designer) {
    const nextStatus = designer.status === 'ativo' ? 'inativo' : 'ativo';
    setRowError(null);
    setDesignerStatus(designer.id, nextStatus)
      .then(() => reload())
      .catch((toggleError: unknown) => {
        setRowError({
          id: designer.id,
          message: toggleError instanceof ApiError ? toggleError.message : 'Não foi possível atualizar o status.',
        });
      });
  }

  function handleDelete(designer: Designer) {
    setRowError(null);
    deleteDesigner(designer.id)
      .then(() => {
        setConfirmingDeleteId(null);
        reload();
      })
      .catch((deleteError: unknown) => {
        setConfirmingDeleteId(null);
        setRowError({
          id: designer.id,
          message:
            deleteError instanceof ApiError
              ? deleteError.message
              : 'Não foi possível excluir o designer.',
        });
      });
  }

  function handleConfirmarReatribuicao(solicitacao: Solicitacao) {
    if (!novoDesignerId) return;
    setReatribuirSaving(true);
    setReatribuirError(null);
    reassignSolicitacao(solicitacao.id, novoDesignerId)
      .then(() => {
        setReatribuindoId(null);
        setNovoDesignerId('');
        reloadSolicitacoes();
      })
      .catch((reassignError: unknown) => {
        setReatribuirError(
          reassignError instanceof ApiError ? reassignError.message : 'Não foi possível reatribuir a solicitação.',
        );
      })
      .finally(() => setReatribuirSaving(false));
  }

  return (
    <AppShell>
      <div className="page-header">
        <div>
          <h1>Listagem e Manutenção de Designers</h1>
          <p>Administrar, acompanhar designers e reatribuir solicitações mantendo histórico.</p>
        </div>
        <button type="button" className="page-primary-action" onClick={() => setPanel({ mode: 'create' })}>
          + Novo Designer
        </button>
      </div>

      <div className="designer-filters">
        <label htmlFor="designer-search">Buscar</label>
        <input
          id="designer-search"
          placeholder="Nome ou e-mail"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />

        <label htmlFor="designer-status-filter">Status</label>
        <select
          id="designer-status-filter"
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value as 'ativo' | 'inativo' | '')}
        >
          <option value="">Todos</option>
          <option value="ativo">Ativo</option>
          <option value="inativo">Inativo</option>
        </select>
      </div>

      {loading && <p role="status">Carregando designers…</p>}
      {error && (
        <p role="alert" className="auth-error">
          {error}
        </p>
      )}

      {!loading && !error && items.length === 0 && <p>Nenhum designer encontrado.</p>}

      {!loading && !error && items.length > 0 && (
        <table className="designer-table">
          <caption className="sr-only">Lista de designers ({total} no total)</caption>
          <thead>
            <tr>
              <th scope="col">Nome</th>
              <th scope="col">E-mail</th>
              <th scope="col">WhatsApp</th>
              <th scope="col">Status</th>
              <th scope="col">Ações</th>
            </tr>
          </thead>
          <tbody>
            {items.map((designer) => (
              <tr key={designer.id}>
                <td>{designer.nomeCompleto}</td>
                <td>{designer.email}</td>
                <td>{designer.whatsapp ?? '—'}</td>
                <td>
                  <span className={`designer-status designer-status--${designer.status}`}>
                    {designer.status === 'ativo' ? 'Ativo' : 'Inativo'}
                  </span>
                  {designer.bloqueado && <span className="designer-blocked"> (bloqueado por atraso)</span>}
                </td>
                <td className="designer-actions">
                  <button type="button" onClick={() => setPanel({ mode: 'edit', designer })}>
                    Editar
                  </button>
                  <button type="button" onClick={() => handleToggleStatus(designer)}>
                    {designer.status === 'ativo' ? 'Inativar' : 'Ativar'}
                  </button>
                  {confirmingDeleteId === designer.id ? (
                    <>
                      <button type="button" onClick={() => handleDelete(designer)}>
                        Confirmar exclusão
                      </button>
                      <button type="button" onClick={() => setConfirmingDeleteId(null)}>
                        Cancelar
                      </button>
                    </>
                  ) : (
                    <button type="button" onClick={() => setConfirmingDeleteId(designer.id)}>
                      Excluir
                    </button>
                  )}
                  {rowError?.id === designer.id && (
                    <p role="alert" className="auth-error">
                      {rowError.message}
                    </p>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {panel.mode === 'create' && (
        <DesignerFormPanel
          mode="create"
          onSubmit={handleCreate}
          onCancel={() => setPanel({ mode: 'closed' })}
        />
      )}

      {panel.mode === 'edit' && (
        <DesignerFormPanel
          mode="edit"
          designer={panel.designer}
          onSubmit={(values) => handleEdit(panel.designer, values)}
          onCancel={() => setPanel({ mode: 'closed' })}
        />
      )}

      <section aria-labelledby="reatribuicao-title" style={{ marginTop: 32 }}>
        <h2 id="reatribuicao-title">Solicitações atribuídas</h2>
        <p>Selecione uma solicitação e escolha outro designer responsável.</p>

        <div className="designer-filters">
          <label htmlFor="solic-designer-filter">Designer atual</label>
          <input
            id="solic-designer-filter"
            list="solic-designer-options"
            placeholder="Todos (digite para buscar)"
            value={solicDesignerSearchText}
            onChange={(event) => {
              const text = event.target.value;
              setSolicDesignerSearchText(text);
              if (!text.trim()) {
                setSolicDesignerFilter('');
                return;
              }
              const match = items.find(
                (designer) => designer.nomeCompleto.toLowerCase() === text.trim().toLowerCase(),
              );
              if (match) setSolicDesignerFilter(match.id);
            }}
          />
          <datalist id="solic-designer-options">
            {items.map((designer) => (
              <option key={designer.id} value={designer.nomeCompleto} />
            ))}
          </datalist>

          <label htmlFor="solic-cliente-filter">Cliente</label>
          <input
            id="solic-cliente-filter"
            placeholder="Nome do cliente"
            value={solicClienteFilter}
            onChange={(event) => setSolicClienteFilter(event.target.value)}
          />

          <label htmlFor="solic-status-filter">Status</label>
          <select
            id="solic-status-filter"
            value={solicStatusFilter}
            onChange={(event) => setSolicStatusFilter(event.target.value as SolicitacaoStatus | '')}
          >
            <option value="">Todos</option>
            {SOLICITACAO_STATUSES.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </div>

        {solicitacoesLoading && <p role="status">Carregando solicitações…</p>}
        {!solicitacoesLoading && solicitacoes.length === 0 && <p>Nenhuma solicitação encontrada.</p>}

        {!solicitacoesLoading && solicitacoes.length > 0 && (
          <table className="designer-table">
            <caption className="sr-only">Solicitações atribuídas aos designers</caption>
            <thead>
              <tr>
                <th scope="col">Cliente</th>
                <th scope="col">Solicitação</th>
                <th scope="col">Status</th>
                <th scope="col">Designer atual</th>
                <th scope="col">Ações</th>
              </tr>
            </thead>
            <tbody>
              {solicitacoes.map((solicitacao) => (
                <tr key={solicitacao.id}>
                  <td>{solicitacao.clienteNome}</td>
                  <td>#{solicitacao.id}</td>
                  <td>
                    <span className={`status-badge status-badge--${statusSlug(solicitacao.status)}`}>
                      {solicitacao.status}
                    </span>
                  </td>
                  <td>{designerNameById.get(solicitacao.idDesigner) ?? solicitacao.idDesigner}</td>
                  <td className="designer-actions">
                    <Link to={`/admin/solicitacoes/${solicitacao.id}`}>Consultar</Link>{' '}
                    {!REATRIBUIVEIS.has(solicitacao.status) ? null : reatribuindoId === solicitacao.id ? (
                      <>
                        <select
                          aria-label={`Novo designer para a solicitação de ${solicitacao.clienteNome}`}
                          value={novoDesignerId}
                          onChange={(event) => setNovoDesignerId(event.target.value)}
                        >
                          <option value="">Selecione…</option>
                          {items
                            .filter((designer) => designer.status === 'ativo' && designer.id !== solicitacao.idDesigner)
                            .map((designer) => (
                              <option key={designer.id} value={designer.id}>
                                {designer.nomeCompleto}
                              </option>
                            ))}
                        </select>
                        <button
                          type="button"
                          disabled={!novoDesignerId || reatribuirSaving}
                          onClick={() => handleConfirmarReatribuicao(solicitacao)}
                        >
                          {reatribuirSaving ? 'Confirmando…' : 'Confirmar'}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setReatribuindoId(null);
                            setNovoDesignerId('');
                            setReatribuirError(null);
                          }}
                        >
                          Cancelar
                        </button>
                      </>
                    ) : (
                      <button type="button" onClick={() => setReatribuindoId(solicitacao.id)}>
                        Reatribuir
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {reatribuirError && (
          <p role="alert" className="auth-error">
            {reatribuirError}
          </p>
        )}
      </section>
    </AppShell>
  );
}
