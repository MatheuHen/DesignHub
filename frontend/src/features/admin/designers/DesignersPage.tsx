import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError } from '../../../lib/apiClient';
import {
  createDesigner,
  deleteDesigner,
  listDesigners,
  setDesignerStatus,
  updateDesigner,
  type Designer,
} from './api';
import { DesignerFormPanel, type CreateFormValues, type EditFormValues } from './DesignerFormPanel';

type PanelState = { mode: 'closed' } | { mode: 'create' } | { mode: 'edit'; designer: Designer };

/** RF001/RF015: gerenciamento de designers pelo Administrador. */
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

  useEffect(() => {
    reload();
  }, [reload]);

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

  return (
    <main className="admin-shell">
      <header className="admin-header">
        <div>
          <Link to="/admin">← Voltar</Link>
          <h1>Designers</h1>
        </div>
        <button type="button" onClick={() => setPanel({ mode: 'create' })}>
          Novo designer
        </button>
      </header>

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
                  {designer.bloqueado && <span className="designer-blocked"> (bloqueado — RF006)</span>}
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
    </main>
  );
}
