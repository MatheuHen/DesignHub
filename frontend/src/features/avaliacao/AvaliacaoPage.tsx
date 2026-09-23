import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { FilePreviewPicker } from '../../components/FilePreviewPicker';
import { getSaoPauloNow, isDataHorarioPassadoSaoPaulo } from '../../lib/saoPauloDate';
import {
  PublicApiError,
  cancelarAgendamentoCliente,
  getAvaliacaoPreview,
  submitAvaliacao,
  type AvaliacaoPreview,
  type OpcaoPublicacao,
} from './api';

type ViewState = 'loading' | 'error' | 'preview' | 'ajustes-form' | 'confirm-cancelar' | 'aprovar-agendamento' | 'submitted';

/**
 * Rodada correções (item 6): mensagem única e mais útil para link
 * inválido/expirado — orienta o cliente a procurar um link mais recente no
 * WhatsApp antes de precisar contatar o designer. Nunca expõe token, ID ou
 * qual versão está associada ao link (LGPD/seção 12.2).
 */
const LINK_INDISPONIVEL_MESSAGE = [
  'Este link de avaliação não está mais disponível.',
  'Verifique no WhatsApp se você recebeu um link mais recente desta arte.',
  'Se não encontrar outro link válido, entre em contato com o designer responsável.',
];

const FRIENDLY_LINK_MESSAGE: Record<'invalid' | 'expired' | 'used', string[]> = {
  invalid: LINK_INDISPONIVEL_MESSAGE,
  expired: LINK_INDISPONIVEL_MESSAGE,
  used: ['Este link de avaliação já foi utilizado.'],
};

const SUBMITTED_MESSAGE: Record<'Aprovado' | 'Ajustes' | 'Cancelado', string> = {
  Aprovado: 'Arte aprovada com sucesso! Obrigado pela avaliação.',
  Ajustes: 'Pedido de ajustes enviado! O designer foi notificado e vai preparar uma nova versão.',
  Cancelado: 'Solicitação cancelada.',
};

