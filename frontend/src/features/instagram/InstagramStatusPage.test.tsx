import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthContextValue } from '../auth/auth-context';

const { useAuthMock } = vi.hoisted(() => ({ useAuthMock: vi.fn() }));

vi.mock('../auth/useAuth', () => ({ useAuth: useAuthMock }));

const { InstagramStatusPage } = await import('./InstagramStatusPage');

const signedOutAuth: AuthContextValue = {
  status: 'signed-out',
  session: null,
  profile: null,
  profileError: null,
  signIn: vi.fn(),
  signOut: vi.fn(),
  refreshProfile: vi.fn().mockResolvedValue(undefined),
};

function renderPage(search: string) {
  return render(
    <MemoryRouter initialEntries={[`/instagram/status${search}`]}>
      <InstagramStatusPage />
    </MemoryRouter>,
  );
}

describe('InstagramStatusPage (item 12.2/13.3 — destino público do callback OAuth)', () => {
  beforeEach(() => {
    useAuthMock.mockReset().mockReturnValue(signedOutAuth);
  });

  it('mostra mensagem de sucesso quando resultado=conectado e não há sessão', () => {
    renderPage('?resultado=conectado');

    expect(screen.getByText('Instagram conectado com sucesso')).toBeInTheDocument();
    expect(screen.getByText('Você pode fechar esta página.')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Voltar para Clientes' })).not.toBeInTheDocument();
  });

  it('mostra mensagem de erro quando resultado=erro (nunca abre o painel do designer)', () => {
    renderPage('?resultado=erro');

    expect(screen.getByText('Não foi possível conectar o Instagram')).toBeInTheDocument();
    expect(
      screen.getByText('Peça um novo link de conexão ao designer responsável e tente novamente.'),
    ).toBeInTheDocument();
  });

  it('trata qualquer valor diferente de "conectado" como erro (fail-safe)', () => {
    renderPage('');

    expect(screen.getByText('Não foi possível conectar o Instagram')).toBeInTheDocument();
  });

  it('designer com sessão ativa vê um link de volta para Clientes', () => {
    useAuthMock.mockReturnValue({
      ...signedOutAuth,
      status: 'signed-in',
      profile: {
        id: 'designer-1',
        email: 'designer@exemplo.com',
        nomeCompleto: 'Dora Designer',
        perfil: 'designer',
        status: 'ativo',
        bloqueado: false,
      },
    });

    renderPage('?resultado=conectado');

    expect(screen.getByRole('link', { name: 'Voltar para Clientes' })).toHaveAttribute(
      'href',
      '/designer/clientes',
    );
  });

  describe('quando aberta como popup (window.opener presente)', () => {
    let closeSpy: ReturnType<typeof vi.fn>;
    let postMessageSpy: ReturnType<typeof vi.fn>;
    let originalOpener: Window | null;
    let originalClose: () => void;

    beforeEach(() => {
      postMessageSpy = vi.fn();
      closeSpy = vi.fn();
      originalOpener = window.opener as Window | null;
      originalClose = window.close.bind(window);
      Object.defineProperty(window, 'opener', {
        configurable: true,
        value: { postMessage: postMessageSpy },
      });
      Object.defineProperty(window, 'close', { configurable: true, value: closeSpy });
    });

    afterEach(() => {
      Object.defineProperty(window, 'opener', { configurable: true, value: originalOpener });
      Object.defineProperty(window, 'close', { configurable: true, value: originalClose });
    });

    it('item 12.1 (regressão via fallback universal): repassa o resultado por postMessage (mesma origem) e fecha a janela, sem renderizar nada', () => {
      const { container } = renderPage('?resultado=conectado');

      expect(postMessageSpy).toHaveBeenCalledWith(
        { source: 'designhub-instagram-oauth', resultado: 'conectado' },
        window.location.origin,
      );
      expect(closeSpy).toHaveBeenCalledOnce();
      expect(container).toBeEmptyDOMElement();
    });

    it('repassa erro por postMessage também, mesmo sem saber a origem no backend', () => {
      renderPage('?resultado=erro');

      expect(postMessageSpy).toHaveBeenCalledWith(
        { source: 'designhub-instagram-oauth', resultado: 'erro' },
        window.location.origin,
      );
      expect(closeSpy).toHaveBeenCalledOnce();
    });
  });
});
