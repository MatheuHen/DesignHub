import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AppShell } from '../../app/AppShell';
import { ApiError } from '../../lib/apiClient';
import { statusSlug } from '../../lib/statusStyle';
import { listAgendamentos, type Agendamento } from './agendamentos/api';
import { useAuth } from '../auth/useAuth';
import { listClientes, type Cliente } from './clientes/api';
import { ClientesOperacionalPanel } from './clientes/ClientesOperacionalPanel';
import { NotificationsCta } from './notifications/NotificationsCta';
import { listSolicitacoes, SOLICITACAO_STATUSES, type Solicitacao, type SolicitacaoStatus } from './solicitacoes/api';

interface TileCount {
  status: SolicitacaoStatus;
  total: number;
}

/** Linha do acompanhamento: um cliente (RF003) + suas solicitações (RF005). */
interface AcompanhamentoRow {
  cliente: Cliente;
  solicitacoes: Solicitacao[];
}

/** Dias de antecedência para considerar um prazo "próximo" no Dashboard (RN11/RN12). */
const PRAZO_PROXIMO_DIAS = 5;

/**
 * RN11/RN12: status em que a entrega está com o designer e o prazo de 5 dias
 * do ciclo de versão corre. Espelha `STATUS_COM_PRAZO_DESIGNER` do backend
 * (`backend/src/domain/prazoCiclo.ts`) e o predicado de
 * `public.sync_designer_bloqueio`.
 */
const STATUS_COM_PRAZO_DESIGNER: readonly SolicitacaoStatus[] = ['Em produção', 'Ajustes'];

function prazoTag(prazoIso: string): { label: string; className: string } {
  const prazo = new Date(prazoIso);
  const hoje = new Date();
  const prazoDia = new Date(prazo.getFullYear(), prazo.getMonth(), prazo.getDate());
  const hojeDia = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  const diffDias = Math.round((prazoDia.getTime() - hojeDia.getTime()) / 86_400_000);

  if (diffDias < 0) {
    return { label: `${Math.abs(diffDias)} dia${Math.abs(diffDias) === 1 ? '' : 's'} de atraso`, className: 'prazo-tag--atrasado' };
  }
  if (diffDias === 0) {
    return { label: 'Hoje', className: 'prazo-tag--hoje' };
  }
  return { label: `Em ${diffDias} dia${diffDias === 1 ? '' : 's'}`, className: 'prazo-tag--ok' };
}

/**
 * Dashboard do Designer (RF005/RF011/RN13-RN14, FIGURA 7/15/22 do TFC):
 * 7 indicadores por status (dados reais da API de listagem, sem números
 * fixos) + tabela de prazos próximos derivada de `prazoPrimeiraVersao`
 * (RN11) das solicitações em que a entrega está com o designer
 * ("Em produção" e "Ajustes" — ver STATUS_COM_PRAZO_DESIGNER).
 */
