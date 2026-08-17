import { useState, type FormEvent } from 'react';
import type { Designer } from './api';

export interface CreateFormValues {
  nomeCompleto: string;
  email: string;
  whatsapp: string;
}

export interface EditFormValues {
  nomeCompleto: string;
  whatsapp: string;
  statusOperacional: string;
}

interface CreatePanelProps {
  mode: 'create';
  onSubmit: (values: CreateFormValues) => Promise<void>;
  onCancel: () => void;
}

interface EditPanelProps {
  mode: 'edit';
  designer: Designer;
  onSubmit: (values: EditFormValues) => Promise<void>;
  onCancel: () => void;
}

type DesignerFormPanelProps = CreatePanelProps | EditPanelProps;

/** RF001: formulário de inclusão/edição de designer. */
export function DesignerFormPanel(props: DesignerFormPanelProps) {
  const isCreate = props.mode === 'create';
  const [nomeCompleto, setNomeCompleto] = useState(isCreate ? '' : props.designer.nomeCompleto);
  const [email, setEmail] = useState('');
  const [whatsapp, setWhatsapp] = useState(isCreate ? '' : (props.designer.whatsapp ?? ''));
  const [statusOperacional, setStatusOperacional] = useState(
    isCreate ? '' : (props.designer.statusOperacional ?? ''),
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    const submission = props.mode === 'create'
      ? props.onSubmit({ nomeCompleto, email, whatsapp })
      : props.onSubmit({ nomeCompleto, whatsapp, statusOperacional });

    void submission
      .catch((submitError: unknown) => {
        setError(submitError instanceof Error ? submitError.message : 'Não foi possível salvar.');
      })
      .finally(() => setSubmitting(false));
  }

  return (
    <form className="designer-form" onSubmit={handleSubmit} aria-label={isCreate ? 'Novo designer' : 'Editar designer'}>
      <h2>{isCreate ? 'Novo designer' : `Editar ${props.designer.nomeCompleto}`}</h2>

      <label htmlFor="designer-nome">Nome completo</label>
      <input
        id="designer-nome"
        required
        minLength={3}
        value={nomeCompleto}
        onChange={(event) => setNomeCompleto(event.target.value)}
      />

      {isCreate && (
        <>
          <label htmlFor="designer-email">E-mail</label>
          <input
            id="designer-email"
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </>
      )}

      <label htmlFor="designer-whatsapp">WhatsApp</label>
      <input
        id="designer-whatsapp"
        required
        minLength={8}
        value={whatsapp}
        onChange={(event) => setWhatsapp(event.target.value)}
      />

      {!isCreate && (
        <>
          <label htmlFor="designer-status-operacional">Status operacional (opcional)</label>
          <input
            id="designer-status-operacional"
            value={statusOperacional}
            onChange={(event) => setStatusOperacional(event.target.value)}
          />
        </>
      )}

      {error && (
        <p role="alert" className="auth-error">
          {error}
        </p>
      )}

      <div className="designer-form-actions">
        <button type="button" onClick={props.onCancel} disabled={submitting}>
          Cancelar
        </button>
        <button type="submit" disabled={submitting}>
          {submitting ? 'Salvando…' : 'Salvar'}
        </button>
      </div>
    </form>
  );
}
