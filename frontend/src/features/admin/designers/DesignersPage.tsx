import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AppShell } from '../../../app/AppShell';
import { ApiError } from '../../../lib/apiClient';
import { statusSlug } from '../../../lib/statusStyle';
import { useAutoDismiss } from '../../../lib/useAutoDismiss';
import { SOLICITACAO_STATUSES, type Solicitacao, type SolicitacaoStatus } from '../../designer/solicitacoes/api';
import {
  createDesigner,
  listDesigners,
  listSolicitacoesAdmin,
  reassignSolicitacao,
  setDesignerStatus,
  updateDesigner,
  updateDesignerPassword,
  type Designer,
  type EstrategiaInativacao,
  type PendenciaDesigner,
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
  const [rowError, setRowError] = useState<{ id: string; message: string } | null>(null);
  // Correção de UX: aviso de erro (ex.: "possui clientes ou solicitações vinculados") some sozinho após 10s.
  useAutoDismiss(rowError, () => setRowError(null));
  const [excluindoId, setExcluindoId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [excluindoSaving, setExcluindoSaving] = useState(false);

  // Item 4 (rodada final): estratégia obrigatória para inativar designer com pendências.
  const [pendenciasPanel, setPendenciasPanel] = useState<{ designer: Designer; pendencias: PendenciaDesigner[] } | null>(
    null,
  );
  const [estrategiaSelecionada, setEstrategiaSelecionada] = useState<EstrategiaInativacao | ''>('');
  const [reatribuicoesPorSolicitacao, setReatribuicoesPorSolicitacao] = useState<Record<number, string>>({});
  const [pendenciasSaving, setPendenciasSaving] = useState(false);
  const [pendenciasError, setPendenciasError] = useState<string | null>(null);

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

  /**
   * Auditoria (achado MEDIUM — falha parcial silenciosa): nome/WhatsApp são
   * persistidos primeiro; se a troca de senha falhar em seguida, o erro
   * deixa claro que os dados básicos já foram salvos (em vez da mensagem
   * genérica de senha), e a listagem é recarregada imediatamente para
   * refletir o estado real — não fica mostrando dados antigos como se nada
   * tivesse sido salvo.
   */
  async function handleEdit(designer: Designer, values: EditFormValues) {
    await updateDesigner(designer.id, {
      nomeCompleto: values.nomeCompleto,
      whatsapp: values.whatsapp,
    });
    reload();

    if (values.novaSenha) {
      try {
        await updateDesignerPassword(designer.id, values.novaSenha, values.confirmaSenha ?? '');
      } catch (passwordError) {
        const detail = passwordError instanceof Error ? passwordError.message : 'erro desconhecido';
        throw new Error(`Nome/WhatsApp já foram salvos. Falha ao atualizar a senha: ${detail}`);
      }
    }
    setPanel({ mode: 'closed' });
  }

  /**
   * Item 4 (rodada final): o backend rejeita a inativação direta com 409
   * `DESIGNER_PENDENCIAS` quando o designer possui solicitações em estado
   * não terminal — abre o painel de estratégia com a lista já devolvida pelo
   * backend (nunca uma segunda chamada para buscá-la de novo).
   */
  function abrirPainelPendenciasSeNecessario(designer: Designer, error: unknown): boolean {
    if (error instanceof ApiError && error.code === 'DESIGNER_PENDENCIAS') {
      const details = error.details as { pendencias?: PendenciaDesigner[] } | undefined;
      setPendenciasPanel({ designer, pendencias: details?.pendencias ?? [] });
      setEstrategiaSelecionada('');
      setReatribuicoesPorSolicitacao({});
      setPendenciasError(null);
      return true;
    }
    return false;
  }

  function handleToggleStatus(designer: Designer) {
    const nextStatus = designer.status === 'ativo' ? 'inativo' : 'ativo';
    setRowError(null);
    setTogglingId(designer.id);
    setDesignerStatus(designer.id, { status: nextStatus })
      .then(() => reload())
      .catch((toggleError: unknown) => {
        if (nextStatus === 'inativo' && abrirPainelPendenciasSeNecessario(designer, toggleError)) return;
        setRowError({
          id: designer.id,
          message: toggleError instanceof ApiError ? toggleError.message : 'Não foi possível atualizar o status.',
        });
      })
      .finally(() => setTogglingId(null));
  }

  /**
   * "Excluir" na interface é inativação lógica (não apaga o registro):
   * preserva histórico, clientes, solicitações, versões e publicações do
   * designer, e permite reativação futura pelo botão "Ativar".
   */
  function handleConfirmarExclusao(designer: Designer) {
    setExcluindoSaving(true);
    setRowError(null);
    setDesignerStatus(designer.id, { status: 'inativo' })
      .then(() => {
        setExcluindoId(null);
        reload();
      })
      .catch((deleteError: unknown) => {
        if (abrirPainelPendenciasSeNecessario(designer, deleteError)) {
          setExcluindoId(null);
          return;
        }
        setRowError({
          id: designer.id,
          message: deleteError instanceof ApiError ? deleteError.message : 'Não foi possível excluir o designer.',
        });
      })
      .finally(() => setExcluindoSaving(false));
  }

  /** Item 4 (rodada final): aplica a estratégia escolhida (backend valida e inativa atomicamente). */
  function handleConfirmarEstrategia() {
    if (!pendenciasPanel || !estrategiaSelecionada) return;

    if (estrategiaSelecionada === 'reatribuir_pendentes') {
      const semDestino = pendenciasPanel.pendencias.some((p) => !reatribuicoesPorSolicitacao[p.idSolicitacao]);
      if (semDestino) {
        setPendenciasError('Selecione um novo designer para todas as solicitações pendentes.');
        return;
      }
    }

    setPendenciasSaving(true);
    setPendenciasError(null);
    setDesignerStatus(pendenciasPanel.designer.id, {
      status: 'inativo',
      estrategia: estrategiaSelecionada,
      ...(estrategiaSelecionada === 'reatribuir_pendentes'
        ? {
            reatribuicoes: pendenciasPanel.pendencias.map((p) => ({
              idSolicitacao: p.idSolicitacao,
              novoDesignerId: reatribuicoesPorSolicitacao[p.idSolicitacao]!,
            })),
          }
        : {}),
    })
      .then(() => {
        setPendenciasPanel(null);
        reload();
        reloadSolicitacoes();
      })
      .catch((confirmError: unknown) => {
        setPendenciasError(
          confirmError instanceof ApiError ? confirmError.message : 'Não foi possível concluir a inativação.',
        );
      })
      .finally(() => setPendenciasSaving(false));
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
        <div className="table-scroll">
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
                  {designer.status === 'inativo' && (
                    <button
                      type="button"
                      onClick={() => handleToggleStatus(designer)}
                      disabled={togglingId === designer.id}
                    >
                      {togglingId === designer.id ? 'Atualizando…' : 'Ativar'}
                    </button>
                  )}
                  {designer.status === 'ativo' &&
                    (excluindoId === designer.id ? (
                      <>
                        <span role="alert">
                          Excluir {designer.nomeCompleto}? O designer será inativado (não apagado) e pode ser
                          reativado depois.
                        </span>
                        <button
                          type="button"
                          className="designer-action-danger"
                          disabled={excluindoSaving}
                          onClick={() => handleConfirmarExclusao(designer)}
                        >
                          {excluindoSaving ? 'Excluindo…' : 'Confirmar exclusão'}
                        </button>
                        <button type="button" disabled={excluindoSaving} onClick={() => setExcluindoId(null)}>
                          Cancelar
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        className="designer-action-danger"
                        onClick={() => {
                          setRowError(null);
                          setExcluindoId(designer.id);
                        }}
                      >
                        Excluir
                      </button>
                    ))}
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
        </div>
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

      {pendenciasPanel && (
        <div
          className="designer-form"
          role="alertdialog"
          aria-labelledby="pendencias-panel-title"
          style={{ marginTop: 24 }}
        >
          <h2 id="pendencias-panel-title">
            {pendenciasPanel.designer.nomeCompleto} possui solicitações pendentes
          </h2>
          <p>
            Escolha uma estratégia para a{pendenciasPanel.pendencias.length === 1 ? '' : 's'}{' '}
            {pendenciasPanel.pendencias.length} solicitaç{pendenciasPanel.pendencias.length === 1 ? 'ão' : 'ões'}{' '}
            pendente{pendenciasPanel.pendencias.length === 1 ? '' : 's'} antes de inativar este designer.
          </p>

          <div className="table-scroll">
            <table className="designer-table">
              <caption className="sr-only">
                Solicitações pendentes de {pendenciasPanel.designer.nomeCompleto}
              </caption>
              <thead>
                <tr>
                  <th scope="col">Cliente</th>
                  <th scope="col">Tema</th>
                  <th scope="col">Status</th>
                  <th scope="col">Situação</th>
                  {estrategiaSelecionada === 'reatribuir_pendentes' && <th scope="col">Novo designer</th>}
                </tr>
              </thead>
              <tbody>
                {pendenciasPanel.pendencias.map((pendencia) => (
                  <tr key={pendencia.idSolicitacao}>
                    <td>{pendencia.clienteNome}</td>
                    <td>{pendencia.tema ?? '—'}</td>
                    <td>
                      <span className={`status-badge status-badge--${statusSlug(pendencia.status)}`}>
                        {pendencia.status}
                      </span>
                    </td>
                    <td>{pendencia.atrasada ? 'Atrasada' : '—'}</td>
                    {estrategiaSelecionada === 'reatribuir_pendentes' && (
                      <td>
                        <select
                          aria-label={`Novo designer para a solicitação de ${pendencia.clienteNome}`}
                          value={reatribuicoesPorSolicitacao[pendencia.idSolicitacao] ?? ''}
                          onChange={(event) =>
                            setReatribuicoesPorSolicitacao((prev) => ({
                              ...prev,
                              [pendencia.idSolicitacao]: event.target.value,
                            }))
                          }
                        >
                          <option value="">Selecione…</option>
                          {items
                            .filter(
                              (designer) =>
                                designer.status === 'ativo' && designer.id !== pendenciasPanel.designer.id,
                            )
                            .map((designer) => (
                              <option key={designer.id} value={designer.id}>
                                {designer.nomeCompleto}
                              </option>
                            ))}
                        </select>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <fieldset className="designer-form-senha">
            <legend>Estratégia</legend>
            <label>
              <input
                type="radio"
                name="estrategia-inativacao"
                checked={estrategiaSelecionada === 'cancelar_pendentes'}
                onChange={() => setEstrategiaSelecionada('cancelar_pendentes')}
              />{' '}
              Cancelar todas as pendências e inativar
            </label>
            <label>
              <input
                type="radio"
                name="estrategia-inativacao"
                checked={estrategiaSelecionada === 'reatribuir_pendentes'}
                onChange={() => setEstrategiaSelecionada('reatribuir_pendentes')}
              />{' '}
              Reatribuir cada pendência para outro designer ativo e inativar
            </label>
            <label>
              <input
                type="radio"
                name="estrategia-inativacao"
                checked={estrategiaSelecionada === 'inativar_mesmo_assim'}
                onChange={() => setEstrategiaSelecionada('inativar_mesmo_assim')}
              />{' '}
              Inativar mesmo assim (pendências continuam visíveis para ação posterior)
            </label>
          </fieldset>

          {pendenciasError && (
            <p role="alert" className="auth-error">
              {pendenciasError}
            </p>
          )}

          <div className="designer-form-actions">
            <button type="button" onClick={() => setPendenciasPanel(null)} disabled={pendenciasSaving}>
              Cancelar
            </button>
            <button
              type="button"
              className="designer-action-danger"
              disabled={!estrategiaSelecionada || pendenciasSaving}
              onClick={handleConfirmarEstrategia}
            >
              {pendenciasSaving ? 'Aplicando…' : 'Confirmar'}
            </button>
          </div>
        </div>
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
          <div className="table-scroll">
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
          </div>
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
