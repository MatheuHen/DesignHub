import { useEffect } from 'react';

/**
 * Correção de UX: bugs/avisos de erro e sucesso (ex.: "cliente possui
 * solicitações vinculadas") ficavam presos na tela indefinidamente. Limpa
 * automaticamente o estado após `delayMs` (10s por padrão); qualquer nova
 * ação do usuário que gere um novo aviso reinicia a contagem normalmente
 * (o efeito reagenda sempre que `value` muda).
 */
export function useAutoDismiss(value: unknown, clear: () => void, delayMs = 10_000): void {
  useEffect(() => {
    if (value === null || value === undefined) return;
    const timeout = setTimeout(clear, delayMs);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, delayMs]);
}
