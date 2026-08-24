import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AppShell } from '../../../app/AppShell';
import { ApiError } from '../../../lib/apiClient';
import { statusSlug } from '../../../lib/statusStyle';
import {
  cancelAgendamento,
  createAgendamento,
  gerarLinkAvaliacao,
  getAjusteReferenciaUrl,
  getAtendimentoReferenciaUrl,
  getSolicitacaoDetail,
  getVersaoArteDownloadUrl,
  registrarPublicacaoManual,
  updateAgendamento,
  uploadVersaoArte,
  type GerarLinkAvaliacaoResult,
  type SolicitacaoDetailResult,
} from './api';

/** RF004/item 5: mesmo formato de path gerado por `downloadAndStoreReferencia` no backend. */
function isReferenciaPath(value: string): boolean {
  return /^atendimentos\/\d+\/referencias\//.test(value);
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString('pt-BR');
}

/** RF007/RN26: só é possível enviar nova versão quando a solicitação está aguardando envio. */
const UPLOADABLE_STATUSES = new Set(['Em produção', 'Ajustes']);

/** RF005: detalhes com atendimento, status, versões e histórico; edição dos campos descritivos. */
export function SolicitacaoDetailPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);

  const [data, setData] = useState<SolicitacaoDetailResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const uploadFormRef = useRef<HTMLFormElement>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadObservacoes, setUploadObservacoes] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);

  const [downloadingVersaoId, setDownloadingVersaoId] = useState<number | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const [downloadingAjusteId, setDownloadingAjusteId] = useState<number | null>(null);
  const [ajusteDownloadError, setAjusteDownloadError] = useState<string | null>(null);

  const [downloadingAtendimentoReferencia, setDownloadingAtendimentoReferencia] = useState(false);
  const [atendimentoReferenciaError, setAtendimentoReferenciaError] = useState<string | null>(null);

  const [generatingLink, setGeneratingLink] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [linkResult, setLinkResult] = useState<GerarLinkAvaliacaoResult | null>(null);

  const [agendData, setAgendData] = useState('');
  const [agendHorario, setAgendHorario] = useState('');
  const [agendLegenda, setAgendLegenda] = useState('');
  const [agendSaving, setAgendSaving] = useState(false);
  const [agendError, setAgendError] = useState<string | null>(null);
  const [agendSuccess, setAgendSuccess] = useState<string | null>(null);

  const [confirmingCancelAgend, setConfirmingCancelAgend] = useState(false);
  const [cancelingAgend, setCancelingAgend] = useState(false);
  const [cancelAgendError, setCancelAgendError] = useState<string | null>(null);

  const [registeringPublicacao, setRegisteringPublicacao] = useState(false);
  const [publicacaoError, setPublicacaoError] = useState<string | null>(null);

  const reload = useCallback(() => {
    setLoading(true);
    setError(null);
    getSolicitacaoDetail(id)
      .then((result) => {
        setData(result);
        setAgendData(result.agendamento?.dataPublicacao ?? '');
        setAgendHorario(result.agendamento?.horario.slice(0, 5) ?? '');
        setAgendLegenda(result.agendamento?.legenda ?? '');
      })
      .catch((loadError: unknown) => {
        setError(
          loadError instanceof ApiError ? loadError.message : 'Não foi possível carregar a solicitação.',
        );
      })
      .finally(() => setLoading(false));
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
        reload();
      })
      .catch((submitError: unknown) => {
        setUploadError(
          submitError instanceof ApiError ? submitError.message : 'Não foi possível enviar o arquivo.',
        );
      })
      .finally(() => setUploading(false));
  }

  function handleDownload(idVersao: number) {
    setDownloadingVersaoId(idVersao);
    setDownloadError(null);

    getVersaoArteDownloadUrl(id, idVersao)
      .then(({ url }) => {
        window.open(url, '_blank', 'noopener,noreferrer');
      })
      .catch((downloadErr: unknown) => {
        setDownloadError(
          downloadErr instanceof ApiError ? downloadErr.message : 'Não foi possível gerar o link de download.',
        );
      })
      .finally(() => setDownloadingVersaoId(null));
  }

  function handleDownloadAjusteReferencia(idAjuste: number) {
    setDownloadingAjusteId(idAjuste);
    setAjusteDownloadError(null);

    getAjusteReferenciaUrl(id, idAjuste)
      .then(({ url }) => {
        window.open(url, '_blank', 'noopener,noreferrer');
      })
      .catch((downloadErr: unknown) => {
        setAjusteDownloadError(
          downloadErr instanceof ApiError ? downloadErr.message : 'Não foi possível gerar o link de download.',
        );
      })
      .finally(() => setDownloadingAjusteId(null));
  }

  function handleDownloadAtendimentoReferencia() {
    setDownloadingAtendimentoReferencia(true);
    setAtendimentoReferenciaError(null);

    getAtendimentoReferenciaUrl(id)
      .then(({ url }) => {
        window.open(url, '_blank', 'noopener,noreferrer');
      })
      .catch((downloadErr: unknown) => {
        setAtendimentoReferenciaError(
          downloadErr instanceof ApiError ? downloadErr.message : 'Não foi possível gerar o link de download.',
        );
      })
      .finally(() => setDownloadingAtendimentoReferencia(false));
  }

  function handleGerarLink() {
    setGeneratingLink(true);
    setLinkError(null);
    setLinkResult(null);

    gerarLinkAvaliacao(id)
      .then((result) => {
        setLinkResult(result);
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
    setAgendSaving(true);
    setAgendError(null);
    setAgendSuccess(null);

    const input = { dataPublicacao: agendData, horario: agendHorario, legenda: agendLegenda || undefined };
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

    cancelAgendamento(id)
      .then(() => {
        setConfirmingCancelAgend(false);
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

  return (
    <AppShell>
      <Link to="/designer/solicitacoes" className="page-back">
        ← Voltar
      </Link>
      <div className="page-header">
        <h1>Detalhes da solicitação</h1>
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
                      <button
                        type="button"
                        onClick={handleDownloadAtendimentoReferencia}
                        disabled={downloadingAtendimentoReferencia}
                      >
                        {downloadingAtendimentoReferencia ? 'Gerando link…' : 'Ver referência'}
                      </button>
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
                      <button
                        type="button"
                        onClick={() => handleDownloadAjusteReferencia(ajuste.idAjuste)}
                        disabled={downloadingAjusteId === ajuste.idAjuste}
                      >
                        {downloadingAjusteId === ajuste.idAjuste ? 'Gerando link…' : 'Ver referência'}
                      </button>
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
                    <button
                      type="button"
                      onClick={() => handleDownload(versao.id_versao)}
                      disabled={downloadingVersaoId === versao.id_versao}
                    >
                      {downloadingVersaoId === versao.id_versao ? 'Gerando link…' : 'Baixar'}
                    </button>
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

                <label htmlFor="versao-arquivo">Arquivo (PDF, JPG ou PNG)</label>
                <input
                  id="versao-arquivo"
                  type="file"
                  accept="application/pdf,image/jpeg,image/png"
                  onChange={(event) => setUploadFile(event.target.files?.[0] ?? null)}
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
                  <p className="atendimento-success">{uploadSuccess}</p>
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
                solicitação. O sistema tenta notificar o cliente automaticamente pelo WhatsApp (RF009/RN19).
              </p>

              <div className="designer-form-actions">
                <button type="button" onClick={handleGerarLink} disabled={generatingLink}>
                  {generatingLink ? 'Gerando link…' : 'Gerar e enviar link de avaliação'}
                </button>
              </div>

              {linkError && (
                <p role="alert" className="auth-error">
                  {linkError}
                </p>
              )}

              {linkResult && (
                <p className="atendimento-success">
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

              {data.solicitacao.status === 'Agendado' && data.agendamento && (
                <p>
                  Agendado para {new Date(`${data.agendamento.dataPublicacao}T00:00:00`).toLocaleDateString('pt-BR')}{' '}
                  às {data.agendamento.horario.slice(0, 5)}
                  {data.agendamento.legenda && <> — {data.agendamento.legenda}</>}
                </p>
              )}

              {/* RN22: preferência que o cliente informou ao aprovar — só a leitura, quem cria/gerencia o agendamento continua sendo o designer (RF012). */}
              {data.preferenciaAgendamento?.desejaAgendamento === true && (
                <p>
                  O cliente indicou que deseja agendar para{' '}
                  {data.preferenciaAgendamento.dataDesejada &&
                    new Date(`${data.preferenciaAgendamento.dataDesejada}T00:00:00`).toLocaleDateString('pt-BR')}{' '}
                  às {data.preferenciaAgendamento.horarioDesejado?.slice(0, 5)}.
                </p>
              )}
              {data.preferenciaAgendamento?.desejaAgendamento === false && (
                <p>O cliente optou por decidir o agendamento junto com você depois.</p>
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
                {agendSuccess && !agendError && <p className="atendimento-success">{agendSuccess}</p>}

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
              <p>
                O cancelamento só é permitido com pelo menos 3 horas de antecedência do horário
                planejado (RN31).
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
                arte manualmente fora do sistema e registre aqui para concluir o fluxo (RF014).
              </p>
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
