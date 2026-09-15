import { useState, type InputHTMLAttributes } from 'react';

type PasswordInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>;

/**
 * Campo de senha com alternância de visibilidade ("olhinho"). Puramente de
 * UX/acessibilidade (RNF002) — não altera nenhum fluxo de negócio.
 */
export function PasswordInput({ className, ...inputProps }: PasswordInputProps) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="password-field">
      <input
        {...inputProps}
        type={visible ? 'text' : 'password'}
        className={['password-field-input', className].filter(Boolean).join(' ')}
      />
      <button
        type="button"
        className="password-toggle"
        onClick={() => setVisible((current) => !current)}
        aria-label={visible ? 'Ocultar senha' : 'Mostrar senha'}
        aria-pressed={visible}
      >
        {visible ? (
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
            <path
              fill="currentColor"
              d="M12 6c-5 0-9.27 3.11-11 7 .69 1.57 1.71 2.98 2.99 4.16l1.46-1.46A9.99 9.99 0 0 1 3.18 13a10.94 10.94 0 0 1 17.64 0 10.9 10.9 0 0 1-2.27 2.7l1.42 1.42A12.9 12.9 0 0 0 23 13c-1.73-3.89-6-7-11-7Zm-9.71-1.29 2.5 2.5A5.99 5.99 0 0 0 6 13a6 6 0 0 0 8.79 5.29l2.21 2.21 1.41-1.41L3.7 3.29 2.29 4.71ZM12 17a4 4 0 0 1-4-4c0-.61.15-1.18.41-1.69l5.28 5.28c-.51.26-1.08.41-1.69.41Z"
            />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
            <path
              fill="currentColor"
              d="M12 4.5c5 0 9.27 3.11 11 7-1.73 3.89-6 7-11 7S2.73 15.39 1 11.5c1.73-3.89 6-7 11-7Zm0 2c-3.79 0-7.17 2.13-8.82 5 1.65 2.87 5.03 5 8.82 5s7.17-2.13 8.82-5c-1.65-2.87-5.03-5-8.82-5Zm0 1.5a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7Zm0 2a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Z"
            />
          </svg>
        )}
      </button>
    </div>
  );
}
