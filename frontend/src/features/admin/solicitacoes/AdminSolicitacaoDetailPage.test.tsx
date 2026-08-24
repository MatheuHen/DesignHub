import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { SolicitacaoDetailResult } from '../../designer/solicitacoes/api';

const { getSolicitacaoDetailMock } = vi.hoisted(() => ({
  getSolicitacaoDetailMock: vi.fn(),
}));

vi.mock('../../designer/solicitacoes/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../designer/solicitacoes/api')>();
  return {
    ...actual,
    getSolicitacaoDetail: getSolicitacaoDetailMock,
  };
});

vi.mock('../../auth/useAuth', () => ({
  useAuth: () => ({
    status: 'signed-in',
    session: null,
    profile: {
      id: 'admin-1',
      email: 'admin@exemplo.adm',
      nomeCompleto: 'Ana Admin',
      perfil: 'administrador',
      status: 'ativo',
      bloqueado: null,
    },
    profileError: null,
    signIn: vi.fn(),
    signOut: vi.fn(),
  }),
}));

const { AdminSolicitacaoDetailPage } = await import('./AdminSolicitacaoDetailPage');

const sampleDetail: SolicitacaoDetailResult = {
  solicitacao: {
    id: 10,
    idCliente: 1,
    clienteNome: 'Cliente Teste',
    idDesigner: 'designer-2',
    tema: 'Tema X',
    status: 'Aprovado',
    dataCriacao: '2026-01-01T00:00:00Z',
    prazoPrimeiraVersao: '2026-01-06T00:00:00Z',
    descricao: null,
    cores: 'Azul',
    observacoes: 'Observação teste',
  },
  historico: [
    {
      id_historico: 1,
      acao: 'Solicitação criada',
      status_anterior: null,
      status_novo: 'Em produção',
      data_hora: '2026-01-01T00:00:00Z',
    },
  ],
  respostasAtendimento: [],
  versoes: [
    { id_versao: 1, numero_versao: 1, formato: 'PNG', data_envio: '2026-01-02T00:00:00Z', observacoes: null },
  ],
  ajustes: [],
  agendamento: null,
  preferenciaAgendamento: null,
};

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/admin/solicitacoes/10']}>
      <Routes>
        <Route path="/admin/solicitacoes/:id" element={<AdminSolicitacaoDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('AdminSolicitacaoDetailPage (RF016/QUADRO 61: Consultar solicitação de qualquer designer)', () => {
  it('exibe os dados da solicitação em modo somente leitura, sem ações de escrita', async () => {
    getSolicitacaoDetailMock.mockResolvedValue(sampleDetail);

    renderPage();

    expect(await screen.findByText('Cliente Teste')).toBeInTheDocument();
    expect(screen.getByText('Aprovado')).toBeInTheDocument();
    expect(screen.getByText('Tema X')).toBeInTheDocument();
    expect(screen.getByText('Azul')).toBeInTheDocument();
    expect(screen.getByText(/V1 — PNG/)).toBeInTheDocument();
    expect(screen.getByText(/Solicitação criada/)).toBeInTheDocument();

    expect(getSolicitacaoDetailMock).toHaveBeenCalledWith(10);
    expect(screen.queryByRole('button', { name: /salvar/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /reatribuir/i })).not.toBeInTheDocument();
  });
});
