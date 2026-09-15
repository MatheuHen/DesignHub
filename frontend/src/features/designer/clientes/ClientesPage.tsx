import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AppShell } from '../../../app/AppShell';
import { ApiError } from '../../../lib/apiClient';
import {
  createCliente,
  deleteCliente,
  desconectarInstagram,
  getInstagramAuthorizeUrl,
  getInstagramStatus,
  iniciarAtendimento,
  listClientes,
  updateCliente,
  type Cliente,
  type InstagramStatus,
} from './api';
import { ClienteFormPanel, type ClienteFormValues } from './ClienteFormPanel';

type PanelState = { mode: 'closed' } | { mode: 'create' } | { mode: 'edit'; cliente: Cliente };

/** RF003: gerenciamento dos próprios clientes pelo Designer. */
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
  const [atendimentoFeedback, setAtendimentoFeedback] = useState<
    { id: number; type: 'success' | 'error'; message: string } | null
  >(null);
  const [startingAtendimentoId, setStartingAtendimentoId] = useState<number | null>(null);

  const [instagramStatus, setInstagramStatus] = useState<Record<number, InstagramStatus>>({});
  const [connectingInstagramId, setConnectingInstagramId] = useState<number | null>(null);
  const [instagramFeedback, setInstagramFeedback] = useState<
    { id: number; type: 'success' | 'error'; message: string } | null
  >(null);
  const [searchParams, setSearchParams] = useSearchParams();

  // Auditoria (achado MEDIUM — N+1 + ausência de debounce): sem isso, cada
  // tecla digitada disparava `listClientes` + 1 chamada de status do
  // Instagram por cliente retornado. O debounce reduz drasticamente o
  // volume de requisições; o `latestRequestIdRef` descarta respostas de uma
  // busca antiga que chegam fora de ordem (mesmo padrão de `DesignerHome`).
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
        if (latestRequestIdRef.current !== requestId) return undefined;
        setItems(result.items);
        setTotal(result.total);
        return Promise.all(
          result.items.map((cliente) =>
            getInstagramStatus(cliente.id)
              .then((status) => [cliente.id, status] as const)
              .catch(() => [cliente.id, { conectado: false, conectadoEm: null, expiraEm: null }] as const),
          ),
        );
      })
      .then((entries) => {
        if (entries && latestRequestIdRef.current === requestId) setInstagramStatus(Object.fromEntries(entries));
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

  /** RF014/ADR 0005: volta do fluxo OAuth do Instagram (redirect do backend após aprovação/erro na Meta). */
  useEffect(() => {
    const resultado = searchParams.get('instagram');
    if (resultado === 'conectado') {
      setInstagramFeedback({ id: -1, type: 'success', message: 'Instagram conectado com sucesso.' });
      reload();
    } else if (resultado === 'erro') {
      setInstagramFeedback({
        id: -1,
        type: 'error',
        message: 'Não foi possível conectar o Instagram. Tente novamente.',
      });
    }
    if (resultado) {
      const next = new URLSearchParams(searchParams);
      next.delete('instagram');
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleConectarInstagram(cliente: Cliente) {
    setInstagramFeedback(null);
    setConnectingInstagramId(cliente.id);
    getInstagramAuthorizeUrl(cliente.id)
      .then(({ url }) => {
        window.location.href = url;
      })
      .catch((connectError: unknown) => {
        setInstagramFeedback({
          id: cliente.id,
          type: 'error',
          message:
            connectError instanceof ApiError ? connectError.message : 'Não foi possível iniciar a conexão com o Instagram.',
        });
        setConnectingInstagramId(null);
      });
  }

  function handleDesconectarInstagram(cliente: Cliente) {
    setInstagramFeedback(null);
    setConnectingInstagramId(cliente.id);
    desconectarInstagram(cliente.id)
      .then(() => {
        setInstagramFeedback({ id: cliente.id, type: 'success', message: 'Instagram desconectado.' });
        reload();
      })
      .catch((disconnectError: unknown) => {
        setInstagramFeedback({
          id: cliente.id,
          type: 'error',
          message:
            disconnectError instanceof ApiError ? disconnectError.message : 'Não foi possível desconectar o Instagram.',
        });
      })
      .finally(() => setConnectingInstagramId(null));
  }

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
    <AppShell>
      <div className="page-header">
        <h1>Clientes</h1>
        <button type="button" className="page-primary-action" onClick={() => setPanel({ mode: 'create' })}>
          + Novo Cliente
        </button>
      </div>

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

      {instagramFeedback?.id === -1 && (
        <p
          role={instagramFeedback.type === 'error' ? 'alert' : 'status'}
          className={instagramFeedback.type === 'error' ? 'auth-error' : 'atendimento-success'}
        >
          {instagramFeedback.message}
        </p>
      )}

      {!loading && !error && items.length === 0 && <p>Nenhum cliente encontrado.</p>}

      {!loading && !error && items.length > 0 && (
        <div className="table-scroll">
        <table className="designer-table">
          <caption className="sr-only">Lista de clientes ({total} no total)</caption>
          <thead>
            <tr>
              <th scope="col">Nome</th>
              <th scope="col">WhatsApp</th>
              <th scope="col">Instagram</th>
              <th scope="col">Publicação automática</th>
              <th scope="col">Ações</th>
            </tr>
          </thead>
          <tbody>
            {items.map((cliente) => (
              <tr key={cliente.id}>
                <td>{cliente.nome}</td>
                <td>{cliente.whatsapp}</td>
                <td>{cliente.instagram ?? '—'}</td>
                <td>
                  {instagramStatus[cliente.id]?.conectado ? (
                    <>
                      <span>Conectado</span>{' '}
                      <button
                        type="button"
                        onClick={() => handleDesconectarInstagram(cliente)}
                        disabled={connectingInstagramId === cliente.id}
                      >
                        Desconectar
                      </button>
                    </>
                  ) : (
                    <>
                      <span>Não conectado</span>{' '}
                      <button
                        type="button"
                        onClick={() => handleConectarInstagram(cliente)}
                        disabled={connectingInstagramId === cliente.id}
                      >
                        {connectingInstagramId === cliente.id ? 'Conectando…' : 'Conectar Instagram'}
                      </button>
                    </>
                  )}
                  {instagramFeedback?.id === cliente.id && (
                    <p
                      role={instagramFeedback.type === 'error' ? 'alert' : 'status'}
                      className={instagramFeedback.type === 'error' ? 'auth-error' : 'atendimento-success'}
                    >
                      {instagramFeedback.message}
                    </p>
                  )}
                </td>
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
        </div>
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
    </AppShell>
  );
}
