import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../../lib/apiClient';
import type { Designer } from './api';

const {
  listDesignersMock,
  createDesignerMock,
  deleteDesignerMock,
  setDesignerStatusMock,
  listSolicitacoesAdminMock,
  reassignSolicitacaoMock,
} = vi.hoisted(() => ({
  listDesignersMock: vi.fn(),
  createDesignerMock: vi.fn(),
  deleteDesignerMock: vi.fn(),
  setDesignerStatusMock: vi.fn(),
  listSolicitacoesAdminMock: vi.fn(),
  reassignSolicitacaoMock: vi.fn(),
}));

vi.mock('./api', () => ({
  listDesigners: listDesignersMock,
  createDesigner: createDesignerMock,
  updateDesigner: vi.fn(),
  setDesignerStatus: setDesignerStatusMock,
  deleteDesigner: deleteDesignerMock,
  listSolicitacoesAdmin: listSolicitacoesAdminMock,
  reassignSolicitacao: reassignSolicitacaoMock,
}));

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

const { DesignersPage } = await import('./DesignersPage');

const sampleDesigner: Designer = {
  id: 'designer-1',
  nomeCompleto: 'Dora Designer',
  email: 'dora@exemplo.com',
  status: 'ativo',
  whatsapp: '5511999999999',
  bloqueado: false,
  statusOperacional: null,
};

function renderPage() {
  return render(
    <MemoryRouter>
      <DesignersPage />
    </MemoryRouter>,
  );
}

describe('DesignersPage (RF001/RF015)', () => {
  beforeEach(() => {
    listDesignersMock.mockReset();
    createDesignerMock.mockReset();
    deleteDesignerMock.mockReset();
    setDesignerStatusMock.mockReset();
    listSolicitacoesAdminMock.mockReset().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 });
    reassignSolicitacaoMock.mockReset();
  });

  it('lista os designers retornados pela API', async () => {
    listDesignersMock.mockResolvedValue({ items: [sampleDesigner], total: 1, page: 1, pageSize: 20 });

    renderPage();

    expect(await screen.findByText('Dora Designer')).toBeInTheDocument();
    expect(screen.getByText('dora@exemplo.com')).toBeInTheDocument();
  });

  it('mostra estado vazio quando não há designers', async () => {
    listDesignersMock.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 });

    renderPage();

    expect(await screen.findByText('Nenhum designer encontrado.')).toBeInTheDocument();
  });

  it('exige confirmação antes de excluir um designer', async () => {
    listDesignersMock.mockResolvedValue({ items: [sampleDesigner], total: 1, page: 1, pageSize: 20 });
    deleteDesignerMock.mockResolvedValue(undefined);

    renderPage();
    await screen.findByText('Dora Designer');

    fireEvent.click(screen.getByRole('button', { name: 'Excluir' }));
    expect(deleteDesignerMock).not.toHaveBeenCalled();

    listDesignersMock.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar exclusão' }));

    await waitFor(() => {
      expect(deleteDesignerMock).toHaveBeenCalledWith('designer-1');
    });
  });

  it('exibe o erro do backend quando a exclusão é rejeitada por impedimento histórico', async () => {
    listDesignersMock.mockResolvedValue({ items: [sampleDesigner], total: 1, page: 1, pageSize: 20 });
    deleteDesignerMock.mockRejectedValue(
      new ApiError(
        409,
        'CONFLICT',
        'Não é possível excluir: designer possui clientes ou solicitações vinculados.',
      ),
    );

    renderPage();
    await screen.findByText('Dora Designer');

    fireEvent.click(screen.getByRole('button', { name: 'Excluir' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar exclusão' }));

    expect(
      await screen.findByText(/Não é possível excluir: designer possui clientes/),
    ).toBeInTheDocument();
  });

  it('cria um novo designer a partir do formulário', async () => {
    listDesignersMock.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 });
    createDesignerMock.mockResolvedValue(sampleDesigner);

    renderPage();
    await screen.findByText('Nenhum designer encontrado.');

    fireEvent.click(screen.getByRole('button', { name: '+ Novo Designer' }));

    fireEvent.change(screen.getByLabelText('Nome completo'), { target: { value: 'Dora Designer' } });
    fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: 'dora@exemplo.com' } });
    fireEvent.change(screen.getByLabelText('WhatsApp'), { target: { value: '5511999999999' } });
    fireEvent.change(screen.getByLabelText('Nova Senha'), { target: { value: 'senha-forte-123' } });
    fireEvent.change(screen.getByLabelText('Confirma Senha'), { target: { value: 'senha-forte-123' } });

    listDesignersMock.mockResolvedValue({ items: [sampleDesigner], total: 1, page: 1, pageSize: 20 });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => {
      expect(createDesignerMock).toHaveBeenCalledWith({
        nomeCompleto: 'Dora Designer',
        email: 'dora@exemplo.com',
        whatsapp: '5511999999999',
        senha: 'senha-forte-123',
      });
    });
  });

  it('rejeita a criação quando a confirmação de senha não coincide (FIGURA 28)', async () => {
    listDesignersMock.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 });

    renderPage();
    await screen.findByText('Nenhum designer encontrado.');

    fireEvent.click(screen.getByRole('button', { name: '+ Novo Designer' }));

    fireEvent.change(screen.getByLabelText('Nome completo'), { target: { value: 'Dora Designer' } });
    fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: 'dora@exemplo.com' } });
    fireEvent.change(screen.getByLabelText('WhatsApp'), { target: { value: '5511999999999' } });
    fireEvent.change(screen.getByLabelText('Nova Senha'), { target: { value: 'senha-forte-123' } });
    fireEvent.change(screen.getByLabelText('Confirma Senha'), { target: { value: 'outra-senha' } });

    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByText('As senhas não coincidem.')).toBeInTheDocument();
    expect(createDesignerMock).not.toHaveBeenCalled();
  });
});
