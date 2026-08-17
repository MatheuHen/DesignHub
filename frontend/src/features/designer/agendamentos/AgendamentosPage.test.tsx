import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ListAgendamentosResult } from './api';

const { listAgendamentosMock } = vi.hoisted(() => ({ listAgendamentosMock: vi.fn() }));

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./api')>();
  return { ...actual, listAgendamentos: listAgendamentosMock };
});

const { AgendamentosPage } = await import('./AgendamentosPage');

const sampleResult: ListAgendamentosResult = {
  items: [
    {
      idAgendamento: 1,
      idSolicitacao: 10,
      tema: 'Post promocional',
      clienteNome: 'Cliente Teste',
      dataPublicacao: '2026-09-01',
      horario: '10:00:00',
      legenda: 'Legenda',
      status: 'Agendado',
      createdAt: '2026-08-01T00:00:00Z',
    },
  ],
  total: 1,
  page: 1,
  pageSize: 20,
};

function renderPage() {
  return render(
    <MemoryRouter>
      <AgendamentosPage />
    </MemoryRouter>,
  );
}

describe('AgendamentosPage (RF012)', () => {
  beforeEach(() => {
    listAgendamentosMock.mockReset();
  });

  it('lista os agendamentos retornados pela API', async () => {
    listAgendamentosMock.mockResolvedValue(sampleResult);

    renderPage();

    expect(await screen.findByText('Cliente Teste')).toBeInTheDocument();
    expect(screen.getByText('Post promocional')).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'Legenda' })).toBeInTheDocument();
  });

  it('mostra estado vazio quando não há agendamentos', async () => {
    listAgendamentosMock.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 });

    renderPage();

    expect(await screen.findByText('Nenhum agendamento encontrado.')).toBeInTheDocument();
  });
});
