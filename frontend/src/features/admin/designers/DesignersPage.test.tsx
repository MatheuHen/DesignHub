import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Designer } from './api';

const {
  listDesignersMock,
  createDesignerMock,
  setDesignerStatusMock,
  listSolicitacoesAdminMock,
  reassignSolicitacaoMock,
  updateDesignerPasswordMock,
} = vi.hoisted(() => ({
  listDesignersMock: vi.fn(),
  createDesignerMock: vi.fn(),
  setDesignerStatusMock: vi.fn(),
  listSolicitacoesAdminMock: vi.fn(),
  reassignSolicitacaoMock: vi.fn(),
  updateDesignerPasswordMock: vi.fn(),
}));

vi.mock('./api', () => ({
  listDesigners: listDesignersMock,
  createDesigner: createDesignerMock,
  updateDesigner: vi.fn(),
  setDesignerStatus: setDesignerStatusMock,
  listSolicitacoesAdmin: listSolicitacoesAdminMock,
  reassignSolicitacao: reassignSolicitacaoMock,
  updateDesignerPassword: updateDesignerPasswordMock,
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
    updateDesignerPasswordMock.mockReset();
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

  it('rodada correções: Excluir é a única ação de estado para designer ativo (sem "Inativar" redundante)', async () => {
    listDesignersMock.mockResolvedValue({ items: [sampleDesigner], total: 1, page: 1, pageSize: 20 });

    renderPage();
    await screen.findByRole('cell', { name: 'Dora Designer' });

    expect(screen.getByRole('button', { name: 'Editar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Excluir' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Inativar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ativar' })).not.toBeInTheDocument();
  });

  it('Excluir exige confirmação inline e, por trás, inativa (não apaga) o designer', async () => {
    listDesignersMock.mockResolvedValue({ items: [sampleDesigner], total: 1, page: 1, pageSize: 20 });
    setDesignerStatusMock.mockResolvedValue(undefined);

    renderPage();
    await screen.findByRole('cell', { name: 'Dora Designer' });

    fireEvent.click(screen.getByRole('button', { name: 'Excluir' }));
    expect(setDesignerStatusMock).not.toHaveBeenCalled();
    expect(screen.getByText(/será inativado \(não apagado\)/)).toBeInTheDocument();

    listDesignersMock.mockResolvedValue({
      items: [{ ...sampleDesigner, status: 'inativo' }],
      total: 1,
      page: 1,
      pageSize: 20,
    });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar exclusão' }));

    await waitFor(() =>
      expect(setDesignerStatusMock).toHaveBeenCalledWith('designer-1', { status: 'inativo' }),
    );
    expect(await screen.findByRole('button', { name: 'Ativar' })).toBeInTheDocument();
  });

  it('exclusão (inativação) com erro do backend mostra a mensagem retornada', async () => {
    listDesignersMock.mockResolvedValue({ items: [sampleDesigner], total: 1, page: 1, pageSize: 20 });
    const { ApiError } = await import('../../../lib/apiClient');
    setDesignerStatusMock.mockRejectedValue(new ApiError(500, 'INTERNAL', 'Não foi possível atualizar o status.'));

    renderPage();
    await screen.findByRole('cell', { name: 'Dora Designer' });

    fireEvent.click(screen.getByRole('button', { name: 'Excluir' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar exclusão' }));

    expect(await screen.findByText('Não foi possível atualizar o status.')).toBeInTheDocument();
  });

  it('correção de UX: o erro de exclusão some sozinho após 10s', async () => {
    vi.useFakeTimers();
    listDesignersMock.mockResolvedValue({ items: [sampleDesigner], total: 1, page: 1, pageSize: 20 });
    const { ApiError } = await import('../../../lib/apiClient');
    setDesignerStatusMock.mockRejectedValue(new ApiError(500, 'INTERNAL', 'Não foi possível atualizar o status.'));

    renderPage();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    fireEvent.click(screen.getByRole('button', { name: 'Excluir' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar exclusão' }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(screen.getByText('Não foi possível atualizar o status.')).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });

    expect(screen.queryByText('Não foi possível atualizar o status.')).not.toBeInTheDocument();
    vi.useRealTimers();
  });

  it('item 2.1: admin altera a senha do designer a partir do formulário de edição', async () => {
    listDesignersMock.mockResolvedValue({ items: [sampleDesigner], total: 1, page: 1, pageSize: 20 });
    updateDesignerPasswordMock.mockResolvedValue(undefined);

    renderPage();
    await screen.findByRole('cell', { name: 'Dora Designer' });

    fireEvent.click(screen.getByRole('button', { name: 'Editar' }));
    fireEvent.change(screen.getByLabelText('Nova senha'), { target: { value: 'nova-senha-123' } });
    fireEvent.change(screen.getByLabelText('Confirmar nova senha'), { target: { value: 'nova-senha-123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() =>
      expect(updateDesignerPasswordMock).toHaveBeenCalledWith('designer-1', 'nova-senha-123', 'nova-senha-123'),
    );
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

  describe('item 4 (rodada final): estratégia obrigatória de inativação com pendências', () => {
    const outroDesigner: Designer = {
      id: 'designer-2',
      nomeCompleto: 'Beto Designer',
      email: 'beto@exemplo.com',
      status: 'ativo',
      whatsapp: '5511988888888',
      bloqueado: false,
      statusOperacional: null,
    };
    const pendencia = {
      idSolicitacao: 42,
      clienteNome: 'Waynne',
      tema: 'Post de aniversário',
      status: 'Em produção' as const,
      atrasada: true,
    };

    async function abrirPainelComPendencia() {
      const { ApiError } = await import('../../../lib/apiClient');
      listDesignersMock.mockResolvedValue({
        items: [sampleDesigner, outroDesigner],
        total: 2,
        page: 1,
        pageSize: 20,
      });
      setDesignerStatusMock.mockReset().mockRejectedValueOnce(
        new ApiError(409, 'DESIGNER_PENDENCIAS', 'Este designer possui solicitações pendentes.', {
          pendencias: [pendencia],
        }),
      );

      renderPage();
      await screen.findByRole('cell', { name: 'Dora Designer' });

      fireEvent.click(screen.getAllByRole('button', { name: 'Excluir' })[0]!);
      fireEvent.click(screen.getByRole('button', { name: 'Confirmar exclusão' }));

      expect(await screen.findByText(/possui solicitações pendentes/)).toBeInTheDocument();
      expect(screen.getByText('Waynne')).toBeInTheDocument();
    }

    it('backend rejeita com DESIGNER_PENDENCIAS e a UI mostra o painel de estratégia com a lista recebida', async () => {
      await abrirPainelComPendencia();
      expect(screen.getByRole('button', { name: 'Confirmar' })).toBeDisabled();
    });

    it('estratégia "cancelar_pendentes" envia o payload correto', async () => {
      await abrirPainelComPendencia();
      setDesignerStatusMock.mockResolvedValueOnce(undefined);

      fireEvent.click(screen.getByLabelText('Cancelar todas as pendências e inativar'));
      fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));

      await waitFor(() =>
        expect(setDesignerStatusMock).toHaveBeenCalledWith('designer-1', {
          status: 'inativo',
          estrategia: 'cancelar_pendentes',
        }),
      );
    });

    it('estratégia "reatribuir_pendentes" exige destino antes de confirmar e envia o mapeamento correto', async () => {
      await abrirPainelComPendencia();
      setDesignerStatusMock.mockResolvedValueOnce(undefined);

      fireEvent.click(screen.getByLabelText('Reatribuir cada pendência para outro designer ativo e inativar'));
      fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));

      expect(
        await screen.findByText('Selecione um novo designer para todas as solicitações pendentes.'),
      ).toBeInTheDocument();
      // Só a chamada inicial (rejeitada com DESIGNER_PENDENCIAS) — nenhuma nova chamada sem destino selecionado.
      expect(setDesignerStatusMock).toHaveBeenCalledTimes(1);

      fireEvent.change(screen.getByLabelText('Novo designer para a solicitação de Waynne'), {
        target: { value: 'designer-2' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));

      await waitFor(() =>
        expect(setDesignerStatusMock).toHaveBeenCalledWith('designer-1', {
          status: 'inativo',
          estrategia: 'reatribuir_pendentes',
          reatribuicoes: [{ idSolicitacao: 42, novoDesignerId: 'designer-2' }],
        }),
      );
    });

    it('estratégia "inativar_mesmo_assim" não exige nenhuma seleção adicional', async () => {
      await abrirPainelComPendencia();
      setDesignerStatusMock.mockResolvedValueOnce(undefined);

      fireEvent.click(
        screen.getByLabelText('Inativar mesmo assim (pendências continuam visíveis para ação posterior)'),
      );
      fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));

      await waitFor(() =>
        expect(setDesignerStatusMock).toHaveBeenCalledWith('designer-1', {
          status: 'inativo',
          estrategia: 'inativar_mesmo_assim',
        }),
      );
    });

    it('"Cancelar" fecha o painel sem chamar o backend novamente', async () => {
      await abrirPainelComPendencia();

      fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

      expect(screen.queryByText(/possui solicitações pendentes/)).not.toBeInTheDocument();
    });
  });
});
