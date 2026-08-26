import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AppShell } from '../../app/AppShell';
import { ApiError } from '../../lib/apiClient';
import { statusSlug } from '../../lib/statusStyle';
import { useAuth } from '../auth/useAuth';
import { listSolicitacoes, SOLICITACAO_STATUSES, type Solicitacao, type SolicitacaoStatus } from './solicitacoes/api';

interface TileCount {
  status: SolicitacaoStatus;
  total: number;
}

/** Dias de antecedência para considerar um prazo "próximo" no Dashboard (RN11/RN12). */
const PRAZO_PROXIMO_DIAS = 5;

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
 * (RN11) das solicitações "Em produção".
 */
export function DesignerHome() {
  const { profile } = useAuth();

  const [tiles, setTiles] = useState<TileCount[] | null>(null);
  const [emProducao, setEmProducao] = useState<Solicitacao[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    Promise.all([
      Promise.all(
        SOLICITACAO_STATUSES.map((status) =>
          listSolicitacoes({ status }).then((result) => ({ status, total: result.total })),
        ),
      ),
      listSolicitacoes({ status: 'Em produção' }),
    ])
      .then(([tileResults, emProducaoResult]) => {
        if (cancelled) return;
        setTiles(tileResults);
        setEmProducao(
          [...emProducaoResult.items].sort(
            (a, b) => new Date(a.prazoPrimeiraVersao).getTime() - new Date(b.prazoPrimeiraVersao).getTime(),
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
      </div>

      {profile?.bloqueado && (
        <p role="alert" className="auth-error" style={{ marginBottom: 20 }}>
          Você está bloqueado para iniciar novos atendimentos: há uma solicitação vencida sem a
          primeira versão enviada. Envie a versão pendente ou aguarde o cancelamento para
          ser desbloqueado.
        </p>
      )}

      {loading && <p role="status">Carregando dashboard…</p>}
      {error && (
        <p role="alert" className="auth-error">
          {error}
        </p>
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

      <Link to="/designer/clientes" className="dashboard-cta">
        Iniciar Atendimento
      </Link>
    </AppShell>
  );
}
