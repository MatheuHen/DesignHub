import { useCallback, useEffect, useRef, useState } from 'react';
import { AppShell } from '../../../app/AppShell';
import { ApiError } from '../../../lib/apiClient';
import { useAutoDismiss } from '../../../lib/useAutoDismiss';
import { createCliente, deleteCliente, listClientes, updateCliente, type Cliente } from './api';
import { ClienteFormPanel, type ClienteFormValues } from './ClienteFormPanel';

type PanelState = { mode: 'closed' } | { mode: 'create' } | { mode: 'edit'; cliente: Cliente };

/**
 * RF003 — aba Clientes: cadastro + listagem + CRUD completo (rodada de
 * correção da auditoria final). Editar/excluir e a busca por nome, WhatsApp
 * (com ou sem máscara) e Observação vivem exclusivamente aqui; o Dashboard
 * mantém só ações operacionais (iniciar atendimento, Instagram), sem
 * duplicar regra ou dado — usa a mesma API `listClientes`/`createCliente`/
 * `updateCliente`/`deleteCliente` já existente.
 */
export function ClientesPage() {
  const [items, setItems] = useState<Cliente[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [panel, setPanel] = useState<PanelState>({ mode: 'closed' });
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [rowError, setRowError] = useState<{ id: number; message: string } | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);

  useAutoDismiss(rowError, () => setRowError(null));
  useAutoDismiss(sucesso, () => setSucesso(null));

  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timeout);
  }, [search]);

  const latestRequestIdRef = useRef(0);

  const reload = useCallback(() => {
    const requestId = ++latestRequestIdRef.current;
    setLoading(true);
    setError(null);
    listClientes({ search: debouncedSearch || undefined })
      .then((result) => {
        if (latestRequestIdRef.current !== requestId) return;
        setItems(result.items);
        setTotal(result.total);
      })
      .catch((loadError: unknown) => {
        if (latestRequestIdRef.current !== requestId) return;
        setError(
          loadError instanceof ApiError ? loadError.message : 'Não foi possível carregar os clientes.',
        );
      })
      .finally(() => {
        if (latestRequestIdRef.current === requestId) setLoading(false);
      });
  }, [debouncedSearch]);

  useEffect(() => {
    reload();
  }, [reload]);

  async function handleCreate(values: ClienteFormValues) {
    const cliente = await createCliente({
      nome: values.nome,
      whatsapp: values.whatsapp,
      observacao: values.observacao.trim() || undefined,
    });
    setPanel({ mode: 'closed' });
    setSucesso(`Cliente "${cliente.nome}" cadastrado.`);
    reload();
  }

  async function handleEdit(cliente: Cliente, values: ClienteFormValues) {
    await updateCliente(cliente.id, {
      nome: values.nome,
      whatsapp: values.whatsapp,
      observacao: values.observacao.trim() || null,
    });
    setPanel({ mode: 'closed' });
    setSucesso(`Cliente "${values.nome}" atualizado.`);
    reload();
  }

  function handleDelete(cliente: Cliente) {
    setRowError(null);
    setDeletingId(cliente.id);
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
      })
      .finally(() => setDeletingId(null));
  }

  return (
    <AppShell>
      <div className="page-header">
        <h1>Clientes</h1>
        {panel.mode === 'closed' && (
          <button type="button" className="page-primary-action" onClick={() => setPanel({ mode: 'create' })}>
            + Novo Cliente
          </button>
        )}
      </div>

      {sucesso && (
        <p role="status" className="atendimento-success">
          {sucesso}
        </p>
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

      <div className="designer-filters clientes-search">
        <label htmlFor="cliente-search">Buscar</label>
        <input
          id="cliente-search"
          placeholder="Nome, WhatsApp ou Observação"
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

      {!loading && !error && items.length === 0 && <p className="clientes-empty">Nenhum cliente encontrado.</p>}

      {!loading && !error && items.length > 0 && (
        <div className="table-scroll clientes-table-scroll">
          <table className="designer-table clientes-table">
            <caption className="sr-only">Lista de clientes ({total} no total)</caption>
            <thead>
              <tr>
                <th scope="col">Nome</th>
                <th scope="col">WhatsApp</th>
                <th scope="col">Ações</th>
              </tr>
            </thead>
            <tbody>
              {items.map((cliente) => (
                <tr key={cliente.id}>
                  <td className="clientes-cell-nome">
                    <span className="clientes-nome-text" title={cliente.nome}>
                      {cliente.nome}
                    </span>
                    {cliente.observacao && (
                      <span className="clientes-observacao-text" title={cliente.observacao}>
                        {cliente.observacao}
                      </span>
                    )}
                  </td>
                  <td data-label="WhatsApp" className="clientes-cell-whatsapp">
                    {cliente.whatsapp}
                  </td>
                  <td className="designer-actions clientes-actions">
                    <button type="button" onClick={() => setPanel({ mode: 'edit', cliente })}>
                      Editar
                    </button>
                    {confirmingDeleteId === cliente.id ? (
                      <>
                        <button
                          type="button"
                          onClick={() => handleDelete(cliente)}
                          disabled={deletingId === cliente.id}
                        >
                          {deletingId === cliente.id ? 'Excluindo…' : 'Confirmar exclusão'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmingDeleteId(null)}
                          disabled={deletingId === cliente.id}
                        >
                          Cancelar
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        className="designer-action-danger"
                        onClick={() => setConfirmingDeleteId(cliente.id)}
                      >
                        Excluir
                      </button>
                    )}
                    {rowError?.id === cliente.id && (
                      <p role="alert" className="auth-error">
                        {rowError.message}
                      </p>
                    )}
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
