import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../../lib/apiClient';
import type { Cliente } from './api';

const {
  listClientesMock,
  createClienteMock,
  deleteClienteMock,
  iniciarAtendimentoMock,
  getInstagramStatusMock,
  getInstagramAuthorizeUrlMock,
  desconectarInstagramMock,
  enviarLinkInstagramMock,
} = vi.hoisted(() => ({
  listClientesMock: vi.fn(),
  createClienteMock: vi.fn(),
  deleteClienteMock: vi.fn(),
  iniciarAtendimentoMock: vi.fn(),
  getInstagramStatusMock: vi.fn(),
  getInstagramAuthorizeUrlMock: vi.fn(),
  desconectarInstagramMock: vi.fn(),
  enviarLinkInstagramMock: vi.fn(),
}));

vi.mock('./api', () => ({
  listClientes: listClientesMock,
  createCliente: createClienteMock,
  updateCliente: vi.fn(),
  deleteCliente: deleteClienteMock,
  iniciarAtendimento: iniciarAtendimentoMock,
  getInstagramStatus: getInstagramStatusMock,
  getInstagramAuthorizeUrl: getInstagramAuthorizeUrlMock,
  desconectarInstagram: desconectarInstagramMock,
  enviarLinkInstagram: enviarLinkInstagramMock,
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
};

function renderPage() {
  return render(
    <MemoryRouter>
      <ClientesPage />
    </MemoryRouter>,
  );
}

describe('ClientesPage (RF003)', () => {
  beforeEach(() => {
    listClientesMock.mockReset();
    createClienteMock.mockReset();
    deleteClienteMock.mockReset();
    iniciarAtendimentoMock.mockReset();
    getInstagramStatusMock.mockReset().mockResolvedValue({ conectado: false, conectadoEm: null, expiraEm: null });
    getInstagramAuthorizeUrlMock.mockReset();
    desconectarInstagramMock.mockReset();
    enviarLinkInstagramMock.mockReset();
  });

  it('lista os clientes retornados pela API', async () => {
    listClientesMock.mockResolvedValue({ items: [sampleCliente], total: 1, page: 1, pageSize: 20 });

    renderPage();

    expect(await screen.findByText('Cliente Teste')).toBeInTheDocument();
    expect(screen.getByText('5511988887777')).toBeInTheDocument();
  });

  it('mostra estado vazio quando não há clientes', async () => {
    listClientesMock.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 });

    renderPage();

    expect(await screen.findByText('Nenhum cliente encontrado.')).toBeInTheDocument();
  });

  it('exige confirmação antes de excluir e exibe erro do backend em caso de impedimento', async () => {
    listClientesMock.mockResolvedValue({ items: [sampleCliente], total: 1, page: 1, pageSize: 20 });
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

  it('correção de UX: o erro de exclusão some sozinho após 10s', async () => {
    vi.useFakeTimers();
    listClientesMock.mockResolvedValue({ items: [sampleCliente], total: 1, page: 1, pageSize: 20 });
    deleteClienteMock.mockRejectedValue(
      new ApiError(409, 'CONFLICT', 'Não é possível excluir: cliente possui solicitações vinculadas.'),
    );

    renderPage();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    fireEvent.click(screen.getByRole('button', { name: 'Excluir' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar exclusão' }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(screen.getByText(/possui solicitações vinculadas/)).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });

    expect(screen.queryByText(/possui solicitações vinculadas/)).not.toBeInTheDocument();
    vi.useRealTimers();
  });

  it('cria um novo cliente a partir do formulário', async () => {
    listClientesMock.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 });
    createClienteMock.mockResolvedValue(sampleCliente);

    renderPage();
    await screen.findByText('Nenhum cliente encontrado.');

    fireEvent.click(screen.getByRole('button', { name: '+ Novo Cliente' }));

    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Cliente Teste' } });
    fireEvent.change(screen.getByLabelText('WhatsApp'), { target: { value: '5511988887777' } });

    listClientesMock.mockResolvedValue({ items: [sampleCliente], total: 1, page: 1, pageSize: 20 });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => {
      expect(createClienteMock).toHaveBeenCalledWith({
        nome: 'Cliente Teste',
        whatsapp: '5511988887777',
      });
    });
  });

  it('não exibe mais o campo textual de @ do Instagram no formulário (rodada correções: só via Conectar Instagram)', async () => {
    listClientesMock.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 });

    renderPage();
    await screen.findByText('Nenhum cliente encontrado.');

    fireEvent.click(screen.getByRole('button', { name: '+ Novo Cliente' }));

    expect(screen.queryByLabelText(/Instagram/)).not.toBeInTheDocument();
  });

  it('inicia atendimento e mostra confirmação (RF004)', async () => {
    listClientesMock.mockResolvedValue({ items: [sampleCliente], total: 1, page: 1, pageSize: 20 });
    iniciarAtendimentoMock.mockResolvedValue({ idAtendimento: 1 });

    renderPage();
    await screen.findByText('Cliente Teste');

    fireEvent.click(screen.getByRole('button', { name: 'Iniciar atendimento' }));

    expect(await screen.findByText(/primeira pergunta enviada por WhatsApp/)).toBeInTheDocument();
    expect(iniciarAtendimentoMock).toHaveBeenCalledWith(1);
  });

  it('mostra erro do backend quando já existe atendimento em andamento (RF004/RN05)', async () => {
    listClientesMock.mockResolvedValue({ items: [sampleCliente], total: 1, page: 1, pageSize: 20 });
    iniciarAtendimentoMock.mockRejectedValue(
      new ApiError(409, 'CONFLICT', 'Já existe um atendimento em andamento para este cliente.'),
    );

    renderPage();
    await screen.findByText('Cliente Teste');

    fireEvent.click(screen.getByRole('button', { name: 'Iniciar atendimento' }));

    expect(await screen.findByText(/já existe um atendimento em andamento/i)).toBeInTheDocument();
  });

  it('mostra "Não conectado" e permite iniciar a conexão do Instagram (RF014/ADR 0005)', async () => {
    listClientesMock.mockResolvedValue({ items: [sampleCliente], total: 1, page: 1, pageSize: 20 });
    getInstagramStatusMock.mockResolvedValue({ conectado: false, conectadoEm: null, expiraEm: null });
    getInstagramAuthorizeUrlMock.mockResolvedValue({ url: 'https://www.instagram.com/oauth/authorize?...' });
    const originalLocation = window.location;
    Object.defineProperty(window, 'location', { value: { ...originalLocation, href: '' }, writable: true });

    renderPage();
    await screen.findByText('Cliente Teste');

    expect(await screen.findByText('Não conectado')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Conectar Instagram' }));

    await waitFor(() => {
      expect(getInstagramAuthorizeUrlMock).toHaveBeenCalledWith(1);
    });

    Object.defineProperty(window, 'location', { value: originalLocation, writable: true });
  });

  it('rodada correções (item 5/12): em viewport de desktop, abre o OAuth do Instagram em popup e não navega a aba atual', async () => {
    listClientesMock.mockResolvedValue({ items: [sampleCliente], total: 1, page: 1, pageSize: 20 });
    getInstagramStatusMock.mockResolvedValue({ conectado: false, conectadoEm: null, expiraEm: null });
    getInstagramAuthorizeUrlMock.mockResolvedValue({ url: 'https://www.instagram.com/oauth/authorize?...' });

    const matchMediaSpy = vi.spyOn(window, 'matchMedia').mockReturnValue({
      matches: true,
    } as MediaQueryList);
    const fakePopup = { closed: false } as unknown as Window;
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(fakePopup);
    const originalLocation = window.location;
    Object.defineProperty(window, 'location', { value: { ...originalLocation, href: 'http://localhost/designer/clientes' }, writable: true });

    renderPage();
    await screen.findByText('Cliente Teste');

    fireEvent.click(screen.getByRole('button', { name: 'Conectar Instagram' }));

    await waitFor(() => {
      expect(openSpy).toHaveBeenCalledWith(
        'https://www.instagram.com/oauth/authorize?...',
        'designhub-instagram-oauth',
        'width=500,height=720',
      );
    });
    // Não navegou a aba atual — o fluxo inteiro acontece no popup.
    expect(window.location.href).toBe('http://localhost/designer/clientes');
    expect(await screen.findByRole('button', { name: 'Conectando…' })).toBeInTheDocument();

    // Popup termina o OAuth e avisa a aba original via postMessage (mesma origem).
    window.dispatchEvent(
      new MessageEvent('message', {
        origin: window.location.origin,
        data: { source: 'designhub-instagram-oauth', resultado: 'conectado' },
      }),
    );

    expect(await screen.findByText('Instagram conectado com sucesso.')).toBeInTheDocument();

    openSpy.mockRestore();
    matchMediaSpy.mockRestore();
    Object.defineProperty(window, 'location', { value: originalLocation, writable: true });
  });

  it('item 4 (rodada correções Instagram): envia o link de conexão ao cliente via WhatsApp', async () => {
    listClientesMock.mockResolvedValue({ items: [sampleCliente], total: 1, page: 1, pageSize: 20 });
    getInstagramStatusMock.mockResolvedValue({ conectado: false, conectadoEm: null, expiraEm: null });
    enviarLinkInstagramMock.mockResolvedValue({
      url: 'https://www.instagram.com/oauth/authorize?state=xyz',
      whatsappNotified: true,
    });

    renderPage();
    await screen.findByText('Cliente Teste');

    fireEvent.click(screen.getByRole('button', { name: 'Enviar link ao cliente' }));

    await waitFor(() => {
      expect(enviarLinkInstagramMock).toHaveBeenCalledWith(1);
    });
    expect(await screen.findByText('Link de conexão enviado ao cliente via WhatsApp.')).toBeInTheDocument();
  });

  it('item 4: quando o WhatsApp falha, mostra o link para copiar manualmente em vez de mascarar o erro', async () => {
    listClientesMock.mockResolvedValue({ items: [sampleCliente], total: 1, page: 1, pageSize: 20 });
    getInstagramStatusMock.mockResolvedValue({ conectado: false, conectadoEm: null, expiraEm: null });
    enviarLinkInstagramMock.mockResolvedValue({
      url: 'https://www.instagram.com/oauth/authorize?state=xyz',
      whatsappNotified: false,
      whatsappError: 'Falha ao enviar mensagem',
    });

    renderPage();
    await screen.findByText('Cliente Teste');

    fireEvent.click(screen.getByRole('button', { name: 'Enviar link ao cliente' }));

    expect(await screen.findByText(/Copie e envie manualmente/)).toBeInTheDocument();
    expect(screen.getByText(/https:\/\/www\.instagram\.com\/oauth\/authorize\?state=xyz/)).toBeInTheDocument();
  });

  it('mostra "Conectado" e permite desconectar o Instagram (RF014/ADR 0005)', async () => {
    listClientesMock.mockResolvedValue({ items: [sampleCliente], total: 1, page: 1, pageSize: 20 });
    getInstagramStatusMock.mockResolvedValue({
      conectado: true,
      conectadoEm: '2026-08-20T10:00:00Z',
      expiraEm: '2026-10-19T10:00:00Z',
    });
    desconectarInstagramMock.mockResolvedValue(undefined);

    renderPage();
    await screen.findByText('Cliente Teste');

    expect(await screen.findByText('Conectado')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Desconectar' }));

    await waitFor(() => {
      expect(desconectarInstagramMock).toHaveBeenCalledWith(1);
    });
  });
});
