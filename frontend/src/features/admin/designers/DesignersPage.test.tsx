import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Designer } from './api';

const {
  listDesignersMock,
  createDesignerMock,
  setDesignerStatusMock,
  listSolicitacoesAdminMock,
  reassignSolicitacaoMock,
} = vi.hoisted(() => ({
  listDesignersMock: vi.fn(),
  createDesignerMock: vi.fn(),
  setDesignerStatusMock: vi.fn(),
  listSolicitacoesAdminMock: vi.fn(),
  reassignSolicitacaoMock: vi.fn(),
}));

vi.mock('./api', () => ({
  listDesigners: listDesignersMock,
  createDesigner: createDesignerMock,
  updateDesigner: vi.fn(),
  setDesignerStatus: setDesignerStatusMock,
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
    setDesignerStatusMock.mockReset();
    listSolicitacoesAdminMock.mockReset().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 });
    reassignSolicitacaoMock.mockReset();
  });

  it('lista os designers retornados pela API', async () => {
    listDesignersMock.mockResolvedValue({ items: [sampleDesigner], total: 1, page: 1, pageSize: 20 });

    renderPage();

    expect(await screen.findByRole('cell', { name: 'Dora Designer' })).toBeInTheDocument();
    expect(screen.getByText('dora@exemplo.com')).toBeInTheDocument();
  });

  it('mostra estado vazio quando não há designers', async () => {
    listDesignersMock.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 });

    renderPage();

    expect(await screen.findByText('Nenhum designer encontrado.')).toBeInTheDocument();
  });

  it('ajuste do orientador: não existe ação de excluir para designer ativo (só Editar/Inativar)', async () => {
    listDesignersMock.mockResolvedValue({ items: [sampleDesigner], total: 1, page: 1, pageSize: 20 });

    renderPage();
    await screen.findByRole('cell', { name: 'Dora Designer' });

    expect(screen.getByRole('button', { name: 'Editar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Inativar' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Excluir' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Confirmar exclusão' })).not.toBeInTheDocument();
  });

  it('ajuste do orientador: não existe ação de excluir para designer inativo (só Editar/Ativar)', async () => {
    listDesignersMock.mockResolvedValue({
      items: [{ ...sampleDesigner, status: 'inativo' }],
      total: 1,
      page: 1,
      pageSize: 20,
    });

    renderPage();
    await screen.findByRole('cell', { name: 'Dora Designer' });

    expect(screen.getByRole('button', { name: 'Editar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ativar' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Excluir' })).not.toBeInTheDocument();
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

  it('permite pesquisar o designer no filtro "Designer atual" das solicitações atribuídas', async () => {
    listDesignersMock.mockResolvedValue({ items: [sampleDesigner], total: 1, page: 1, pageSize: 20 });

    renderPage();
    await screen.findByRole('cell', { name: 'Dora Designer' });

    const searchInput = screen.getByLabelText('Designer atual');
    expect(searchInput.tagName).toBe('INPUT');
    expect(document.getElementById('solic-designer-options')?.querySelector('option')?.getAttribute('value')).toBe(
      'Dora Designer',
    );

    fireEvent.change(searchInput, { target: { value: 'Dora Designer' } });

    await waitFor(() => {
      expect(listSolicitacoesAdminMock).toHaveBeenCalledWith(
        expect.objectContaining({ idDesigner: 'designer-1' }),
      );
    });
  });
});
