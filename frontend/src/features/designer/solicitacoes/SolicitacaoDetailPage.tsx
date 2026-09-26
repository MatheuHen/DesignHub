import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AppShell } from '../../../app/AppShell';
import { FilePreviewPicker } from '../../../components/FilePreviewPicker';
import { ApiError } from '../../../lib/apiClient';
import { getSaoPauloNow, isDataHorarioPassadoSaoPaulo } from '../../../lib/saoPauloDate';
import { statusSlug } from '../../../lib/statusStyle';
import { useAuth } from '../../auth/useAuth';
import {
  cancelAgendamento,
  cancelSolicitacao,
  createAgendamento,
  gerarLinkAvaliacao,
  getAjusteReferenciaUrl,
  getAtendimentoReferenciaUrl,
  getClienteInstagramStatus,
  getComprovanteDownloadUrl,
  getLinkAvaliacaoHistorico,
  getPublicacaoDetalhe,
  getSolicitacaoDetail,
  getVersaoArteDownloadUrl,
  reenviarNotificacaoPublicacao,
  registrarPublicacaoManual,
  updateAgendamento,
  uploadComprovantePublicacao,
  uploadVersaoArte,
  type ClienteInstagramStatus,
  type GerarLinkAvaliacaoResult,
  type LinkAvaliacaoInfo,
  type LinkAvaliacaoSituacao,
  type PublicacaoDetalhe,
  type SolicitacaoDetailResult,
} from './api';

/** Item 7 (rodada final): rótulos em pt-BR da situação real e persistida do link de avaliação. */
const LINK_AVALIACAO_SITUACAO_LABEL: Record<LinkAvaliacaoSituacao, string> = {
  aguardando_resposta: 'Aguardando resposta',
  respondido: 'Respondido',
  expirado: 'Expirado',
  revogado: 'Revogado',
  falha_envio: 'Falha no envio',
};

