import { useState, type FormEvent } from 'react';
import { PasswordInput } from '../../../components/PasswordInput';
import type { Designer } from './api';

export interface CreateFormValues {
  nomeCompleto: string;
  email: string;
  whatsapp: string;
  senha: string;
}

export interface EditFormValues {
  nomeCompleto: string;
  whatsapp: string;
  /** RF001/item 2.1: preenchidos apenas quando o Admin decide trocar a senha. */
  novaSenha?: string;
  confirmaSenha?: string;
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
  const [senha, setSenha] = useState('');
  const [confirmaSenha, setConfirmaSenha] = useState('');
  const [whatsapp, setWhatsapp] = useState(isCreate ? '' : (props.designer.whatsapp ?? ''));
  const [novaSenha, setNovaSenha] = useState('');
  const [confirmaNovaSenha, setConfirmaNovaSenha] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (props.mode === 'create' && senha !== confirmaSenha) {
      setError('As senhas não coincidem.');
      return;
    }

    if (props.mode === 'edit' && (novaSenha || confirmaNovaSenha) && novaSenha !== confirmaNovaSenha) {
      setError('As senhas informadas não coincidem.');
      return;
    }

    setSubmitting(true);
    setError(null);

    const submission =
      props.mode === 'create'
        ? props.onSubmit({ nomeCompleto, email, whatsapp, senha })
        : props.onSubmit({
            nomeCompleto,
            whatsapp,
            ...(novaSenha ? { novaSenha, confirmaSenha: confirmaNovaSenha } : {}),
          });

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

          <label htmlFor="designer-senha">Nova Senha</label>
          <PasswordInput
            id="designer-senha"
            required
            minLength={8}
            autoComplete="new-password"
            value={senha}
            onChange={(event) => setSenha(event.target.value)}
          />

          <label htmlFor="designer-confirma-senha">Confirma Senha</label>
          <PasswordInput
            id="designer-confirma-senha"
            required
            minLength={8}
            autoComplete="new-password"
            value={confirmaSenha}
            onChange={(event) => setConfirmaSenha(event.target.value)}
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
          <fieldset className="designer-form-senha">
            <legend>Alterar senha (opcional)</legend>

            <label htmlFor="designer-nova-senha">Nova senha</label>
            <PasswordInput
              id="designer-nova-senha"
              minLength={8}
              autoComplete="new-password"
              value={novaSenha}
              onChange={(event) => setNovaSenha(event.target.value)}
            />

            <label htmlFor="designer-confirma-nova-senha">Confirmar nova senha</label>
            <PasswordInput
              id="designer-confirma-nova-senha"
              minLength={8}
              autoComplete="new-password"
              value={confirmaNovaSenha}
              onChange={(event) => setConfirmaNovaSenha(event.target.value)}
            />
          </fieldset>
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
