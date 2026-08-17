import { useState, type FormEvent } from 'react';
import type { Cliente } from './api';

export interface ClienteFormValues {
  nome: string;
  whatsapp: string;
  instagram: string;
}

interface CreatePanelProps {
  mode: 'create';
  onSubmit: (values: ClienteFormValues) => Promise<void>;
  onCancel: () => void;
}

interface EditPanelProps {
  mode: 'edit';
  cliente: Cliente;
  onSubmit: (values: ClienteFormValues) => Promise<void>;
  onCancel: () => void;
}

type ClienteFormPanelProps = CreatePanelProps | EditPanelProps;

/** RF003: formulário de inclusão/edição de cliente. */
export function ClienteFormPanel(props: ClienteFormPanelProps) {
  const isCreate = props.mode === 'create';
  const [nome, setNome] = useState(isCreate ? '' : props.cliente.nome);
  const [whatsapp, setWhatsapp] = useState(isCreate ? '' : props.cliente.whatsapp);
  const [instagram, setInstagram] = useState(isCreate ? '' : (props.cliente.instagram ?? ''));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    void props
      .onSubmit({ nome, whatsapp, instagram })
      .catch((submitError: unknown) => {
        setError(submitError instanceof Error ? submitError.message : 'Não foi possível salvar.');
      })
      .finally(() => setSubmitting(false));
  }

  return (
    <form
      className="designer-form"
      onSubmit={handleSubmit}
      aria-label={isCreate ? 'Novo cliente' : 'Editar cliente'}
    >
      <h2>{isCreate ? 'Novo cliente' : `Editar ${props.cliente.nome}`}</h2>

      <label htmlFor="cliente-nome">Nome</label>
      <input id="cliente-nome" required minLength={2} value={nome} onChange={(event) => setNome(event.target.value)} />

      <label htmlFor="cliente-whatsapp">WhatsApp</label>
      <input
        id="cliente-whatsapp"
        required
        minLength={8}
        value={whatsapp}
        onChange={(event) => setWhatsapp(event.target.value)}
      />

      <label htmlFor="cliente-instagram">Instagram (opcional)</label>
      <input
        id="cliente-instagram"
        value={instagram}
        onChange={(event) => setInstagram(event.target.value)}
      />

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