function formatDateTimeCurta(value: string): string {
  return new Date(value).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** RF004/item 5: mesmo formato de path gerado por `downloadAndStoreReferencia` no backend. */
function isReferenciaPath(value: string): boolean {
  return /^atendimentos\/\d+\/referencias\//.test(value);
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString('pt-BR');
}

/** RF007/RN26: só é possível enviar nova versão quando a solicitação está aguardando envio. */
const UPLOADABLE_STATUSES = new Set(['Em produção', 'Ajustes']);

/** Item 12/30 (rodada correções): "Cancelar arte" só em estados ativos — nunca em Cancelado/Publicado (terminais). */
const CANCELAVEIS = new Set(['Em produção', 'Enviado para avaliação', 'Ajustes', 'Aprovado', 'Agendado']);

/** RF005: detalhes com atendimento, status, versões e histórico; edição dos campos descritivos. */
export function SolicitacaoDetailPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const { refreshProfile } = useAuth();

  const [data, setData] = useState<SolicitacaoDetailResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const uploadFormRef = useRef<HTMLFormElement>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadObservacoes, setUploadObservacoes] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);

  /**
   * Rodada correções (item 6): antes havia um único estado por `id` (sem
   * distinguir Visualizar de Baixar), então clicar em um botão acendia o
   * texto de carregamento genérico "Gerando link…" nos DOIS botões da mesma
   * linha. Agora cada ação guarda também qual botão foi clicado, então só
   * ele mostra seu próprio texto ("Carregando versão…"/"Preparando
   * download…") e só ele fica desabilitado.
   */
  const [downloadingVersaoAction, setDownloadingVersaoAction] = useState<{ id: number; inline: boolean } | null>(
    null,
  );
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const [downloadingAjusteAction, setDownloadingAjusteAction] = useState<{ id: number; inline: boolean } | null>(
    null,
  );
  const [ajusteDownloadError, setAjusteDownloadError] = useState<string | null>(null);

  const [downloadingAtendimentoReferenciaAction, setDownloadingAtendimentoReferenciaAction] = useState<
    'inline' | 'download' | null
  >(null);
  const [atendimentoReferenciaError, setAtendimentoReferenciaError] = useState<string | null>(null);

  const [generatingLink, setGeneratingLink] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [linkResult, setLinkResult] = useState<GerarLinkAvaliacaoResult | null>(null);
  /** Item 7 (rodada final): histórico PERSISTIDO — sobrevive a reload, diferente de `linkResult` (ephemeral). */
  const [linkHistorico, setLinkHistorico] = useState<LinkAvaliacaoInfo | null>(null);

  const [agendData, setAgendData] = useState('');
  const [agendHorario, setAgendHorario] = useState('');
  const [agendLegenda, setAgendLegenda] = useState('');
  const [agendSaving, setAgendSaving] = useState(false);
  const [agendError, setAgendError] = useState<string | null>(null);
  const [agendSuccess, setAgendSuccess] = useState<string | null>(null);

  const [confirmingCancelAgend, setConfirmingCancelAgend] = useState(false);
  const [cancelingAgend, setCancelingAgend] = useState(false);
  const [cancelAgendError, setCancelAgendError] = useState<string | null>(null);
  const [cancelAgendSuccess, setCancelAgendSuccess] = useState(false);

  const [registeringPublicacao, setRegisteringPublicacao] = useState(false);
  const [publicacaoError, setPublicacaoError] = useState<string | null>(null);

  const [instagramStatus, setInstagramStatus] = useState<ClienteInstagramStatus | null>(null);

  const [publicacaoDetalhe, setPublicacaoDetalhe] = useState<PublicacaoDetalhe | null>(null);
  const [comprovanteFile, setComprovanteFile] = useState<File | null>(null);
  const [uploadingComprovante, setUploadingComprovante] = useState(false);
  const [comprovanteError, setComprovanteError] = useState<string | null>(null);
  const [comprovanteSuccess, setComprovanteSuccess] = useState(false);
  const [downloadingComprovante, setDownloadingComprovante] = useState(false);
  const [comprovanteDownloadError, setComprovanteDownloadError] = useState<string | null>(null);
  const [resendingNotificacao, setResendingNotificacao] = useState(false);
  const [resendNotificacaoError, setResendNotificacaoError] = useState<string | null>(null);
  const [resendNotificacaoSuccess, setResendNotificacaoSuccess] = useState(false);

  const [confirmingCancelSolicitacao, setConfirmingCancelSolicitacao] = useState(false);
  const [cancelingSolicitacao, setCancelingSolicitacao] = useState(false);
  const [cancelSolicitacaoError, setCancelSolicitacaoError] = useState<string | null>(null);

  // Auditoria (achado HIGH — race condition): identifica a chamada mais
  // recente de `reload()` para descartar respostas de uma requisição antiga
  // que chegam depois de o usuário já ter navegado para outra solicitação
  // (ou disparado um novo reload) — mesmo padrão de guarda usado em
  // `DesignerHome.tsx`.
  const latestRequestIdRef = useRef(0);

  const reload = useCallback(() => {
    const requestId = ++latestRequestIdRef.current;
    setLoading(true);
    setError(null);
    getSolicitacaoDetail(id)
      .then((result) => {
        if (latestRequestIdRef.current !== requestId) return;
        setData(result);
        // RN22/RN27: sem agendamento ainda criado, pré-preenche com a preferência que o cliente informou ao aprovar.
        const preferencia = result.preferenciaAgendamento;
        const usarPreferencia = !result.agendamento && preferencia?.desejaAgendamento === true;
        setAgendData(
          result.agendamento?.dataPublicacao ?? (usarPreferencia ? (preferencia.dataDesejada ?? '') : ''),
        );
        setAgendHorario(
          result.agendamento?.horario.slice(0, 5) ??
            (usarPreferencia ? (preferencia.horarioDesejado?.slice(0, 5) ?? '') : ''),
        );
        setAgendLegenda(
          result.agendamento?.legenda ?? (usarPreferencia ? (preferencia.legendaDesejada ?? '') : ''),
        );

        if (result.solicitacao.status === 'Aprovado' || result.solicitacao.status === 'Agendado') {
          getClienteInstagramStatus(result.solicitacao.idCliente)
            .then((status) => {
              if (latestRequestIdRef.current === requestId) setInstagramStatus(status);
            })
            .catch(() => {
              if (latestRequestIdRef.current === requestId) setInstagramStatus(null);
            });
        } else {
          setInstagramStatus(null);
        }

        if (result.solicitacao.status === 'Enviado para avaliação') {
          getLinkAvaliacaoHistorico(id)
            .then((historico) => {
              if (latestRequestIdRef.current === requestId) setLinkHistorico(historico);
            })
            .catch(() => {
              if (latestRequestIdRef.current === requestId) setLinkHistorico(null);
            });
        } else {
          setLinkHistorico(null);
        }

        if (result.solicitacao.status === 'Publicado') {
          getPublicacaoDetalhe(id)
            .then((detalhe) => {
              if (latestRequestIdRef.current === requestId) setPublicacaoDetalhe(detalhe);
            })
            .catch(() => {
              if (latestRequestIdRef.current === requestId) setPublicacaoDetalhe(null);
            });
        } else {
          setPublicacaoDetalhe(null);
        }
      })
      .catch((loadError: unknown) => {
        if (latestRequestIdRef.current !== requestId) return;
        setError(
          loadError instanceof ApiError ? loadError.message : 'Não foi possível carregar a solicitação.',
        );
      })
      .finally(() => {
        if (latestRequestIdRef.current === requestId) setLoading(false);
      });
  }, [id]);

  useEffect(() => {
    reload();
  }, [reload]);

  function handleUploadSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!uploadFile) {
      setUploadError('Selecione um arquivo PDF, JPG ou PNG.');
      return;
    }
    setUploading(true);
    setUploadError(null);
    setUploadSuccess(null);

    uploadVersaoArte(id, uploadFile, uploadObservacoes.trim() || undefined)
      .then((result) => {
        setUploadSuccess(`Versão V${result.numeroVersao} enviada com sucesso.`);
        setUploadFile(null);
        setUploadObservacoes('');
        uploadFormRef.current?.reset();
        // Item 5.1: a 1ª versão pode ter resolvido um bloqueio por atraso (RF006) —
        // recarrega o perfil para o aviso sumir sem exigir logout/login.
        void refreshProfile();
        reload();
      })
      .catch((submitError: unknown) => {
        setUploadError(
          submitError instanceof ApiError ? submitError.message : 'Não foi possível enviar o arquivo.',
        );
      })
      .finally(() => setUploading(false));
  }

  function handleDownload(idVersao: number, inline: boolean) {
    setDownloadingVersaoAction({ id: idVersao, inline });
    setDownloadError(null);

    getVersaoArteDownloadUrl(id, idVersao, inline)
      .then(({ url }) => {
        window.open(url, '_blank', 'noopener,noreferrer');
      })
      .catch((downloadErr: unknown) => {
        setDownloadError(
          downloadErr instanceof ApiError ? downloadErr.message : 'Não foi possível gerar o link de download.',
        );
      })
      .finally(() => setDownloadingVersaoAction(null));
  }

  function handleDownloadAjusteReferencia(idAjuste: number, inline: boolean) {
    setDownloadingAjusteAction({ id: idAjuste, inline });
    setAjusteDownloadError(null);

    getAjusteReferenciaUrl(id, idAjuste, inline)
      .then(({ url }) => {
        window.open(url, '_blank', 'noopener,noreferrer');
      })
      .catch((downloadErr: unknown) => {
        setAjusteDownloadError(
          downloadErr instanceof ApiError ? downloadErr.message : 'Não foi possível gerar o link de download.',
        );
      })
      .finally(() => setDownloadingAjusteAction(null));
  }

  function handleDownloadAtendimentoReferencia(inline: boolean) {
    setDownloadingAtendimentoReferenciaAction(inline ? 'inline' : 'download');
    setAtendimentoReferenciaError(null);

    getAtendimentoReferenciaUrl(id, inline)
      .then(({ url }) => {
        window.open(url, '_blank', 'noopener,noreferrer');
      })
      .catch((downloadErr: unknown) => {
        setAtendimentoReferenciaError(
          downloadErr instanceof ApiError ? downloadErr.message : 'Não foi possível gerar o link de download.',
        );
      })
      .finally(() => setDownloadingAtendimentoReferenciaAction(null));
  }

  function handleGerarLink() {
    setGeneratingLink(true);
    setLinkError(null);
    setLinkResult(null);

    gerarLinkAvaliacao(id)
      .then((result) => {
        setLinkResult(result);
        // Item 7: refaz a leitura do histórico persistido para refletir o novo envio
        // (quantidade de tentativas, situação) sem esperar um reload manual da página.
        getLinkAvaliacaoHistorico(id)
          .then(setLinkHistorico)
          .catch(() => undefined);
      })
      .catch((linkErr: unknown) => {
        setLinkError(
          linkErr instanceof ApiError ? linkErr.message : 'Não foi possível gerar o link de avaliação.',
        );
      })
      .finally(() => setGeneratingLink(false));
  }

  function handleAgendamentoSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAgendError(null);
    setAgendSuccess(null);
    if (isDataHorarioPassadoSaoPaulo(agendData, agendHorario)) {
      setAgendError('A data e o horário do agendamento devem estar no futuro.');
      return;
    }
    setAgendSaving(true);
    // Rodada correções (item 13/31/32): um agendamento novo/editado nunca
    // deve deixar visível uma mensagem de cancelamento de uma ação anterior.
    setCancelAgendSuccess(false);

    const input = { dataPublicacao: agendData, horario: agendHorario, legenda: agendLegenda };
    const action = data?.agendamento ? updateAgendamento(id, input) : createAgendamento(id, input);

    action
      .then(() => {
        setAgendSuccess(data?.agendamento ? 'Agendamento atualizado.' : 'Publicação agendada com sucesso.');
        reload();
      })
      .catch((submitError: unknown) => {
        setAgendError(
          submitError instanceof ApiError ? submitError.message : 'Não foi possível salvar o agendamento.',
        );
      })
      .finally(() => setAgendSaving(false));
  }

  function handleConfirmarCancelamentoAgendamento() {
    setCancelingAgend(true);
    setCancelAgendError(null);
    // Rodada correções (item 13/31): sem isso, "Publicação agendada com
    // sucesso." (de quando o agendamento foi criado) continuava visível na
    // tela depois de cancelá-lo — mensagem de uma ação diferente, já
    // desatualizada (stale state).
    setAgendSuccess(null);
    setCancelAgendSuccess(false);

    cancelAgendamento(id)
      .then(() => {
        setConfirmingCancelAgend(false);
        setCancelAgendSuccess(true);
        reload();
      })
      .catch((cancelErr: unknown) => {
        setCancelAgendError(
          cancelErr instanceof ApiError ? cancelErr.message : 'Não foi possível cancelar o agendamento.',
        );
      })
      .finally(() => setCancelingAgend(false));
  }

  function handleRegistrarPublicacaoManual() {
    setRegisteringPublicacao(true);
    setPublicacaoError(null);

    registrarPublicacaoManual(id)
      .then(() => {
        reload();
      })
      .catch((publicacaoErr: unknown) => {
        setPublicacaoError(
          publicacaoErr instanceof ApiError
            ? publicacaoErr.message
            : 'Não foi possível registrar a publicação.',
        );
      })
      .finally(() => setRegisteringPublicacao(false));
  }

  /** Item 9.3 (correções 13/09/2026): comprovante/print opcional da publicação já concluída. */
  function handleUploadComprovante(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!comprovanteFile) {
      setComprovanteError('Selecione um arquivo PDF, JPG ou PNG.');
      return;
    }
    setUploadingComprovante(true);
    setComprovanteError(null);

    uploadComprovantePublicacao(id, comprovanteFile)
      .then(() => {
        setComprovanteSuccess(true);
        setComprovanteFile(null);
        reload();
      })
      .catch((uploadErr: unknown) => {
        setComprovanteError(
          uploadErr instanceof ApiError ? uploadErr.message : 'Não foi possível enviar o comprovante.',
        );
      })
      .finally(() => setUploadingComprovante(false));
  }

  /** Melhoria autorizada (item 10 — retry seguro): reenvia o aviso "arte publicada" ao cliente. */
  function handleResendNotificacao() {
    setResendingNotificacao(true);
    setResendNotificacaoError(null);
    setResendNotificacaoSuccess(false);

    reenviarNotificacaoPublicacao(id)
      .then(() => setResendNotificacaoSuccess(true))
      .catch((resendErr: unknown) => {
        setResendNotificacaoError(
          resendErr instanceof ApiError ? resendErr.message : 'Não foi possível reenviar o aviso.',
        );
      })
      .finally(() => setResendingNotificacao(false));
  }

  function handleDownloadComprovante() {
    setDownloadingComprovante(true);
    setComprovanteDownloadError(null);
    // Rodada correções (item 10): "Ver comprovante" é uma ação de leitura —
    // nunca deve deixar a mensagem "Comprovante enviado com sucesso." (de um
    // upload anterior nesta mesma visita) visível ao lado dela.
    setComprovanteSuccess(false);

    getComprovanteDownloadUrl(id)
      .then(({ url }) => {
        window.open(url, '_blank', 'noopener,noreferrer');
      })
      .catch((downloadErr: unknown) => {
        setComprovanteDownloadError(
          downloadErr instanceof ApiError ? downloadErr.message : 'Não foi possível gerar o link de download.',
        );
      })
      .finally(() => setDownloadingComprovante(false));
  }

  /** Item 12/30 (rodada correções): designer cancela a própria arte em qualquer estado ativo. */
  function handleCancelarSolicitacao() {
    setCancelingSolicitacao(true);
    setCancelSolicitacaoError(null);
    cancelSolicitacao(id)
      .then(() => {
        setConfirmingCancelSolicitacao(false);
        reload();
        // Item 5.1: cancelar também resolve o bloqueio por atraso (RF006/RN12).
        void refreshProfile();
      })
      .catch((cancelErr: unknown) => {
        setCancelSolicitacaoError(
          cancelErr instanceof ApiError ? cancelErr.message : 'Não foi possível cancelar a solicitação.',
        );
      })
      .finally(() => setCancelingSolicitacao(false));
  }

  return (
    <AppShell>
      <Link to="/designer/solicitacoes" className="page-back">
        ← Voltar
      </Link>
      <div className="page-header">
        <h1>Detalhes da solicitação</h1>
        {data && CANCELAVEIS.has(data.solicitacao.status) && (
          <div className="designer-form-actions">
            {confirmingCancelSolicitacao ? (
              <>
                <span role="alert">Cancelar esta solicitação de arte? Esta ação não pode ser desfeita.</span>
                <button
                  type="button"
                  className="designer-action-danger"
                  disabled={cancelingSolicitacao}
                  onClick={handleCancelarSolicitacao}
                >
                  {cancelingSolicitacao ? 'Cancelando…' : 'Confirmar cancelamento'}
                </button>
                <button
                  type="button"
                  disabled={cancelingSolicitacao}
                  onClick={() => setConfirmingCancelSolicitacao(false)}
                >
                  Voltar
                </button>
              </>
            ) : (
              <button
                type="button"
                className="designer-action-danger"
                onClick={() => {
                  setCancelSolicitacaoError(null);
                  setConfirmingCancelSolicitacao(true);
                }}
              >
                Cancelar arte
              </button>
            )}
          </div>
        )}
      </div>
      {cancelSolicitacaoError && (
        <p role="alert" className="auth-error">
          {cancelSolicitacaoError}
        </p>
      )}

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
              <h3>Informações do Cliente</h3>
              <p>{data.solicitacao.clienteNome}</p>
            </div>
            <div className="info-box">
              <h3>Status da Solicitação</h3>
              <span className={`status-badge status-badge--${statusSlug(data.solicitacao.status)}`}>
                {data.solicitacao.status}
              </span>
            </div>
          </div>

          {/* QUADRO 34 (Alteração de solicitação de arte): Tema, Preferência de
              cores e Observações são "Somente leitura" nesta tela — quem
              produz esses dados é o atendimento estruturado do WhatsApp
              (RF004/RN08), não uma edição livre pelo designer aqui. */}
          <section aria-labelledby="dados-solicitacao-title" className="info-box">
            <h2 id="dados-solicitacao-title">Dados da solicitação</h2>

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

          <section aria-labelledby="atendimento-title">
            <h2 id="atendimento-title">Respostas do atendimento (WhatsApp)</h2>
            {data.respostasAtendimento.length === 0 ? (
              <p>Nenhuma resposta registrada.</p>
            ) : (
              <ul>
                {data.respostasAtendimento.map((resposta, index) => (
                  <li key={`${resposta.pergunta}-${index}`}>
                    <strong>{resposta.pergunta}</strong>
                    <br />
                    {isReferenciaPath(resposta.resposta) ? (
                      <span className="designer-actions">
                        <button
                          type="button"
                          onClick={() => handleDownloadAtendimentoReferencia(true)}
                          disabled={downloadingAtendimentoReferenciaAction !== null}
                        >
                          {downloadingAtendimentoReferenciaAction === 'inline' ? 'Carregando…' : 'Visualizar'}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDownloadAtendimentoReferencia(false)}
                          disabled={downloadingAtendimentoReferenciaAction !== null}
                        >
                          {downloadingAtendimentoReferenciaAction === 'download' ? 'Preparando download…' : 'Baixar'}
                        </button>
                      </span>
                    ) : (
                      resposta.resposta
                    )}
                  </li>
                ))}
              </ul>
            )}
            {atendimentoReferenciaError && (
              <p role="alert" className="auth-error">
                {atendimentoReferenciaError}
              </p>
            )}
          </section>

          {data.ajustes.length > 0 && (
            <section aria-labelledby="ajustes-title">
              <h2 id="ajustes-title">Ajustes solicitados pelo cliente</h2>
              <ul>
                {data.ajustes.map((ajuste) => (
                  <li key={ajuste.idAjuste}>
                    <strong>
                      {ajuste.numeroVersao !== null ? `V${ajuste.numeroVersao} — ` : ''}
                      {formatDateTime(ajuste.createdAt)}
                    </strong>
                    <p>{ajuste.descricao}</p>
                    {ajuste.observacoes && <p>Observações: {ajuste.observacoes}</p>}
                    {ajuste.imagemReferenciaUrl && (
                      <span className="designer-actions">
                        <button
                          type="button"
                          onClick={() => handleDownloadAjusteReferencia(ajuste.idAjuste, true)}
                          disabled={downloadingAjusteAction?.id === ajuste.idAjuste}
                        >
                          {downloadingAjusteAction?.id === ajuste.idAjuste && downloadingAjusteAction.inline
                            ? 'Carregando…'
                            : 'Visualizar'}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDownloadAjusteReferencia(ajuste.idAjuste, false)}
                          disabled={downloadingAjusteAction?.id === ajuste.idAjuste}
                        >
                          {downloadingAjusteAction?.id === ajuste.idAjuste && !downloadingAjusteAction.inline
                            ? 'Preparando download…'
                            : 'Baixar'}
                        </button>
                      </span>
                    )}
                  </li>
                ))}
              </ul>
              {ajusteDownloadError && (
                <p role="alert" className="auth-error">
                  {ajusteDownloadError}
                </p>
              )}
            </section>
          )}

          <section aria-labelledby="versoes-title">
            <h2 id="versoes-title">Versões da arte</h2>
            {data.versoes.length === 0 ? (
              <p>Nenhuma versão enviada ainda.</p>
            ) : (
              <ul>
                {data.versoes.map((versao) => (
                  <li key={versao.id_versao}>
                    V{versao.numero_versao} — {versao.formato} — {formatDateTime(versao.data_envio)}
                    {versao.observacoes && <> — {versao.observacoes}</>}{' '}
                    <span className="designer-actions">
                      <button
                        type="button"
                        onClick={() => handleDownload(versao.id_versao, true)}
                        disabled={downloadingVersaoAction?.id === versao.id_versao}
                      >
                        {downloadingVersaoAction?.id === versao.id_versao && downloadingVersaoAction.inline
                          ? 'Carregando versão…'
                          : 'Visualizar'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDownload(versao.id_versao, false)}
                        disabled={downloadingVersaoAction?.id === versao.id_versao}
                      >
                        {downloadingVersaoAction?.id === versao.id_versao && !downloadingVersaoAction.inline
                          ? 'Preparando download…'
                          : 'Baixar'}
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {downloadError && (
              <p role="alert" className="auth-error">
                {downloadError}
              </p>
            )}

            {UPLOADABLE_STATUSES.has(data.solicitacao.status) && (
              <form
                ref={uploadFormRef}
                className="designer-form"
                onSubmit={handleUploadSubmit}
                aria-label="Enviar nova versão da arte"
              >
                <h3>Enviar nova versão</h3>

                <FilePreviewPicker
                  id="versao-arquivo"
                  label="Arquivo (PDF, JPG ou PNG)"
                  accept="application/pdf,image/jpeg,image/png"
                  file={uploadFile}
                  onChange={setUploadFile}
                />

                <label htmlFor="versao-observacoes">Observações (opcional)</label>
                <input
                  id="versao-observacoes"
                  value={uploadObservacoes}
                  onChange={(event) => setUploadObservacoes(event.target.value)}
                />

                {uploadError && (
                  <p role="alert" className="auth-error">
                    {uploadError}
                  </p>
                )}
                {uploadSuccess && !uploadError && (
                  <p role="status" className="atendimento-success">{uploadSuccess}</p>
                )}

                <div className="designer-form-actions">
                  <button type="submit" disabled={uploading}>
                    {uploading ? 'Enviando…' : 'Enviar versão'}
                  </button>
                </div>
              </form>
            )}
          </section>

          {data.solicitacao.status === 'Enviado para avaliação' && (
            <section aria-labelledby="avaliacao-title">
              <h2 id="avaliacao-title">Avaliação do cliente</h2>
              <p>
                Gere o link seguro de avaliação para o cliente aprovar, pedir ajustes ou cancelar a
                solicitação. O sistema tenta notificar o cliente automaticamente pelo WhatsApp.
              </p>

              {/* Item 7 (rodada final): histórico PERSISTIDO — "link gerado" não é o
                  mesmo que "link enviado". Sempre exibido separado do status de negócio
                  da solicitação (badge acima) — nunca substitui nem altera "Enviado para
                  avaliação". Sobrevive a reload, diferente do aviso ephemeral abaixo. */}
              {linkHistorico ? (
                <dl className="link-avaliacao-historico">
                  <div>
                    <dt>Último envio</dt>
                    <dd>{formatDateTimeCurta(linkHistorico.ultimoEnvioEm)}</dd>
                  </div>
                  <div>
                    <dt>Canal</dt>
                    <dd>{linkHistorico.whatsappNotificadoEm ? 'WhatsApp' : 'Copiado manualmente'}</dd>
                  </div>
                  <div>
                    <dt>Situação</dt>
                    <dd>{LINK_AVALIACAO_SITUACAO_LABEL[linkHistorico.situacao]}</dd>
                  </div>
                  <div>
                    <dt>Validade</dt>
                    <dd>{formatDateTimeCurta(linkHistorico.validoAte)}</dd>
                  </div>
                  <div>
                    <dt>Quantidade de envios</dt>
                    <dd>{linkHistorico.quantidadeEnvios}</dd>
                  </div>
                </dl>
              ) : (
                <p className="link-avaliacao-status" role="status">
                  Link de avaliação ainda não enviado.
                </p>
              )}

              <div className="designer-form-actions">
                <button type="button" onClick={handleGerarLink} disabled={generatingLink}>
                  {generatingLink
                    ? 'Gerando link de avaliação…'
                    : linkHistorico
                      ? 'Reenviar link de avaliação'
                      : 'Gerar e enviar link de avaliação'}
                </button>
              </div>

              {linkError && (
                <p role="alert" className="auth-error">
                  {linkError}
                </p>
              )}

              {linkResult && (
                <p role="status" className="atendimento-success">
                  {linkResult.whatsappNotified
                    ? 'Cliente notificado via WhatsApp com sucesso.'
                    : `Link gerado, mas não foi possível notificar via WhatsApp${linkResult.whatsappError ? ` (${linkResult.whatsappError})` : ''}. Copie e envie manualmente.`}
                  <br />
                  Link: <a href={linkResult.url}>{linkResult.url}</a>
                </p>
              )}
            </section>
          )}

          {(data.solicitacao.status === 'Aprovado' || data.solicitacao.status === 'Agendado') && (
            <section aria-labelledby="agendamento-title">
              <h2 id="agendamento-title">Agendamento de publicação</h2>

              {instagramStatus && !instagramStatus.conectado && (
                <p role="status">
                  A conta do Instagram deste cliente não está conectada — a publicação automática não
                  será tentada. <Link to="/designer/clientes">Conecte o Instagram do cliente</Link> para
                  habilitar a publicação automática, ou combine com o cliente e use "Registrar publicação
                  manual" abaixo quando a arte for publicada.
                </p>
              )}

              {data.solicitacao.status === 'Agendado' && data.agendamento && (
                <p>
                  Agendado para {new Date(`${data.agendamento.dataPublicacao}T00:00:00`).toLocaleDateString('pt-BR')}{' '}
                  às {data.agendamento.horario.slice(0, 5)}
                  {data.agendamento.legenda && <> — {data.agendamento.legenda}</>}
                </p>
              )}

              {/* Rodada correções (item 8): opção que o cliente escolheu ao aprovar — só leitura; quem cria/gerencia o agendamento manual continua sendo o designer (RF012). */}
              {data.preferenciaAgendamento?.opcaoPublicacao === 'automatico' && (
                <p role="alert" className="auth-error">
                  O cliente escolheu agendar automaticamente, mas isso não foi possível (o Instagram dele não
                  estava mais conectado no momento). Agende manualmente abaixo para {' '}
                  {data.preferenciaAgendamento.dataDesejada &&
                    new Date(`${data.preferenciaAgendamento.dataDesejada}T00:00:00`).toLocaleDateString('pt-BR')}{' '}
                  às {data.preferenciaAgendamento.horarioDesejado?.slice(0, 5)}.
                </p>
              )}
              {data.preferenciaAgendamento?.opcaoPublicacao === 'designer_manual' && (
                <p>
                  O cliente indicou que deseja agendar para{' '}
                  {data.preferenciaAgendamento.dataDesejada &&
                    new Date(`${data.preferenciaAgendamento.dataDesejada}T00:00:00`).toLocaleDateString('pt-BR')}{' '}
                  às {data.preferenciaAgendamento.horarioDesejado?.slice(0, 5)}.
                </p>
              )}
              {data.preferenciaAgendamento?.opcaoPublicacao === 'proprio_cliente' && (
                <p>
                  O cliente informou que vai publicar esta arte por conta própria. Registre a publicação manual
                  quando ela ocorrer.
                </p>
              )}
              {/* Compatibilidade com aprovações registradas antes desta rodada (sem opcaoPublicacao). */}
              {data.preferenciaAgendamento?.opcaoPublicacao === null &&
                data.preferenciaAgendamento?.desejaAgendamento === true && (
                  <p>
                    O cliente indicou que deseja agendar para{' '}
                    {data.preferenciaAgendamento.dataDesejada &&
                      new Date(`${data.preferenciaAgendamento.dataDesejada}T00:00:00`).toLocaleDateString('pt-BR')}{' '}
                    às {data.preferenciaAgendamento.horarioDesejado?.slice(0, 5)}.
                  </p>
                )}

              <form
                className="designer-form"
                onSubmit={handleAgendamentoSubmit}
                aria-label={data.agendamento ? 'Editar agendamento de publicação' : 'Agendar publicação'}
              >
                <label htmlFor="agendamento-data">Data</label>
                <input
                  id="agendamento-data"
                  type="date"
                  value={agendData}
                  min={getSaoPauloNow().date}
                  onChange={(event) => setAgendData(event.target.value)}
                  required
                />

                <label htmlFor="agendamento-horario">Horário</label>
                <input
                  id="agendamento-horario"
                  type="time"
                  value={agendHorario}
                  onChange={(event) => setAgendHorario(event.target.value)}
                  required
                />

                <label htmlFor="agendamento-legenda">Legenda (opcional)</label>
                <input
                  id="agendamento-legenda"
                  value={agendLegenda}
                  onChange={(event) => setAgendLegenda(event.target.value)}
                />

                {agendError && (
                  <p role="alert" className="auth-error">
                    {agendError}
                  </p>
                )}
                {agendSuccess && !agendError && <p role="status" className="atendimento-success">{agendSuccess}</p>}

                <div className="designer-form-actions">
                  <button type="submit" disabled={agendSaving}>
                    {agendSaving
                      ? 'Salvando…'
                      : data.agendamento
                        ? 'Salvar alterações do agendamento'
                        : 'Agendar publicação'}
                  </button>
                </div>
              </form>

              {data.solicitacao.status === 'Agendado' && (
                <div className="designer-form-actions">
                  {confirmingCancelAgend ? (
                    <>
                      <button
                        type="button"
                        onClick={handleConfirmarCancelamentoAgendamento}
                        disabled={cancelingAgend}
                      >
                        {cancelingAgend ? 'Cancelando…' : 'Confirmar cancelamento do agendamento'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmingCancelAgend(false)}
                        disabled={cancelingAgend}
                      >
                        Voltar
                      </button>
                    </>
                  ) : (
                    <button type="button" onClick={() => setConfirmingCancelAgend(true)}>
                      Cancelar agendamento
                    </button>
                  )}
                </div>
              )}
              {cancelAgendError && (
                <p role="alert" className="auth-error">
                  {cancelAgendError}
                </p>
              )}
              {cancelAgendSuccess && !cancelAgendError && (
                <p role="status" className="atendimento-success">
                  Agendamento cancelado com sucesso.
                </p>
              )}
              <p>
                O cancelamento do agendamento é permitido com pelo menos 3 horas de antecedência do
                horário planejado.
              </p>

              {data.solicitacao.status === 'Agendado' && (
                <div className="designer-form-actions">
                  <button
                    type="button"
                    onClick={handleRegistrarPublicacaoManual}
                    disabled={registeringPublicacao}
                  >
                    {registeringPublicacao ? 'Registrando…' : 'Registrar publicação manual'}
                  </button>
                </div>
              )}
              {publicacaoError && (
                <p role="alert" className="auth-error">
                  {publicacaoError}
                </p>
              )}
              <p>
                Use quando a publicação automática no Instagram não estiver disponível: publique a
                arte manualmente fora do sistema e registre aqui para concluir o fluxo.
              </p>
            </section>
          )}

          {/* Item 9.1/9.3 (correções 13/09/2026): badge nítido da publicação concluída + comprovante opcional. */}
          {data.solicitacao.status === 'Publicado' && (
            <section aria-labelledby="publicacao-title">
              <h2 id="publicacao-title">Publicação concluída</h2>
              {publicacaoDetalhe ? (
                <>
                  <p>
                    <span className="status-badge status-badge--publicado">Publicado</span>{' '}
                    {formatDateTime(publicacaoDetalhe.dataPublicada)} —{' '}
                    {publicacaoDetalhe.tipo === 'automatica' ? 'automática (Instagram)' : 'manual'}
                    {publicacaoDetalhe.numeroVersao !== null && <> — V{publicacaoDetalhe.numeroVersao}</>}
                  </p>
                  {publicacaoDetalhe.permalink && (
                    <p>
                      <a href={publicacaoDetalhe.permalink} target="_blank" rel="noopener noreferrer">
                        Ver publicação no Instagram
                      </a>
                    </p>
                  )}

                  <div className="designer-form-actions">
                    <button type="button" onClick={handleResendNotificacao} disabled={resendingNotificacao}>
                      {resendingNotificacao ? 'Reenviando…' : 'Reenviar aviso ao cliente'}
                    </button>
                  </div>
                  {resendNotificacaoError && (
                    <p role="alert" className="auth-error">
                      {resendNotificacaoError}
                    </p>
                  )}
                  {resendNotificacaoSuccess && (
                    <p role="status" className="atendimento-success">
                      Reenvio solicitado. Se o cliente não receber, verifique o número de WhatsApp cadastrado.
                    </p>
                  )}

                  {publicacaoDetalhe.temComprovante ? (
                    <div className="designer-form-actions">
                      <button type="button" onClick={handleDownloadComprovante} disabled={downloadingComprovante}>
                        {downloadingComprovante ? 'Carregando comprovante…' : 'Ver comprovante'}
                      </button>
                    </div>
                  ) : (
                    <form className="designer-form" onSubmit={handleUploadComprovante} aria-label="Enviar comprovante">
                      <FilePreviewPicker
                        id="comprovante-arquivo"
                        label="Comprovante/print (opcional — PDF, JPG ou PNG)"
                        accept="application/pdf,image/jpeg,image/png"
                        file={comprovanteFile}
                        onChange={setComprovanteFile}
                      />
                      <div className="designer-form-actions">
                        <button type="submit" disabled={uploadingComprovante || !comprovanteFile}>
                          {uploadingComprovante ? 'Enviando…' : 'Enviar comprovante'}
                        </button>
                      </div>
                    </form>
                  )}
                  {comprovanteError && (
                    <p role="alert" className="auth-error">
                      {comprovanteError}
                    </p>
                  )}
                  {comprovanteSuccess && <p role="status" className="atendimento-success">Comprovante enviado com sucesso.</p>}
                  {comprovanteDownloadError && (
                    <p role="alert" className="auth-error">
                      {comprovanteDownloadError}
                    </p>
                  )}
                </>
              ) : (
                <p role="status">Carregando dados da publicação…</p>
              )}
            </section>
          )}

          <section aria-labelledby="historico-title">
            <h2 id="historico-title">Histórico</h2>
            {data.historico.length === 0 ? (
              <p>Sem histórico registrado.</p>
            ) : (
              <ul>
                {data.historico.map((entry) => (
                  <li key={entry.id_historico}>
                    {formatDateTime(entry.data_hora)} — {entry.acao}
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