/** RF009/RF010: tela pública e segura de avaliação — a arte é o foco principal. */
export function AvaliacaoPage() {
  const params = useParams<{ token: string }>();
  const token = params.token ?? '';

  const [view, setView] = useState<ViewState>('loading');
  const [preview, setPreview] = useState<AvaliacaoPreview | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submittedStatus, setSubmittedStatus] = useState<'Aprovado' | 'Ajustes' | 'Cancelado' | null>(null);

  const [descricaoAjuste, setDescricaoAjuste] = useState('');
  const [observacoesAjuste, setObservacoesAjuste] = useState('');
  const [referenciaAjuste, setReferenciaAjuste] = useState<File | null>(null);

  const [opcaoPublicacao, setOpcaoPublicacao] = useState<OpcaoPublicacao | null>(null);
  const [dataDesejada, setDataDesejada] = useState('');
  const [horarioDesejado, setHorarioDesejado] = useState('');
  const [legendaDesejada, setLegendaDesejada] = useState('');
  const [agendamentoAutomaticoCriado, setAgendamentoAutomaticoCriado] = useState<boolean | null>(null);

  const [confirmandoCancelAgendamento, setConfirmandoCancelAgendamento] = useState(false);
  const [cancelandoAgendamento, setCancelandoAgendamento] = useState(false);
  const [cancelAgendamentoError, setCancelAgendamentoError] = useState<string | null>(null);
  const [cancelAgendamentoSucesso, setCancelAgendamentoSucesso] = useState(false);

  const load = useCallback(() => {
    setView('loading');
    setErrorMessage(null);
    getAvaliacaoPreview(token)
      .then((result) => {
        setPreview(result);
        setView('preview');
      })
      .catch((error: unknown) => {
        setErrorMessage(
          error instanceof PublicApiError ? error.message : 'Não foi possível carregar o link de avaliação.',
        );
        setView('error');
      });
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  function handleConfirmarAprovacao(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!opcaoPublicacao) {
      setActionError('Escolha uma opção de publicação.');
      return;
    }
    if (opcaoPublicacao !== 'proprio_cliente' && (!dataDesejada || !horarioDesejado)) {
      setActionError('Informe a data e o horário desejados.');
      return;
    }
    if (
      opcaoPublicacao !== 'proprio_cliente' &&
      isDataHorarioPassadoSaoPaulo(dataDesejada, horarioDesejado)
    ) {
      setActionError('A data e o horário do agendamento devem estar no futuro.');
      return;
    }
    setSubmitting(true);
    setActionError(null);
    submitAvaliacao(token, {
      decisao: 'Aprovado',
      opcaoPublicacao,
      dataDesejada: opcaoPublicacao !== 'proprio_cliente' ? dataDesejada : undefined,
      horarioDesejado: opcaoPublicacao !== 'proprio_cliente' ? horarioDesejado : undefined,
      legendaDesejada: opcaoPublicacao !== 'proprio_cliente' ? legendaDesejada.trim() || undefined : undefined,
    })
      .then((result) => {
        setAgendamentoAutomaticoCriado(
          opcaoPublicacao === 'automatico' ? (result.agendamentoAutomaticoCriado ?? false) : null,
        );
        setSubmittedStatus('Aprovado');
        setView('submitted');
      })
      .catch((error: unknown) => {
        setActionError(
          error instanceof PublicApiError ? error.message : 'Não foi possível registrar a aprovação.',
        );
      })
      .finally(() => setSubmitting(false));
  }

  function handleConfirmarCancelamento() {
    setSubmitting(true);
    setActionError(null);
    submitAvaliacao(token, { decisao: 'Cancelado' })
      .then(() => {
        setSubmittedStatus('Cancelado');
        setView('submitted');
      })
      .catch((error: unknown) => {
        setActionError(
          error instanceof PublicApiError ? error.message : 'Não foi possível cancelar a solicitação.',
        );
      })
      .finally(() => setSubmitting(false));
  }

  /** Item 8.4 (correções 13/09/2026): cliente cancela o agendamento da própria solicitação (RN31, regra de 3h). */
  function handleConfirmarCancelamentoAgendamento() {
    setCancelandoAgendamento(true);
    setCancelAgendamentoError(null);
    cancelarAgendamentoCliente(token)
      .then(() => {
        setConfirmandoCancelAgendamento(false);
        setCancelAgendamentoSucesso(true);
        load();
      })
      .catch((error: unknown) => {
        setCancelAgendamentoError(
          error instanceof PublicApiError ? error.message : 'Não foi possível cancelar o agendamento.',
        );
      })
      .finally(() => setCancelandoAgendamento(false));
  }

  function handleSubmitAjuste(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setActionError(null);
    submitAvaliacao(token, {
      decisao: 'Ajustes',
      descricao: descricaoAjuste.trim(),
      observacoes: observacoesAjuste.trim() || undefined,
      referencia: referenciaAjuste ?? undefined,
    })
      .then(() => {
        setSubmittedStatus('Ajustes');
        setView('submitted');
      })
      .catch((error: unknown) => {
        setActionError(
          error instanceof PublicApiError ? error.message : 'Não foi possível enviar o pedido de ajustes.',
        );
      })
      .finally(() => setSubmitting(false));
  }

  return (
    <main className="avaliacao-shell">
      <div className="avaliacao-card">
        {view === 'loading' && <p role="status">Carregando…</p>}

        {view === 'error' && (
          <>
            <h1>Não foi possível carregar</h1>
            <p role="alert" className="auth-error">
              {errorMessage}
            </p>
          </>
        )}

        {/* RN13/RN14/RN18: link já usado, mas ainda identifica a solicitação — mostra acompanhamento somente-leitura em vez de só um erro. */}
        {preview && preview.state === 'used' && preview.tracking && view !== 'loading' && view !== 'submitted' && (
          <>
            <h1>Acompanhamento da solicitação{preview.tracking.tema ? `: ${preview.tracking.tema}` : ''}</h1>
            <p>
              <strong>Status atual:</strong> {preview.tracking.status}
            </p>

            <h2>Versões</h2>
            {preview.tracking.versoes.length === 0 ? (
              <p>Nenhuma versão enviada ainda.</p>
            ) : (
              <ul>
                {preview.tracking.versoes.map((versao) => (
                  <li key={versao.numeroVersao}>
                    V{versao.numeroVersao} ({versao.formato}) —{' '}
                    {new Date(versao.dataEnvio).toLocaleDateString('pt-BR')}{' '}
                    <a href={versao.downloadUrl} target="_blank" rel="noopener noreferrer">
                      Ver arte
                    </a>
                  </li>
                ))}
              </ul>
            )}

            {preview.tracking.agendamento && (
              <>
                <h2>Agendamento</h2>
                <p>
                  {new Date(`${preview.tracking.agendamento.dataPublicacao}T00:00:00`).toLocaleDateString('pt-BR')}{' '}
                  às {preview.tracking.agendamento.horario.slice(0, 5)} — {preview.tracking.agendamento.status}
                </p>

                {/* Item 8.4 (correções 13/09/2026): cliente cancela o próprio agendamento (RN31, regra de 3h) — nunca a solicitação inteira (item 8.5). */}
                {preview.tracking.agendamento.status === 'Agendado' && !cancelAgendamentoSucesso && (
                  <>
                    {confirmandoCancelAgendamento ? (
                      <div className="avaliacao-actions">
                        <button
                          type="button"
                          className="avaliacao-cancel"
                          onClick={handleConfirmarCancelamentoAgendamento}
                          disabled={cancelandoAgendamento}
                        >
                          {cancelandoAgendamento ? 'Cancelando…' : 'Confirmar cancelamento do agendamento'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmandoCancelAgendamento(false)}
                          disabled={cancelandoAgendamento}
                        >
                          Voltar
                        </button>
                      </div>
                    ) : (
                      <button type="button" onClick={() => setConfirmandoCancelAgendamento(true)}>
                        Cancelar agendamento
                      </button>
                    )}
                    {cancelAgendamentoError && (
                      <p role="alert" className="auth-error">
                        {cancelAgendamentoError}
                      </p>
                    )}
                  </>
                )}
              </>
            )}
            {cancelAgendamentoSucesso && (
              <p className="atendimento-success">Agendamento cancelado com sucesso.</p>
            )}

            <h2>Histórico</h2>
            <ul>
              {preview.tracking.historico.map((entrada, index) => (
                <li key={`${entrada.dataHora}-${index}`}>
                  {new Date(entrada.dataHora).toLocaleString('pt-BR')} — {entrada.acao}
                </li>
              ))}
            </ul>
          </>
        )}

        {preview &&
          preview.state !== 'valid' &&
          !(preview.state === 'used' && preview.tracking) &&
          view !== 'loading' &&
          view !== 'submitted' && (
            <>
              <h1>Avaliação de arte</h1>
              <div role="alert" className="auth-error">
                {FRIENDLY_LINK_MESSAGE[preview.state].map((line) => (
                  <p key={line}>{line}</p>
                ))}
              </div>
            </>
          )}

        {preview && preview.state === 'valid' && (view === 'preview' || view === 'ajustes-form' || view === 'confirm-cancelar' || view === 'aprovar-agendamento') && (
          <>
            <h1>Avalie sua arte{preview.tema ? `: ${preview.tema}` : ''}</h1>
            <p>Versão V{preview.numeroVersao}</p>
            {preview.observacoes && <p>{preview.observacoes}</p>}

            <div className="avaliacao-preview">
              {preview.formato === 'PDF' ? (
                <iframe src={preview.downloadUrl} title="Arte para avaliação" />
              ) : (
                <img src={preview.downloadUrl} alt={`Arte da versão V${preview.numeroVersao}`} />
              )}
            </div>

            {actionError && (
              <p role="alert" className="auth-error">
                {actionError}
              </p>
            )}

            {view === 'preview' && (
              <div className="avaliacao-actions">
                <button
                  type="button"
                  className="avaliacao-approve"
                  onClick={() => setView('aprovar-agendamento')}
                  disabled={submitting}
                >
                  Aprovar
                </button>
                <button type="button" onClick={() => setView('ajustes-form')} disabled={submitting}>
                  Solicitar ajustes
                </button>
                <button
                  type="button"
                  className="avaliacao-cancel"
                  onClick={() => setView('confirm-cancelar')}
                  disabled={submitting}
                >
                  Cancelar
                </button>
              </div>
            )}

            {view === 'aprovar-agendamento' && (
              <form
                className="designer-form"
                onSubmit={handleConfirmarAprovacao}
                aria-label="Confirmar aprovação"
              >
                <p>Como você quer que a publicação seja feita?</p>
                <div className="avaliacao-actions avaliacao-actions--column">
                  <button
                    type="button"
                    className={opcaoPublicacao === 'automatico' ? 'avaliacao-approve' : ''}
                    onClick={() => setOpcaoPublicacao('automatico')}
                    disabled={preview?.clienteInstagramConectado !== true}
                  >
                    Agendar automaticamente
                  </button>
                  {preview?.clienteInstagramConectado !== true && (
                    <p className="avaliacao-instagram-hint">
                      Para usar o agendamento automático, conecte sua conta do Instagram ao DesignHub. Peça o link
                      de conexão ao designer responsável.
                    </p>
                  )}
                  <button
                    type="button"
                    className={opcaoPublicacao === 'designer_manual' ? 'avaliacao-approve' : ''}
                    onClick={() => setOpcaoPublicacao('designer_manual')}
                  >
                    Designer agendar manualmente
                  </button>
                  <button
                    type="button"
                    className={opcaoPublicacao === 'proprio_cliente' ? 'avaliacao-approve' : ''}
                    onClick={() => setOpcaoPublicacao('proprio_cliente')}
                  >
                    Eu mesmo vou publicar
                  </button>
                </div>

                {(opcaoPublicacao === 'automatico' || opcaoPublicacao === 'designer_manual') && (
                  <>
                    <label htmlFor="agendamento-data-desejada">
                      {opcaoPublicacao === 'automatico' ? 'Data da publicação' : 'Data desejada'}
                    </label>
                    <input
                      id="agendamento-data-desejada"
                      type="date"
                      value={dataDesejada}
                      min={getSaoPauloNow().date}
                      onChange={(event) => setDataDesejada(event.target.value)}
                      required
                    />

                    <label htmlFor="agendamento-horario-desejado">
                      {opcaoPublicacao === 'automatico' ? 'Horário da publicação' : 'Horário desejado'}
                    </label>
                    <input
                      id="agendamento-horario-desejado"
                      type="time"
                      value={horarioDesejado}
                      onChange={(event) => setHorarioDesejado(event.target.value)}
                      required
                    />

                    <label htmlFor="agendamento-legenda-desejada">Legenda (opcional)</label>
                    <textarea
                      id="agendamento-legenda-desejada"
                      value={legendaDesejada}
                      onChange={(event) => setLegendaDesejada(event.target.value)}
                      maxLength={2200}
                    />
                  </>
                )}

                <div className="designer-form-actions">
                  <button type="submit" disabled={submitting || opcaoPublicacao === null}>
                    {submitting ? 'Enviando…' : 'Confirmar aprovação'}
                  </button>
                  <button type="button" onClick={() => setView('preview')} disabled={submitting}>
                    Voltar
                  </button>
                </div>
              </form>
            )}

            {view === 'confirm-cancelar' && (
              <div className="avaliacao-actions">
                <button
                  type="button"
                  className="avaliacao-cancel"
                  onClick={handleConfirmarCancelamento}
                  disabled={submitting}
                >
                  {submitting ? 'Cancelando…' : 'Confirmar cancelamento'}
                </button>
                <button type="button" onClick={() => setView('preview')} disabled={submitting}>
                  Voltar
                </button>
              </div>
            )}

            {view === 'ajustes-form' && (
              <form className="designer-form" onSubmit={handleSubmitAjuste} aria-label="Solicitar ajustes">
                <label htmlFor="ajuste-descricao">Descreva o que precisa ser ajustado</label>
                <input
                  id="ajuste-descricao"
                  value={descricaoAjuste}
                  onChange={(event) => setDescricaoAjuste(event.target.value)}
                  required
                />

                <label htmlFor="ajuste-observacoes">Observações (opcional)</label>
                <input
                  id="ajuste-observacoes"
                  value={observacoesAjuste}
                  onChange={(event) => setObservacoesAjuste(event.target.value)}
                />

                <FilePreviewPicker
                  id="ajuste-referencia"
                  label="Referência (opcional — PDF, JPG ou PNG)"
                  accept="application/pdf,image/jpeg,image/png"
                  file={referenciaAjuste}
                  onChange={setReferenciaAjuste}
                />

                <div className="designer-form-actions">
                  <button type="submit" disabled={submitting}>
                    {submitting ? 'Enviando…' : 'Enviar pedido de ajustes'}
                  </button>
                  <button type="button" onClick={() => setView('preview')} disabled={submitting}>
                    Voltar
                  </button>
                </div>
              </form>
            )}
          </>
        )}

        {view === 'submitted' && submittedStatus && (
          <>
            <h1>Obrigado!</h1>
            <p className="atendimento-success">{SUBMITTED_MESSAGE[submittedStatus]}</p>
            {agendamentoAutomaticoCriado === true && (
              <p className="atendimento-success">Publicação agendada automaticamente com sucesso.</p>
            )}
            {agendamentoAutomaticoCriado === false && (
              <p role="alert" className="auth-error">
                Não foi possível agendar automaticamente (verifique se o Instagram continua conectado). O designer
                responsável vai agendar manualmente.
              </p>
            )}
          </>
        )}

        {(view === 'preview' || view === 'ajustes-form' || view === 'confirm-cancelar' || view === 'aprovar-agendamento') && (
          <p className="avaliacao-lgpd-note">
            Seus dados (avaliação, ajustes e referências enviadas) são usados apenas para o
            fluxo de aprovação desta arte, conforme a LGPD (Lei nº 13.709/2018).
          </p>
        )}
      </div>
    </main>
  );
}
