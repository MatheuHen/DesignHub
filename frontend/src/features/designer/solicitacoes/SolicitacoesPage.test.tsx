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
});
