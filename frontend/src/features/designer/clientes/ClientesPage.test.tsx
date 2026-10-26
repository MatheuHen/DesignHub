import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../../lib/apiClient';
import type { Cliente } from './api';

const { listClientesMock, createClienteMock, updateClienteMock, deleteClienteMock } = vi.hoisted(() => ({
  listClientesMock: vi.fn(),
  createClienteMock: vi.fn(),
  updateClienteMock: vi.fn(),
  deleteClienteMock: vi.fn(),
}));

vi.mock('./api', () => ({
  listClientes: listClientesMock,
  createCliente: createClienteMock,
  updateCliente: updateClienteMock,
  deleteCliente: deleteClienteMock,
}));

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

const { ClientesPage } = await import('./ClientesPage');

const sampleCliente: Cliente = {
  id: 1,
  idDesigner: 'designer-1',
  nome: 'Cliente Teste',
  whatsapp: '5511988887777',
  instagram: null,
  observacao: 'cliente da farmácia do centro',
};

function renderPage() {
  return render(
    <MemoryRouter>
      <ClientesPage />
    </MemoryRouter>,
  );
}

/**
 * RF003 — rodada de correção da auditoria final: a aba Clientes passou a
 * reunir cadastro + listagem + CRUD completo (editar/excluir), em vez de
 * ter o CRUD exclusivamente no Dashboard.
 */
describe('ClientesPage (RF003 — CRUD completo)', () => {
  beforeEach(() => {
    listClientesMock.mockReset().mockResolvedValue({ items: [sampleCliente], total: 1, page: 1, pageSize: 20 });
    createClienteMock.mockReset();
    updateClienteMock.mockReset();
    deleteClienteMock.mockReset();
  });

  it('lista todos os clientes do designer ao abrir a tela', async () => {
    renderPage();

    expect(await screen.findByText('Cliente Teste')).toBeInTheDocument();
    expect(screen.getByText('5511988887777')).toBeInTheDocument();
  });

  it('abre o formulário de cadastro ao clicar em "+ Novo Cliente" e cria o cliente', async () => {
    createClienteMock.mockResolvedValue({ ...sampleCliente, id: 2, nome: 'Cliente Novo' });

    renderPage();
    await screen.findByText('Cliente Teste');

    fireEvent.click(screen.getByRole('button', { name: '+ Novo Cliente' }));
    expect(screen.getByRole('form', { name: 'Novo cliente' })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Nome *'), { target: { value: 'Cliente Novo' } });
    fireEvent.change(screen.getByLabelText('WhatsApp *'), { target: { value: '5511977776666' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => {
      expect(createClienteMock).toHaveBeenCalledWith({ nome: 'Cliente Novo', whatsapp: '5511977776666' });
    });
    expect(await screen.findByText(/cadastrado/)).toBeInTheDocument();
  });

  it('edita um cliente existente a partir da listagem', async () => {
    updateClienteMock.mockResolvedValue(undefined);
    renderPage();
    await screen.findByText('Cliente Teste');

    fireEvent.click(screen.getByRole('button', { name: 'Editar' }));
    expect(screen.getByRole('form', { name: 'Editar cliente' })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Nome *'), { target: { value: 'Cliente Editado' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => {
      expect(updateClienteMock).toHaveBeenCalledWith(1, expect.objectContaining({ nome: 'Cliente Editado' }));
    });
  });

  it('exige confirmação antes de excluir e mostra erro do backend em caso de impedimento', async () => {
    deleteClienteMock.mockRejectedValue(
      new ApiError(409, 'CONFLICT', 'Não é possível excluir: cliente possui solicitações vinculadas.'),
    );
    renderPage();
    await screen.findByText('Cliente Teste');

    fireEvent.click(screen.getByRole('button', { name: 'Excluir' }));
    expect(deleteClienteMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar exclusão' }));

    expect(await screen.findByText(/possui solicitações vinculadas/)).toBeInTheDocument();
  });

  it('exclui o cliente com sucesso após confirmação', async () => {
    deleteClienteMock.mockResolvedValue(undefined);
    renderPage();
    await screen.findByText('Cliente Teste');

    fireEvent.click(screen.getByRole('button', { name: 'Excluir' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar exclusão' }));

    await waitFor(() => {
      expect(deleteClienteMock).toHaveBeenCalledWith(1);
    });
  });

  it('busca por nome, WhatsApp ou Observação delega ao backend via listClientes', async () => {
    renderPage();
    await screen.findByText('Cliente Teste');

    fireEvent.change(screen.getByLabelText('Buscar'), { target: { value: 'farmácia' } });

    await waitFor(
      () => {
        expect(listClientesMock).toHaveBeenCalledWith({ search: 'farmácia' });
      },
      { timeout: 2000 },
    );
  });

  it('mostra a Observação do cliente na listagem', async () => {
    renderPage();

    expect(await screen.findByText('cliente da farmácia do centro')).toBeInTheDocument();
  });

  it('mostra estado vazio quando não há clientes', async () => {
    listClientesMock.mockReset().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 });

    renderPage();

    expect(await screen.findByText('Nenhum cliente encontrado.')).toBeInTheDocument();
  });

  it('exibe o erro do backend (ex.: WhatsApp duplicado) sem mascarar ao cadastrar', async () => {
    createClienteMock.mockRejectedValue(new Error('Você já tem um cliente cadastrado com este WhatsApp.'));
    renderPage();
    await screen.findByText('Cliente Teste');

    fireEvent.click(screen.getByRole('button', { name: '+ Novo Cliente' }));
    fireEvent.change(screen.getByLabelText('Nome *'), { target: { value: 'Cliente Repetido' } });
    fireEvent.change(screen.getByLabelText('WhatsApp *'), { target: { value: '5511988887777' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByText('Você já tem um cliente cadastrado com este WhatsApp.')).toBeInTheDocument();
  });
});
