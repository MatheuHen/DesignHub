import { act, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { getSessionMock, onAuthStateChangeMock, updateUserMock } = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  onAuthStateChangeMock: vi.fn(),
  updateUserMock: vi.fn(),
}));

vi.mock('../../lib/supabaseClient', () => ({
  isSupabaseConfigured: true,
  supabase: {
    auth: {
      getSession: getSessionMock,
      onAuthStateChange: onAuthStateChangeMock,
      updateUser: updateUserMock,
    },
  },
}));

const { ResetPasswordPage } = await import('./ResetPasswordPage');

function renderPage() {
  return render(
    <MemoryRouter>
      <ResetPasswordPage />
    </MemoryRouter>,
  );
}

/**
 * Item 1 (correções 13/09/2026): link de recuperação inválido/expirado
 * precisa de tela amigável em vez do formulário quebrar ao salvar.
 */
describe('ResetPasswordPage (RF002)', () => {
  const originalHash = window.location.hash;
  const originalSearch = window.location.search;

  beforeEach(() => {
    getSessionMock.mockReset().mockResolvedValue({ data: { session: null } });
    onAuthStateChangeMock
      .mockReset()
      .mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });
    updateUserMock.mockReset();
    window.history.replaceState(null, '', '/redefinir-senha');
  });

  afterEach(() => {
    window.history.replaceState(null, '', `/redefinir-senha${originalSearch}${originalHash}`);
  });

  it('mostra link inválido/expirado imediatamente quando a URL traz error_description da Supabase', async () => {
    window.history.replaceState(
      null,
      '',
      '/redefinir-senha#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired',
    );

    renderPage();

    expect(await screen.findByText('Link inválido ou expirado')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Solicitar novo link' })).toHaveAttribute(
      'href',
      '/esqueci-senha',
    );
  });

  it('mostra o formulário quando existe sessão de recuperação válida', async () => {
    getSessionMock.mockResolvedValue({ data: { session: { access_token: 'recovery-token' } } });

    renderPage();

    expect(await screen.findByLabelText('Nova senha')).toBeInTheDocument();
  });

  it('mostra link inválido/expirado quando nenhuma sessão é estabelecida a tempo', async () => {
    vi.useFakeTimers();
    getSessionMock.mockResolvedValue({ data: { session: null } });

    renderPage();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4100);
    });

    expect(screen.getByText('Link inválido ou expirado')).toBeInTheDocument();
    vi.useRealTimers();
  });
});
