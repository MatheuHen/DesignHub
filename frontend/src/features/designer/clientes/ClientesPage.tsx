import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError } from '../../../lib/apiClient';
import {
  createCliente,
  deleteCliente,
  iniciarAtendimento,
  listClientes,
  updateCliente,
  type Cliente,
} from './api';
import { ClienteFormPanel, type ClienteFormValues } from './ClienteFormPanel';

type PanelState = { mode: 'closed' } | { mode: 'create' } | { mode: 'edit'; cliente: Cliente };

/** RF003: gerenciamento dos próprios clientes pelo Designer. */
export function ClientesPage() {
  const [items, setItems] = useState<Cliente[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [panel, setPanel] = useState<PanelState>({ mode: 'closed' });
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<number | null>(null);
  const [rowError, setRowError] = useState<{ id: number; message: string } | null>(null);
  const [atendimentoFeedback, setAtendimentoFeedback] = useState<
    { id: number; type: 'success' | 'error'; message: string } | null
  >(null);
  const [startingAtendimentoId, setStartingAtendimentoId] = useState<number | null>(null);

  const reload = useCallback(() => {
    setLoading(true);
    setError(null);
    listClientes({ search: search || undefined })
      .then((result) => {
        setItems(result.items);
        setTotal(result.total);
      })
      .catch((loadError: unknown) => {
        setError(
          loadError instanceof ApiError ? loadError.message : 'Não foi possível carregar os clientes.',
        );
      })
      .finally(() => setLoading(false));
  }, [search]);

  useEffect(() => {
    reload();
  }, [reload]);

  async function handleCreate(values: ClienteFormValues) {
    await createCliente({
      nome: values.nome,
      whatsapp: values.whatsapp,
      instagram: values.instagram || undefined,
    });
    setPanel({ mode: 'closed' });
    reload();
  }

  async function handleEdit(cliente: Cliente, values: ClienteFormValues) {
    await updateCliente(cliente.id, {
      nome: values.nome,
      whatsapp: values.whatsapp,
      instagram: values.instagram || null,
    });
    setPanel({ mode: 'closed' });
    reload();
  }

  function handleDelete(cliente: Cliente) {
    setRowError(null);
    deleteCliente(cliente.id)
      .then(() => {
        setConfirmingDeleteId(null);
        reload();
      })
      .catch((deleteError: unknown) => {
        setConfirmingDeleteId(null);
        setRowError({
          id: cliente.id,
          message: deleteError instanceof ApiError ? deleteError.message : 'Não foi possível excluir o cliente.',
        });
      });
  }

  function handleIniciarAtendimento(cliente: Cliente) {
    setAtendimentoFeedback(null);
    setStartingAtendimentoId(cliente.id);
    iniciarAtendimento(cliente.id)
      .then(() => {
        setAtendimentoFeedback({
          id: cliente.id,
          type: 'success',
          message: 'Atendimento iniciado — primeira pergunta enviada por WhatsApp.',
        });
      })
      .catch((startError: unknown) => {
        setAtendimentoFeedback({
          id: cliente.id,
          type: 'error',
          message:
            startError instanceof ApiError
              ? startError.message
              : 'Não foi possível iniciar o atendimento.',
        });
      })
      .finally(() => setStartingAtendimentoId(null));
  }

  return (
    <main className="admin-shell">
      <header className="admin-header">
        <div>
          <Link to="/designer">← Voltar</Link>
          <h1>Clientes</h1>
        </div>
        <button type="button" onClick={() => setPanel({ mode: 'create' })}>
          Novo cliente
        </button>
      </header>

      <div className="designer-filters">
        <label htmlFor="cliente-search">Buscar</label>
        <input
          id="cliente-search"
          placeholder="Nome ou WhatsApp"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>

      {loading && <p role="status">Carregando clientes…</p>}
      {error && (
        <p role="alert" className="auth-error">
          {error}
        </p>
      )}

      {!loading && !error && items.length === 0 && <p>Nenhum cliente encontrado.</p>}

      {!loading && !error && items.length > 0 && (
        <table className="designer-table">
          <caption className="sr-only">Lista de clientes ({total} no total)</caption>
          <thead>
            <tr>
              <th scope="col">Nome</th>
              <th scope="col">WhatsApp</th>
              <th scope="col">Instagram</th>
              <th scope="col">Ações</th>
            </tr>
          </thead>
          <tbody>
            {items.map((cliente) => (
              <tr key={cliente.id}>
                <td>{cliente.nome}</td>
                <td>{cliente.whatsapp}</td>
                <td>{cliente.instagram ?? '—'}</td>
                <td className="designer-actions">
                  <button
                    type="button"
                    onClick={() => handleIniciarAtendimento(cliente)}
                    disabled={startingAtendimentoId === cliente.id}
                  >
                    {startingAtendimentoId === cliente.id ? 'Enviando…' : 'Iniciar atendimento'}
                  </button>
                  <button type="button" onClick={() => setPanel({ mode: 'edit', cliente })}>
                    Editar
                  </button>
                  {confirmingDeleteId === cliente.id ? (
                    <>
                      <button type="button" onClick={() => handleDelete(cliente)}>
                        Confirmar exclusão
                      </button>
                      <button type="button" onClick={() => setConfirmingDeleteId(null)}>
                        Cancelar
                      </button>
                    </>
                  ) : (
                    <button type="button" onClick={() => setConfirmingDeleteId(cliente.id)}>
                      Excluir
                    </button>
                  )}
                  {rowError?.id === cliente.id && (
                    <p role="alert" className="auth-error">
                      {rowError.message}
                    </p>
                  )}
                  {atendimentoFeedback?.id === cliente.id && (
                    <p
                      role={atendimentoFeedback.type === 'error' ? 'alert' : 'status'}
                      className={atendimentoFeedback.type === 'error' ? 'auth-error' : 'atendimento-success'}
                    >
                      {atendimentoFeedback.message}
                    </p>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {panel.mode === 'create' && (
        <ClienteFormPanel mode="create" onSubmit={handleCreate} onCancel={() => setPanel({ mode: 'closed' })} />
      )}

      {panel.mode === 'edit' && (
        <ClienteFormPanel
          mode="edit"
          cliente={panel.cliente}
          onSubmit={(values) => handleEdit(panel.cliente, values)}
          onCancel={() => setPanel({ mode: 'closed' })}
        />
      )}
    </main>
  );
}
