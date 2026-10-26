import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthContextValue } from '../auth/auth-context';

const { listSolicitacoesMock, listAgendamentosMock, listClientesMock, useAuthMock } = vi.hoisted(() => ({
  listSolicitacoesMock: vi.fn(),
  listAgendamentosMock: vi.fn(),
  listClientesMock: vi.fn(),
  useAuthMock: vi.fn(),
}));

vi.mock('./clientes/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./clientes/api')>();
  return { ...actual, listClientes: listClientesMock };
});

vi.mock('./solicitacoes/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./solicitacoes/api')>();
  return { ...actual, listSolicitacoes: listSolicitacoesMock };
});

vi.mock('./agendamentos/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./agendamentos/api')>();
  return { ...actual, listAgendamentos: listAgendamentosMock };
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
  refreshProfile: vi.fn().mockResolvedValue(undefined),
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
    listAgendamentosMock.mockReset().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 });
    listClientesMock.mockReset().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 });
    useAuthMock.mockReset().mockReturnValue(baseAuth);
  });

  describe('acompanhamento de clientes e artes (RF003 + RF005, abaixo do CTA)', () => {
    it('lista cada cliente com suas solicitações e status reais, linkando para o detalhe', async () => {
      listClientesMock.mockResolvedValue({
        items: [
          { id: 7, idDesigner: 'designer-1', nome: 'Cliente Com Arte', whatsapp: '5564999990000', instagram: null, observacao: null },
        ],
        total: 1,
        page: 1,
        pageSize: 20,
      });
      listSolicitacoesMock.mockImplementation(({ status }: { status: string }) =>
        Promise.resolve({
          items:
            status === 'Ajustes'
              ? [
                  {
                    id: 99,
                    idCliente: 7,
                    clienteNome: 'Cliente Com Arte',
                    idDesigner: 'designer-1',
                    tema: 'Post de lançamento',
                    status: 'Ajustes',
                    dataCriacao: new Date().toISOString(),
                    prazoPrimeiraVersao: new Date().toISOString(),
                    prazoAtual: { tipo: 'nova_versao', dataHora: null, responsavel: 'designer' },
                  },
                ]
              : [],
          total: status === 'Ajustes' ? 1 : 0,
          page: 1,
          pageSize: 20,
        }),
      );

      renderPage();

      const titulo = await screen.findByText('Clientes e artes em andamento');
      // O nome do cliente também aparece em "prazos próximos" (status
      // 'Ajustes' tem prazo de designer) — por isso a busca é escopada à
      // seção de acompanhamento, não global.
      const secao = titulo.closest('section') as HTMLElement;
      expect(within(secao).getByText('Cliente Com Arte')).toBeInTheDocument();
      const link = within(secao).getByRole('link', { name: 'Post de lançamento' });
      expect(link).toHaveAttribute('href', '/designer/solicitacoes/99');
      expect(within(secao).getByText('Ajustes')).toBeInTheDocument();
    });

    it('não polui o acompanhamento com cliente que ainda não tem arte', async () => {
      listClientesMock.mockResolvedValue({
        items: [
          { id: 8, idDesigner: 'designer-1', nome: 'Cliente Sem Arte', whatsapp: '5564999991111', instagram: null, observacao: null },
        ],
        total: 1,
        page: 1,
        pageSize: 20,
      });
      mockCounts();

      renderPage();

      // O painel operacional acima lista todos os clientes; a seção de
      // acompanhamento só existe quando há arte/solicitação de verdade.
      await screen.findByText('Nenhum prazo próximo no momento.');
      expect(screen.queryByText('Clientes e artes em andamento')).not.toBeInTheDocument();
    });

    it('não mostra a seção de acompanhamento quando o designer não tem cliente', async () => {
      mockCounts();

      renderPage();

      await screen.findByText('Nenhum prazo próximo no momento.');
      expect(screen.queryByText('Clientes e artes em andamento')).not.toBeInTheDocument();
    });
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

  it('rodada correções (item 9): mostra publicações agendadas com link para a solicitação', async () => {
    mockCounts();
    listAgendamentosMock.mockResolvedValue({
      items: [
        {
          idAgendamento: 5,
          idSolicitacao: 99,
          tema: 'Post promocional',
          clienteNome: 'Maria Souza',
          dataPublicacao: '2026-09-26',
          horario: '12:00:00',
          legenda: null,
          status: 'Agendado',
          createdAt: '2026-09-20T00:00:00Z',
        },
      ],
      total: 1,
      page: 1,
      pageSize: 20,
    });

    renderPage();

    const link = await screen.findByRole('link', { name: 'Maria Souza' });
    expect(link).toHaveAttribute('href', '/designer/solicitacoes/99');
    expect(screen.getByText('12:00')).toBeInTheDocument();
  });

  it('não mostra a seção de publicações agendadas quando não há nenhuma', async () => {
    mockCounts();

    renderPage();
    await screen.findByText('Nenhum prazo próximo no momento.');

    expect(screen.queryByText('Publicações agendadas')).not.toBeInTheDocument();
  });

  /**
   * Rodada de correção (auditoria final): a ordem exigida no Dashboard é
   * Iniciar Atendimento → Clientes e artes em andamento → tiles/prazos →
   * Clientes cadastrados (painel operacional).
   */
  it('ordem do Dashboard: Iniciar Atendimento → Clientes e artes em andamento → Clientes cadastrados', async () => {
    listClientesMock.mockResolvedValue({
      items: [
        { id: 7, idDesigner: 'designer-1', nome: 'Cliente Com Arte', whatsapp: '5564999990000', instagram: null, observacao: null },
      ],
      total: 1,
      page: 1,
      pageSize: 20,
    });
    listSolicitacoesMock.mockImplementation(({ status }: { status: string }) =>
      Promise.resolve({
        items:
          status === 'Ajustes'
            ? [
                {
                  id: 99,
                  idCliente: 7,
                  clienteNome: 'Cliente Com Arte',
                  idDesigner: 'designer-1',
                  tema: 'Post de lançamento',
                  status: 'Ajustes',
                  dataCriacao: new Date().toISOString(),
                  prazoPrimeiraVersao: new Date().toISOString(),
                  prazoAtual: { tipo: 'nova_versao', dataHora: null, responsavel: 'designer' },
                },
              ]
            : [],
        total: status === 'Ajustes' ? 1 : 0,
        page: 1,
        pageSize: 20,
      }),
    );

    const { container } = renderPage();

    await screen.findByText('Clientes e artes em andamento');
    await screen.findByText('Clientes cadastrados');

    const ctaIndex = container.innerHTML.indexOf('Iniciar Atendimento');
    const acompanhamentoIndex = container.innerHTML.indexOf('Clientes e artes em andamento');
    const operacionalIndex = container.innerHTML.indexOf('Clientes cadastrados');

    expect(ctaIndex).toBeGreaterThan(-1);
    expect(acompanhamentoIndex).toBeGreaterThan(ctaIndex);
    expect(operacionalIndex).toBeGreaterThan(acompanhamentoIndex);
  });

  it('mostra o aviso de bloqueio (RF006) quando o designer está bloqueado', async () => {
    useAuthMock.mockReturnValue({ ...baseAuth, profile: { ...baseAuth.profile!, bloqueado: true } });
    mockCounts();

    renderPage();

    expect(await screen.findByText(/Você está bloqueado para iniciar novos atendimentos/)).toBeInTheDocument();
  });
});
