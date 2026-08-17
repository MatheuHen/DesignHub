import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthContextValue } from '../auth/auth-context';

const { listSolicitacoesMock, useAuthMock } = vi.hoisted(() => ({
  listSolicitacoesMock: vi.fn(),
  useAuthMock: vi.fn(),
}));

vi.mock('./solicitacoes/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./solicitacoes/api')>();
  return { ...actual, listSolicitacoes: listSolicitacoesMock };
});

vi.mock('../auth/useAuth', () => ({ useAuth: useAuthMock }));

const { DesignerHome } = await import('./DesignerHome');

const baseAuth: AuthContextValue = {
  status: 'signed-in',
  session: null,
  profile: {
    id: 'designer-1',
    email: 'designer@exemplo.com',
    nomeCompleto: 'Dora Designer',
    perfil: 'designer',
    status: 'ativo',
    bloqueado: false,
  },
  profileError: null,
  signIn: vi.fn(),
  signOut: vi.fn(),
};

function renderPage() {
  return render(
    <MemoryRouter>
      <DesignerHome />
    </MemoryRouter>,
  );
}

describe('DesignerHome — pendências (RF005/RF011, RN13-RN14)', () => {
  beforeEach(() => {
    listSolicitacoesMock.mockReset();
    useAuthMock.mockReset().mockReturnValue(baseAuth);
  });

  it('mostra as pendências reais retornadas pela API, com link filtrado por status', async () => {
    listSolicitacoesMock.mockImplementation(({ status }: { status: string }) =>
      Promise.resolve({
        items: [],
        total: status === 'Ajustes' ? 2 : status === 'Agendado' ? 1 : 0,
        page: 1,
        pageSize: 20,
      }),
    );

    renderPage();

    const link = await screen.findByRole('link', { name: /Aguardando nova versão.*: 2/ });
    expect(link).toHaveAttribute('href', '/designer/solicitacoes?status=Ajustes');
    expect(screen.getByRole('link', { name: /Agendadas aguardando publicação: 1/ })).toBeInTheDocument();
    expect(screen.queryByText(/Aguardando avaliação do cliente/)).not.toBeInTheDocument();
  });

  it('mostra estado vazio quando não há pendências', async () => {
    listSolicitacoesMock.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 });

    renderPage();

    expect(await screen.findByText('Nenhuma pendência no momento.')).toBeInTheDocument();
  });

  it('reporta erro quando a API de pendências falha, sem mascarar', async () => {
    listSolicitacoesMock.mockRejectedValue(new Error('rede indisponível'));

    renderPage();

    expect(await screen.findByText('Não foi possível carregar as pendências.')).toBeInTheDocument();
  });
});
