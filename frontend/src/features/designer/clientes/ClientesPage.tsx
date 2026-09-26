import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AppShell } from '../../../app/AppShell';
import { ApiError } from '../../../lib/apiClient';
import { useAutoDismiss } from '../../../lib/useAutoDismiss';
import { INSTAGRAM_OAUTH_MESSAGE_SOURCE } from '../../instagram/oauthMessage';
import {
  createCliente,
  deleteCliente,
  desconectarInstagram,
  enviarLinkInstagram,
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

/** Mesmo breakpoint tablet/desktop já usado no restante do app (styles.css). */
const POPUP_VIEWPORT_QUERY = '(min-width: 861px)';

/** Abrir popup é confiável só em telas de notebook/desktop — mobile/tablet usa redirect de página inteira. */
function canUseOAuthPopup(): boolean {
  return typeof window !== 'undefined' && window.matchMedia(POPUP_VIEWPORT_QUERY).matches;
}

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
  const oauthPopupRef = useRef<Window | null>(null);
  const oauthPopupPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Correção de UX: avisos de erro/sucesso não ficam mais presos na tela —
  // somem sozinhos após 10s (o usuário pode repetir a ação para vê-los de novo).
  useAutoDismiss(rowError, () => setRowError(null));
  useAutoDismiss(atendimentoFeedback, () => setAtendimentoFeedback(null));
  useAutoDismiss(instagramFeedback, () => setInstagramFeedback(null));

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

  const applyInstagramOAuthResult = useCallback(
    (resultado: string) => {
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
      setConnectingInstagramId(null);
    },
    [reload],
  );

  function stopWatchingOAuthPopup() {
    if (oauthPopupPollRef.current) {
      clearInterval(oauthPopupPollRef.current);
      oauthPopupPollRef.current = null;
    }
    oauthPopupRef.current = null;
  }

  /**
   * RF014/ADR 0005 (rodada correções, item 5/12): esta página tem dois papéis
   * possíveis ao carregar com `?instagram=...` na URL: (a) é a aba original,
   * recebendo o resultado por `postMessage` do popup — caso comum em
   * desktop/notebook; ou (b) é a PRÓPRIA página que acabou de ser redirecionada
   * pelo backend após o callback da Meta (popup bloqueado pelo navegador ou
   * fallback de página inteira em mobile/tablet). Quando `window.opener`
   * aponta para outra janela, este documento é o popup: repassa o resultado
   * para quem abriu e se fecha, sem tentar recarregar sua própria listagem
   * (que vai desaparecer de qualquer forma).
   */
  useEffect(() => {
    const resultado = searchParams.get('instagram');
    if (!resultado) return;

    if (window.opener && window.opener !== window) {
      try {
        (window.opener as Window).postMessage({ source: INSTAGRAM_OAUTH_MESSAGE_SOURCE, resultado }, window.location.origin);
      } finally {
        window.close();
      }
      return;
    }

    applyInstagramOAuthResult(resultado);
    const next = new URLSearchParams(searchParams);
    next.delete('instagram');
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Recebe o resultado do popup de OAuth do Instagram quando ele se fecha sozinho (ver efeito acima). */
  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;
      const data = event.data as { source?: string; resultado?: string } | null;
      if (!data || data.source !== INSTAGRAM_OAUTH_MESSAGE_SOURCE || !data.resultado) return;
      stopWatchingOAuthPopup();
      applyInstagramOAuthResult(data.resultado);
    }
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [applyInstagramOAuthResult]);

  useEffect(() => stopWatchingOAuthPopup, []);

  function handleConectarInstagram(cliente: Cliente) {
    // Bug 2 (rodada correções): guarda contra clique duplo — evita gerar dois states
    // OAuth concorrentes e abrir dois popups para o mesmo cliente.
    if (connectingInstagramId !== null) return;
    setInstagramFeedback(null);
    setConnectingInstagramId(cliente.id);
    getInstagramAuthorizeUrl(cliente.id)
      .then(({ url }) => {
        if (canUseOAuthPopup()) {
          const popup = window.open(url, INSTAGRAM_OAUTH_MESSAGE_SOURCE, 'width=500,height=720');
          if (popup) {
            stopWatchingOAuthPopup();
            oauthPopupRef.current = popup;
            // Se o usuário fechar o popup manualmente sem concluir, destrava o botão.
            oauthPopupPollRef.current = setInterval(() => {
              if (oauthPopupRef.current?.closed) {
                stopWatchingOAuthPopup();
                setConnectingInstagramId(null);
              }
            }, 500);
            return;
          }
          // Popup bloqueado pelo navegador: cai no mesmo caminho de página inteira do mobile.
        }
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

  /** Item 4 (rodada correções Instagram): envia o link de conexão ao cliente via WhatsApp, sem exigir credenciais. */
  function handleEnviarLinkInstagram(cliente: Cliente) {
    if (connectingInstagramId !== null) return;
    setInstagramFeedback(null);
    setConnectingInstagramId(cliente.id);
    enviarLinkInstagram(cliente.id)
      .then((result) => {
        setInstagramFeedback({
          id: cliente.id,
          type: result.whatsappNotified ? 'success' : 'error',
          message: result.whatsappNotified
            ? 'Link de conexão enviado ao cliente via WhatsApp.'
            : `Não foi possível enviar via WhatsApp${result.whatsappError ? ` (${result.whatsappError})` : ''}. Copie e envie manualmente: ${result.url}`,
        });
      })
      .catch((sendError: unknown) => {
        setInstagramFeedback({
          id: cliente.id,
          type: 'error',
          message: sendError instanceof ApiError ? sendError.message : 'Não foi possível gerar o link de conexão.',
        });
      })
      .finally(() => setConnectingInstagramId(null));
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
    });
    setPanel({ mode: 'closed' });
    reload();
  }

  async function handleEdit(cliente: Cliente, values: ClienteFormValues) {
    await updateCliente(cliente.id, {
      nome: values.nome,
      whatsapp: values.whatsapp,
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
      <div className="designer-filters clientes-search">
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

      {!loading && !error && items.length === 0 && <p className="clientes-empty">Nenhum cliente encontrado.</p>}

      {!loading && !error && items.length > 0 && (
        <div className="table-scroll clientes-table-scroll">
        <table className="designer-table clientes-table">
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
                <td className="clientes-cell-nome">
                  <span className="clientes-nome-text" title={cliente.nome}>
                    {cliente.nome}
                  </span>
                </td>
                <td data-label="WhatsApp" className="clientes-cell-whatsapp">
                  {cliente.whatsapp}
                </td>
                <td data-label="Instagram">
                  {/* Item 9 (rodada correções): status real de conexão persistida — nunca o @ digitado manualmente. */}
                  <div className="cliente-instagram-cell">
                    {instagramStatus[cliente.id]?.conectado ? (
                      <>
                        <span className="cliente-instagram-status cliente-instagram-status--conectado">
                          Conectado
                        </span>
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
                        <span className="cliente-instagram-status cliente-instagram-status--nao-conectado">
                          Não conectado
                        </span>
                        <button
                          type="button"
                          onClick={() => handleConectarInstagram(cliente)}
                          disabled={connectingInstagramId !== null}
                        >
                          {connectingInstagramId === cliente.id ? 'Conectando…' : 'Conectar Instagram'}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleEnviarLinkInstagram(cliente)}
                          disabled={connectingInstagramId !== null}
                        >
                          Enviar link ao cliente
                        </button>
                      </>
                    )}
                  </div>
                  {instagramFeedback?.id === cliente.id && (
                    <p
                      role={instagramFeedback.type === 'error' ? 'alert' : 'status'}
                      className={instagramFeedback.type === 'error' ? 'auth-error' : 'atendimento-success'}
                    >
                      {instagramFeedback.message}
                    </p>
                  )}
                </td>
                <td className="designer-actions clientes-actions">
                  <div className="clientes-actions-primary">
                    <button
                      type="button"
                      className="clientes-action-primary"
                      onClick={() => handleIniciarAtendimento(cliente)}
                      disabled={startingAtendimentoId === cliente.id}
                    >
                      {startingAtendimentoId === cliente.id ? 'Enviando…' : 'Iniciar atendimento'}
                    </button>
                  </div>
                  <div className="clientes-actions-secondary">
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
                  </div>
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
