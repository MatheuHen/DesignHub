import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Solicitacao } from './api';

const { listSolicitacoesMock } = vi.hoisted(() => ({
  listSolicitacoesMock: vi.fn(),
}));

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./api')>();
  return { ...actual, listSolicitacoes: listSolicitacoesMock };
});

vi.mock('../../auth/useAuth', () => ({
  useAuth: () => ({
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
  }),
}));

const { SolicitacoesPage } = await import('./SolicitacoesPage');

const sampleSolicitacao: Solicitacao = {
  id: 10,
  idCliente: 1,
  clienteNome: 'Cliente Teste',
  idDesigner: 'designer-1',
  tema: 'Tema X',
  status: 'Em produção',
  dataCriacao: '2026-01-01T00:00:00Z',
  prazoPrimeiraVersao: '2026-01-06T00:00:00Z',
  prazoAtual: { tipo: 'primeira_versao', dataHora: '2026-01-06T00:00:00Z', responsavel: 'designer' },
};

function renderPage() {
  return render(
    <MemoryRouter>
      <SolicitacoesPage />
    </MemoryRouter>,
  );
}

describe('SolicitacoesPage (RF005)', () => {
  beforeEach(() => {
    listSolicitacoesMock.mockReset();
  });

  it('lista as solicitações retornadas pela API', async () => {
    listSolicitacoesMock.mockResolvedValue({ items: [sampleSolicitacao], total: 1, page: 1, pageSize: 20 });

    renderPage();

    expect(await screen.findByText('Cliente Teste')).toBeInTheDocument();
    expect(screen.getByText('Tema X')).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'Em produção' })).toBeInTheDocument();
  });

  it('mostra estado vazio quando não há solicitações', async () => {
    listSolicitacoesMock.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 });

    renderPage();

    expect(await screen.findByText('Nenhuma solicitação encontrada.')).toBeInTheDocument();
  });

  it('inicializa o filtro de status a partir da URL (link vindo do painel de pendências)', async () => {
    listSolicitacoesMock.mockResolvedValue({ items: [sampleSolicitacao], total: 1, page: 1, pageSize: 20 });

    render(
      <MemoryRouter initialEntries={['/designer/solicitacoes?status=Ajustes']}>
        <SolicitacoesPage />
      </MemoryRouter>,
    );

    await screen.findByText('Cliente Teste');

    expect(listSolicitacoesMock).toHaveBeenCalledWith({ status: 'Ajustes' });
    expect(screen.getByRole('combobox', { name: 'Status' })).toHaveValue('Ajustes');
  });

  describe('item 6/6.1/6.2 (rodada final): coluna "Prazo para vencimento" dinâmica', () => {
    it('renomeia o cabeçalho da coluna (deixa de ser "Prazo 1ª versão")', async () => {
      listSolicitacoesMock.mockResolvedValue({ items: [sampleSolicitacao], total: 1, page: 1, pageSize: 20 });

      renderPage();
      await screen.findByText('Cliente Teste');

      expect(screen.getByRole('columnheader', { name: 'Prazo para vencimento' })).toBeInTheDocument();
      expect(screen.queryByRole('columnheader', { name: 'Prazo 1ª versão' })).not.toBeInTheDocument();
    });

    it('"Em produção": mostra o responsável Designer e o prazo da 1ª versão (RF006/RN11)', async () => {
      listSolicitacoesMock.mockResolvedValue({ items: [sampleSolicitacao], total: 1, page: 1, pageSize: 20 });

      renderPage();

      expect(await screen.findByText('Designer')).toBeInTheDocument();
    });

    it('"Enviado para avaliação": mostra o responsável Cliente e a validade do link (RF009)', async () => {
      listSolicitacoesMock.mockResolvedValue({
        items: [
          {
            ...sampleSolicitacao,
            status: 'Enviado para avaliação',
            prazoAtual: {
              tipo: 'validade_link_avaliacao',
              dataHora: '2099-01-10T18:00:00Z',
              responsavel: 'cliente',
            },
          },
        ],
        total: 1,
        page: 1,
        pageSize: 20,
      });

      renderPage();

      expect(await screen.findByText('Cliente')).toBeInTheDocument();
      expect(screen.getByText(/Link válido até/)).toBeInTheDocument();
    });

    it('"Ajustes"/"Aprovado" sem SLA documentado: mostra "Sem prazo definido", nunca inventa uma data (item 6.2)', async () => {
      listSolicitacoesMock.mockResolvedValue({
        items: [
          {
            ...sampleSolicitacao,
            status: 'Ajustes',
            prazoAtual: { tipo: 'sem_prazo_definido', dataHora: null, responsavel: 'designer' },
          },
        ],
        total: 1,
        page: 1,
        pageSize: 20,
      });

      renderPage();

      expect(await screen.findByText('Sem prazo definido')).toBeInTheDocument();
    });

    it('estados terminais (Publicado/Cancelado) mostram "—" em vez de um prazo', async () => {
      listSolicitacoesMock.mockResolvedValue({
        items: [
          {
            ...sampleSolicitacao,
            status: 'Publicado',
            prazoAtual: { tipo: 'terminal', dataHora: null, responsavel: null },
          },
        ],
        total: 1,
        page: 1,
        pageSize: 20,
      });

      renderPage();
      await screen.findByText('Cliente Teste');

      expect(screen.getByText('—')).toBeInTheDocument();
    });
  });
});