export function DesignerHome() {
  const { profile, refreshProfile } = useAuth();

  // Item 5.1 (rodada final): recalcula `bloqueado` ao vivo toda vez que o
  // dashboard é aberto — não depende de logout/login nem de F5 para refletir
  // um bloqueio que começou (prazo venceu) ou terminou (versão enviada/
  // cancelamento) desde o último carregamento do perfil.
  useEffect(() => {
    void refreshProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [tiles, setTiles] = useState<TileCount[] | null>(null);
  const [emProducao, setEmProducao] = useState<Solicitacao[] | null>(null);
  const [agendamentos, setAgendamentos] = useState<Agendamento[] | null>(null);
  const [clientes, setClientes] = useState<Cliente[] | null>(null);
  const [todasSolicitacoes, setTodasSolicitacoes] = useState<Solicitacao[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    Promise.all([
      Promise.all(
        SOLICITACAO_STATUSES.map((status) =>
          listSolicitacoes({ status }).then((result) => ({
            status,
            total: result.total,
            items: result.items,
          })),
        ),
      ),
      // RN11/RN12: o prazo de 5 dias corre tanto na primeira versão
      // ('Em produção') quanto em cada versão seguinte ('Ajustes') — ambos
      // podem bloquear o designer, então ambos aparecem nos prazos próximos.
      Promise.all(STATUS_COM_PRAZO_DESIGNER.map((status) => listSolicitacoes({ status }))),
      listAgendamentos({ status: 'Agendado' }),
      // RF003: os clientes do próprio designer (mesma API da tela Clientes,
      // nenhuma fonte de dados nova) para o acompanhamento abaixo do CTA.
      listClientes({ pageSize: 100 }),
    ])
      .then(([tileResults, comPrazoResults, agendamentosResult, clientesResult]) => {
        if (cancelled) return;
        setTiles(tileResults.map(({ status, total }) => ({ status, total })));
        // Reaproveita exatamente as solicitações já carregadas para os tiles —
        // não existe requisição nem lógica de listagem adicional aqui.
        setTodasSolicitacoes(tileResults.flatMap((result) => result.items));
        setClientes(clientesResult.items);
        setEmProducao(
          [...comPrazoResults.flatMap((result) => result.items)].sort(
            (a, b) => new Date(a.prazoPrimeiraVersao).getTime() - new Date(b.prazoPrimeiraVersao).getTime(),
          ),
        );
        setAgendamentos(
          [...agendamentosResult.items].sort(
            (a, b) =>
              new Date(`${a.dataPublicacao}T${a.horario}`).getTime() -
              new Date(`${b.dataPublicacao}T${b.horario}`).getTime(),
          ),
        );
      })
      .catch((loadError: unknown) => {
        if (!cancelled) {
          setError(loadError instanceof ApiError ? loadError.message : 'Não foi possível carregar o dashboard.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * Acompanhamento do Dashboard: junta o cliente (RF003) às suas
   * solicitações/artes (RF005) em memória, a partir dos dados já carregados
   * acima. Clientes com solicitação aparecem primeiro, e dentro de cada
   * cliente a solicitação mais recente vem antes.
   */
  const acompanhamento = useMemo<AcompanhamentoRow[]>(() => {
    if (!clientes || !todasSolicitacoes) return [];
    const porCliente = new Map<number, Solicitacao[]>();
    for (const solicitacao of todasSolicitacoes) {
      const lista = porCliente.get(solicitacao.idCliente);
      if (lista) lista.push(solicitacao);
      else porCliente.set(solicitacao.idCliente, [solicitacao]);
    }
    return clientes
      .map((cliente) => ({
        cliente,
        solicitacoes: (porCliente.get(cliente.id) ?? []).sort(
          (a, b) => new Date(b.dataCriacao).getTime() - new Date(a.dataCriacao).getTime(),
        ),
      }))
      // Só clientes que já têm arte/solicitação — a listagem completa dos
      // clientes (inclusive sem solicitação) é o painel operacional acima.
      .filter((row) => row.solicitacoes.length > 0)
      .sort((a, b) => b.solicitacoes.length - a.solicitacoes.length);
  }, [clientes, todasSolicitacoes]);

  const prazosProximos = useMemo(() => {
    if (!emProducao) return [];
    const hoje = new Date();
    return emProducao.filter((solicitacao) => {
      const prazo = new Date(solicitacao.prazoPrimeiraVersao);
      const diffDias = (prazo.getTime() - hoje.getTime()) / 86_400_000;
      return diffDias <= PRAZO_PROXIMO_DIAS;
    });
  }, [emProducao]);

  return (
    <AppShell>
      <div className="page-header">
        <h1>Dashboard</h1>
        <NotificationsCta />
      </div>

      {profile?.bloqueado && (
        <p role="alert" className="auth-error dashboard-bloqueio-alert">
          Você está bloqueado para iniciar novos atendimentos: há uma solicitação com o prazo de
          entrega da versão vencido. Envie a versão pendente ou aguarde o cancelamento para
          ser desbloqueado.
        </p>
      )}

      {/* Item 4 (rodada UX): CTA principal fica no topo — o acompanhamento de
          atendimentos/artes/solicitações abaixo é o detalhe de apoio, não o
          primeiro gesto do Designer ao abrir o Dashboard. Correção de UX: o
          atendimento é iniciado por cliente dentro do próprio Dashboard (painel
          operacional "Clientes cadastrados" já renderizado abaixo); o CTA não
          navega mais para a aba Clientes — ele leva até esse painel. */}
      <a href="#clientes-operacional-title" className="dashboard-cta">
        Iniciar Atendimento
      </a>

      {loading && <p role="status">Carregando dashboard…</p>}

      {error && (
        <p role="alert" className="auth-error">
          {error}
        </p>
      )}

      {/*
        Ordem do Dashboard (rodada de correção visual): o acompanhamento de
        clientes/artes vem logo após o CTA, seguido de tiles de status +
        prazos próximos + publicações agendadas e, por último, do painel
        operacional de clientes cadastrados. Nenhum dado, filtro, ação ou
        comportamento foi alterado — apenas a ordem de renderização.
      */}
      {!loading && !error && acompanhamento.length > 0 && (
        <section className="dashboard-acompanhamento" aria-labelledby="acompanhamento-title">
          <h2 id="acompanhamento-title">Clientes e artes em andamento</h2>
          <div className="table-scroll">
            <table className="designer-table dashboard-acompanhamento-table">
              <caption className="sr-only">
                Clientes com solicitações de arte ({acompanhamento.length} cliente(s))
              </caption>
              <thead>
                <tr>
                  <th scope="col">Cliente</th>
                  <th scope="col">Artes / solicitações</th>
                </tr>
              </thead>
              <tbody>
                {acompanhamento.map(({ cliente, solicitacoes }) => (
                  <tr key={cliente.id}>
                    <td data-label="Cliente" className="clientes-cell-nome">
                      <span className="clientes-nome-text" title={cliente.nome}>
                        {cliente.nome}
                      </span>
                    </td>
                    <td data-label="Artes / solicitações">
                      <ul className="dashboard-acompanhamento-solicitacoes">
                        {solicitacoes.map((solicitacao) => (
                          <li key={solicitacao.id}>
                            <Link to={`/designer/solicitacoes/${solicitacao.id}`}>
                              {solicitacao.tema ?? `Solicitação #${solicitacao.id}`}
                            </Link>{' '}
                            <span
                              className={`status-badge status-badge--${statusSlug(solicitacao.status)}`}
                            >
                              {solicitacao.status}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {!loading && !error && tiles && (
        <div className="dashboard-tiles">
          {tiles.map((tile) => (
            <Link
              key={tile.status}
              to={`/designer/solicitacoes?status=${encodeURIComponent(tile.status)}`}
              className={`dashboard-tile dashboard-tile--${statusSlug(tile.status)}`}
            >
              <span className="dashboard-tile-label">{tile.status}</span>
              <span className="dashboard-tile-count">{tile.total}</span>
            </Link>
          ))}
        </div>
      )}

      {!loading && !error && (
        <section className="dashboard-prazos" aria-labelledby="prazos-title">
          <h2 id="prazos-title" className="sr-only">
            Prazos próximos
          </h2>
          {prazosProximos.length > 0 && (
            <div className="dashboard-prazos-alert">
              ⚠ Você possui {prazosProximos.length} solicitaç{prazosProximos.length === 1 ? 'ão' : 'ões'}{' '}
              próxima{prazosProximos.length === 1 ? '' : 's'} do prazo
            </div>
          )}
          {prazosProximos.length === 0 ? (
            <p className="dashboard-prazos-empty">Nenhum prazo próximo no momento.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th scope="col">Cliente</th>
                  <th scope="col">Prazo</th>
                </tr>
              </thead>
              <tbody>
                {prazosProximos.map((solicitacao) => {
                  const tag = prazoTag(solicitacao.prazoPrimeiraVersao);
                  return (
                    <tr key={solicitacao.id}>
                      <td>
                        <Link to={`/designer/solicitacoes/${solicitacao.id}`}>{solicitacao.clienteNome}</Link>
                      </td>
                      <td>
                        <span className={`prazo-tag ${tag.className}`}>{tag.label}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>
      )}

      {!loading && !error && agendamentos && agendamentos.length > 0 && (
        <section className="dashboard-prazos" aria-labelledby="publicacoes-title">
          <h2 id="publicacoes-title">Publicações agendadas</h2>
          <table>
            <thead>
              <tr>
                <th scope="col">Cliente</th>
                <th scope="col">Arte</th>
                <th scope="col">Data</th>
                <th scope="col">Horário</th>
              </tr>
            </thead>
            <tbody>
              {agendamentos.map((agendamento) => {
                /**
                 * Rodada correções (item 9): um agendamento continua `Agendado`
                 * quando o job de publicação falhou ou ainda não rodou. Sem
                 * marcação, ele aparecia no TOPO da lista (ordem crescente de
                 * data) indistinguível de uma publicação futura — o designer
                 * lia "agendada" para algo que já deveria estar no ar.
                 */
                const atrasada =
                  new Date(`${agendamento.dataPublicacao}T${agendamento.horario}`).getTime() < Date.now();
                return (
                  <tr key={agendamento.idAgendamento}>
                    <td>
                      <Link to={`/designer/solicitacoes/${agendamento.idSolicitacao}`}>{agendamento.clienteNome}</Link>
                    </td>
                    <td>{agendamento.tema ?? '—'}</td>
                    <td>
                      {new Date(`${agendamento.dataPublicacao}T00:00:00`).toLocaleDateString('pt-BR')}
                      {atrasada && <span className="dashboard-prazo-atrasado"> (atrasada)</span>}
                    </td>
                    <td>{agendamento.horario.slice(0, 5)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}

      {/*
        Centro operacional do Designer: ações sobre clientes já cadastrados
        (iniciar atendimento, Instagram). Editar/excluir cadastro vivem
        exclusivamente na aba Clientes (RF003) — nunca duplicados aqui.
      */}
      <ClientesOperacionalPanel />
    </AppShell>
  );
}
