import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PasswordInput } from './PasswordInput';

describe('PasswordInput (item 2.2 — olhinho)', () => {
  it('inicia oculto e alterna para texto visível ao clicar no botão', () => {
    render(<PasswordInput aria-label="Senha" value="segredo123" onChange={vi.fn()} />);

    const input = screen.getByLabelText<HTMLInputElement>('Senha');
    expect(input.type).toBe('password');

    fireEvent.click(screen.getByRole('button', { name: 'Mostrar senha' }));
    expect(input.type).toBe('text');

    fireEvent.click(screen.getByRole('button', { name: 'Ocultar senha' }));
    expect(input.type).toBe('password');
  });
});
