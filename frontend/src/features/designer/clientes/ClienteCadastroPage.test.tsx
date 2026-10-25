import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createClienteMock } = vi.hoisted(() => ({ createClienteMock: vi.fn() }));

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./api')>();
  return { ...actual, createCliente: createClienteMock };
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
    refreshProfile: vi.fn().mockResolvedValue(undefined),
  }),
}));

const { ClienteCadastroPage } = await import('./ClienteCadastroPage');

function renderPage() {
  return render(
    <MemoryRouter>
      <ClienteCadastroPage />
    </MemoryRouter>,
  );
}

/**
 * RF003 — a tela de Clientes passou a ser dedicada ao cadastro (rodada UX de
 * divisão Clientes x Dashboard). Estes testes vinham de `ClientesPage` e
 * foram movidos junto com o formulário, sem perder cobertura.
 */
describe('ClienteCadastroPage (RF003 — tela dedicada ao cadastro)', () => {
  beforeEach(() => {
    createClienteMock.mockReset();
  });

  it('o formulário de cadastro já está visível ao abrir a tela', () => {
    renderPage();

    expect(screen.getByRole('form', { name: 'Novo cliente' })).toBeInTheDocument();
    expect(screen.getByLabelText('Nome *')).toBeInTheDocument();
  });

  it('cria um novo cliente a partir do formulário', async () => {
    createClienteMock.mockResolvedValue({
      id: 1,
      idDesigner: 'designer-1',
      nome: 'Cliente Teste',
      whatsapp: '5511988887777',
      instagram: null,
      observacao: null,
    });

    renderPage();

    fireEvent.change(screen.getByLabelText('Nome *'), { target: { value: 'Cliente Teste' } });
    fireEvent.change(screen.getByLabelText('WhatsApp * (ex.: 5564999998888, com DDI e DDD)'), {
      target: { value: '5511988887777' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => {
      expect(createClienteMock).toHaveBeenCalledWith({
        nome: 'Cliente Teste',
        whatsapp: '5511988887777',
      });
    });
  });

  it('confirma o cadastro e aponta o Dashboard como próximo passo do fluxo', async () => {
    createClienteMock.mockResolvedValue({
      id: 2,
      idDesigner: 'designer-1',
      nome: 'Cliente Novo',
      whatsapp: '5511966665555',
      instagram: null,
      observacao: null,
    });

    renderPage();

    fireEvent.change(screen.getByLabelText('Nome *'), { target: { value: 'Cliente Novo' } });
    fireEvent.change(screen.getByLabelText('WhatsApp * (ex.: 5564999998888, com DDI e DDD)'), {
      target: { value: '5511966665555' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByText(/já aparece no Dashboard/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ir para o Dashboard' })).toHaveAttribute(
      'href',
      '/designer',
    );
  });

  it('exibe o erro do backend (ex.: WhatsApp duplicado no mesmo designer) sem mascarar', async () => {
    createClienteMock.mockRejectedValue(
      new Error('Você já tem um cliente cadastrado com este WhatsApp.'),
    );

    renderPage();

    fireEvent.change(screen.getByLabelText('Nome *'), { target: { value: 'Cliente Repetido' } });
    fireEvent.change(screen.getByLabelText('WhatsApp * (ex.: 5564999998888, com DDI e DDD)'), {
      target: { value: '5511988887777' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(
      await screen.findByText('Você já tem um cliente cadastrado com este WhatsApp.'),
    ).toBeInTheDocument();
  });

  it('não exibe campo textual de @ do Instagram (conexão é só via Conectar Instagram)', () => {
    renderPage();

    expect(screen.queryByLabelText(/Instagram/)).not.toBeInTheDocument();
  });
});
