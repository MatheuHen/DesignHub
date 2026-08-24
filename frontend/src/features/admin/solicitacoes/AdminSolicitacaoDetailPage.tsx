import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AppShell } from '../../../app/AppShell';
import { ApiError } from '../../../lib/apiClient';
import { statusSlug } from '../../../lib/statusStyle';
import { getSolicitacaoDetail, type SolicitacaoDetailResult } from '../../designer/solicitacoes/api';

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString('pt-BR');
}

/**
 * RF016/QUADRO 61: ação "Consultar" da listagem de Solicitações atribuídas
 * — leitura completa dos dados da solicitação para o Administrador decidir
 * a reatribuição. Somente leitura: nenhuma ação de escrita (upload,
 * agendamento, edição) fica disponível aqui — essas continuam exclusivas
 * do Designer responsável (RF007/RF012).
 */
export function AdminSolicitacaoDetailPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);

  const [data, setData] = useState<SolicitacaoDetailResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    getSolicitacaoDetail(id)
      .then(setData)
      .catch((loadError: unknown) => {
        setError(
          loadError instanceof ApiError ? loadError.message : 'Não foi possível carregar a solicitação.',
        );
      })
      .finally(() => setLoading(false));
  }, [id]);

  return (
    <AppShell>
      <Link to="/admin/designers" className="page-back">
        ← Voltar
      </Link>
      <div className="page-header">
        <h1>Consultar solicitação #{id}</h1>
      </div>

      {loading && <p role="status">Carregando…</p>}
      {error && (
        <p role="alert" className="auth-error">
          {error}
        </p>
      )}

      {!loading && !error && data && (
        <>
          <div className="info-columns">
            <div className="info-box">
              <h3>Cliente</h3>
              <p>{data.solicitacao.clienteNome}</p>
            </div>
            <div className="info-box">
              <h3>Status</h3>
              <span className={`status-badge status-badge--${statusSlug(data.solicitacao.status)}`}>
                {data.solicitacao.status}
              </span>
            </div>
          </div>

          <section aria-labelledby="admin-dados-title" className="info-box">
            <h2 id="admin-dados-title">Dados da solicitação</h2>
            <p>
              <strong>Tema:</strong> {data.solicitacao.tema || '—'}
            </p>
            <p>
              <strong>Preferência de cores:</strong> {data.solicitacao.cores || '—'}
            </p>
            <p>
              <strong>Observações:</strong> {data.solicitacao.observacoes || '—'}
            </p>
          </section>

          <section aria-labelledby="admin-versoes-title">
            <h2 id="admin-versoes-title">Versões</h2>
            {data.versoes.length === 0 ? (
              <p>Nenhuma versão enviada ainda.</p>
            ) : (
              <ul>
                {data.versoes.map((versao) => (
                  <li key={versao.id_versao}>
                    V{versao.numero_versao} — {versao.formato} — {formatDateTime(versao.data_envio)}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {data.ajustes.length > 0 && (
            <section aria-labelledby="admin-ajustes-title">
              <h2 id="admin-ajustes-title">Ajustes solicitados pelo cliente</h2>
              <ul>
                {data.ajustes.map((ajuste) => (
                  <li key={ajuste.idAjuste}>{ajuste.descricao}</li>
                ))}
              </ul>
            </section>
          )}

          {data.agendamento && (
            <section aria-labelledby="admin-agendamento-title">
              <h2 id="admin-agendamento-title">Agendamento</h2>
              <p>
                {new Date(`${data.agendamento.dataPublicacao}T00:00:00`).toLocaleDateString('pt-BR')} às{' '}
                {data.agendamento.horario.slice(0, 5)}
                {data.agendamento.legenda && <> — {data.agendamento.legenda}</>}
              </p>
            </section>
          )}

          <section aria-labelledby="admin-historico-title">
            <h2 id="admin-historico-title">Histórico</h2>
            {data.historico.length === 0 ? (
              <p>Nenhum evento registrado.</p>
            ) : (
              <ul>
                {data.historico.map((entrada) => (
                  <li key={entrada.id_historico}>
                    {formatDateTime(entrada.data_hora)} — {entrada.acao}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </AppShell>
  );
}
