import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { PublicApiError, getAvaliacaoPreview, submitAvaliacao, type AvaliacaoPreview } from './api';

type ViewState = 'loading' | 'error' | 'preview' | 'ajustes-form' | 'confirm-cancelar' | 'submitted';

const FRIENDLY_LINK_MESSAGE: Record<'invalid' | 'expired' | 'used', string> = {
  invalid: 'Este link de avaliação não é válido. Solicite um novo link ao designer responsável.',
  expired: 'Este link de avaliação expirou. Solicite um novo link ao designer responsável.',
  used: 'Este link de avaliação já foi utilizado.',
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

  function handleAprovar() {
    setSubmitting(true);
    setActionError(null);
    submitAvaliacao(token, { decisao: 'Aprovado' })
      .then(() => {
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

        {preview && preview.state !== 'valid' && view !== 'loading' && view !== 'submitted' && (
          <>
            <h1>Avaliação de arte</h1>
            <p role="alert" className="auth-error">
              {FRIENDLY_LINK_MESSAGE[preview.state]}
            </p>
          </>
        )}

        {preview && preview.state === 'valid' && (view === 'preview' || view === 'ajustes-form' || view === 'confirm-cancelar') && (
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
                  onClick={handleAprovar}
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

                <label htmlFor="ajuste-referencia">Referência (opcional — PDF, JPG ou PNG)</label>
                <input
                  id="ajuste-referencia"
                  type="file"
                  accept="application/pdf,image/jpeg,image/png"
                  onChange={(event) => setReferenciaAjuste(event.target.files?.[0] ?? null)}
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
          </>
        )}

        {(view === 'preview' || view === 'ajustes-form' || view === 'confirm-cancelar') && (
          <p className="avaliacao-lgpd-note">
            Seus dados (avaliação, ajustes e referências enviadas) são usados apenas para o
            fluxo de aprovação desta arte, conforme a LGPD (Lei nº 13.709/2018).
          </p>
        )}
      </div>
    </main>
  );
}
