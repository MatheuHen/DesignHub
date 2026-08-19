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

/** Todas as chamadas usam o mesmo shape; sobrescrevemos por status quando necessário. */
function mockCounts(overrides: Partial<Record<string, number>> = {}, emProducaoItems: unknown[] = []) {
  listSolicitacoesMock.mockImplementation(({ status }: { status: string }) =>
    Promise.resolve({
      items: status === 'Em produção' ? emProducaoItems : [],
      total: overrides[status] ?? 0,
      page: 1,
      pageSize: 20,
    }),
  );
}

describe('DesignerHome — Dashboard (RF005/RF011/RN13-RN14, FIGURA 7/15/22)', () => {
  beforeEach(() => {
    listSolicitacoesMock.mockReset();
    useAuthMock.mockReset().mockReturnValue(baseAuth);
  });

  it('mostra um tile real por status, cada um linkando para a listagem filtrada', async () => {
    mockCounts({ Ajustes: 2, Agendado: 1 });

    renderPage();

    const ajustesTile = await screen.findByRole('link', { name: /Ajustes.*2/s });
    expect(ajustesTile).toHaveAttribute('href', '/designer/solicitacoes?status=Ajustes');
    const agendadoTile = screen.getByRole('link', { name: /Agendado.*1/s });
    expect(agendadoTile).toHaveAttribute('href', '/designer/solicitacoes?status=Agendado');
  });

  it('mostra estado vazio de prazos quando não há solicitações em produção', async () => {
    mockCounts();

    renderPage();

    expect(await screen.findByText('Nenhum prazo próximo no momento.')).toBeInTheDocument();
  });

  it('lista prazos próximos derivados de dados reais, com link para a solicitação', async () => {
    const hoje = new Date();
    const prazoHoje = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate()).toISOString();

    mockCounts({}, [
      {
        id: 42,
        idCliente: 1,
        clienteNome: 'João Silva',
        idDesigner: 'designer-1',
        tema: 'Post',
        status: 'Em produção',
        dataCriacao: prazoHoje,
        prazoPrimeiraVersao: prazoHoje,
      },
    ]);

    renderPage();

    const link = await screen.findByRole('link', { name: 'João Silva' });
    expect(link).toHaveAttribute('href', '/designer/solicitacoes/42');
    expect(screen.getByText('Hoje')).toBeInTheDocument();
  });

  it('reporta erro quando a API falha, sem mascarar', async () => {
    listSolicitacoesMock.mockRejectedValue(new Error('rede indisponível'));

    renderPage();

    expect(await screen.findByText('Não foi possível carregar o dashboard.')).toBeInTheDocument();
  });

  it('mostra o aviso de bloqueio (RF006) quando o designer está bloqueado', async () => {
    useAuthMock.mockReturnValue({ ...baseAuth, profile: { ...baseAuth.profile!, bloqueado: true } });
    mockCounts();

    renderPage();

    expect(await screen.findByText(/Você está bloqueado para iniciar novos atendimentos/)).toBeInTheDocument();
  });
});
