import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../../lib/apiClient';
import type { SolicitacaoDetailResult } from './api';

const {
  getSolicitacaoDetailMock,
  updateSolicitacaoMock,
  uploadVersaoArteMock,
  getVersaoArteDownloadUrlMock,
  getAjusteReferenciaUrlMock,
  gerarLinkAvaliacaoMock,
  createAgendamentoMock,
  updateAgendamentoMock,
  cancelAgendamentoMock,
  registrarPublicacaoManualMock,
  getClienteInstagramStatusMock,
  getPublicacaoDetalheMock,
  uploadComprovantePublicacaoMock,
  getComprovanteDownloadUrlMock,
  reenviarNotificacaoPublicacaoMock,
  cancelSolicitacaoMock,
} = vi.hoisted(() => ({
  getSolicitacaoDetailMock: vi.fn(),
  updateSolicitacaoMock: vi.fn(),
  uploadVersaoArteMock: vi.fn(),
  getVersaoArteDownloadUrlMock: vi.fn(),
  getAjusteReferenciaUrlMock: vi.fn(),
  gerarLinkAvaliacaoMock: vi.fn(),
  createAgendamentoMock: vi.fn(),
  updateAgendamentoMock: vi.fn(),
  cancelAgendamentoMock: vi.fn(),
  registrarPublicacaoManualMock: vi.fn(),
  getClienteInstagramStatusMock: vi.fn(),
  getPublicacaoDetalheMock: vi.fn(),
  uploadComprovantePublicacaoMock: vi.fn(),
  getComprovanteDownloadUrlMock: vi.fn(),
  reenviarNotificacaoPublicacaoMock: vi.fn(),
  cancelSolicitacaoMock: vi.fn(),
}));

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./api')>();
  return {
    ...actual,
    getSolicitacaoDetail: getSolicitacaoDetailMock,
    updateSolicitacao: updateSolicitacaoMock,
    uploadVersaoArte: uploadVersaoArteMock,
    getVersaoArteDownloadUrl: getVersaoArteDownloadUrlMock,
    getAjusteReferenciaUrl: getAjusteReferenciaUrlMock,
    gerarLinkAvaliacao: gerarLinkAvaliacaoMock,
    createAgendamento: createAgendamentoMock,
    updateAgendamento: updateAgendamentoMock,
    cancelAgendamento: cancelAgendamentoMock,
    registrarPublicacaoManual: registrarPublicacaoManualMock,
    getClienteInstagramStatus: getClienteInstagramStatusMock,
    getPublicacaoDetalhe: getPublicacaoDetalheMock,
    uploadComprovantePublicacao: uploadComprovantePublicacaoMock,
    getComprovanteDownloadUrl: getComprovanteDownloadUrlMock,
    reenviarNotificacaoPublicacao: reenviarNotificacaoPublicacaoMock,
    cancelSolicitacao: cancelSolicitacaoMock,
  };
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

const { SolicitacaoDetailPage } = await import('./SolicitacaoDetailPage');

const sampleDetail: SolicitacaoDetailResult = {
  solicitacao: {
    id: 10,
    idCliente: 1,
    clienteNome: 'Cliente Teste',
    idDesigner: 'designer-1',
    tema: 'Tema X',
    status: 'Em produção',
    dataCriacao: '2026-01-01T00:00:00Z',
    prazoPrimeiraVersao: '2026-01-06T00:00:00Z',
    descricao: null,
    cores: 'Azul',
    observacoes: null,
  },
  historico: [
    { id_historico: 1, acao: 'Solicitação criada', status_anterior: null, status_novo: 'Em produção', data_hora: '2026-01-01T00:00:00Z' },
  ],
  respostasAtendimento: [{ pergunta: 'Qual o tema?', resposta: 'Tema X', data_hora: '2026-01-01T00:00:00Z' }],
  versoes: [],
  ajustes: [],
  agendamento: null,
  preferenciaAgendamento: null,
};

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/designer/solicitacoes/10']}>
      <Routes>
        <Route path="/designer/solicitacoes/:id" element={<SolicitacaoDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('SolicitacaoDetailPage (RF005)', () => {
  beforeEach(() => {
    getSolicitacaoDetailMock.mockReset();
    updateSolicitacaoMock.mockReset();
    uploadVersaoArteMock.mockReset();
    getVersaoArteDownloadUrlMock.mockReset();
    getAjusteReferenciaUrlMock.mockReset();
    gerarLinkAvaliacaoMock.mockReset();
    createAgendamentoMock.mockReset();
    updateAgendamentoMock.mockReset();
    cancelAgendamentoMock.mockReset();
    registrarPublicacaoManualMock.mockReset();
    getPublicacaoDetalheMock.mockReset();
    uploadComprovantePublicacaoMock.mockReset();
    getComprovanteDownloadUrlMock.mockReset();
    reenviarNotificacaoPublicacaoMock.mockReset();
    cancelSolicitacaoMock.mockReset();
    getClienteInstagramStatusMock
      .mockReset()
      .mockResolvedValue({ conectado: true, conectadoEm: '2026-08-20T10:00:00Z', expiraEm: '2026-10-19T10:00:00Z' });
  });

  describe('rodada correções (item 12/30): Cancelar arte', () => {
    it.each(['Em produção', 'Enviado para avaliação', 'Ajustes', 'Aprovado', 'Agendado'] as const)(
      'mostra o botão "Cancelar arte" quando o status é "%s"',
      async (status) => {
        getSolicitacaoDetailMock.mockResolvedValue({
          ...sampleDetail,
          solicitacao: { ...sampleDetail.solicitacao, status },
        });

        renderPage();

        expect(await screen.findByRole('button', { name: 'Cancelar arte' })).toBeInTheDocument();
      },
    );

    it.each(['Cancelado', 'Publicado'] as const)(
      'não mostra o botão "Cancelar arte" quando o status já é terminal ("%s")',
      async (status) => {
        getSolicitacaoDetailMock.mockResolvedValue({
          ...sampleDetail,
          solicitacao: { ...sampleDetail.solicitacao, status },
        });
        getPublicacaoDetalheMock.mockResolvedValue({
          dataPublicada: '2026-09-01T14:00:00Z',
          tipo: 'manual',
          permalink: null,
          numeroVersao: 1,
          temComprovante: false,
        });

        renderPage();
        await screen.findByText(sampleDetail.solicitacao.clienteNome);

        expect(screen.queryByRole('button', { name: 'Cancelar arte' })).not.toBeInTheDocument();
      },
    );

    it('exige confirmação antes de cancelar (double-click safe)', async () => {
      getSolicitacaoDetailMock.mockResolvedValue(sampleDetail);
      cancelSolicitacaoMock.mockResolvedValue(undefined);

      renderPage();
      fireEvent.click(await screen.findByRole('button', { name: 'Cancelar arte' }));

      expect(cancelSolicitacaoMock).not.toHaveBeenCalled();
      expect(screen.getByText(/Esta ação não pode ser desfeita/)).toBeInTheDocument();

      const confirmBtn = screen.getByRole('button', { name: 'Confirmar cancelamento' });
      fireEvent.click(confirmBtn);
      // Segundo clique imediato (antes do primeiro terminar) não deve disparar 2ª chamada.
      fireEvent.click(confirmBtn);

      await waitFor(() => expect(cancelSolicitacaoMock).toHaveBeenCalledTimes(1));
      expect(cancelSolicitacaoMock).toHaveBeenCalledWith(10);
    });

    it('permite voltar (cancelar a confirmação) sem chamar a API', async () => {
      getSolicitacaoDetailMock.mockResolvedValue(sampleDetail);

      renderPage();
      fireEvent.click(await screen.findByRole('button', { name: 'Cancelar arte' }));
      fireEvent.click(screen.getByRole('button', { name: 'Voltar' }));

      expect(cancelSolicitacaoMock).not.toHaveBeenCalled();
      expect(await screen.findByRole('button', { name: 'Cancelar arte' })).toBeInTheDocument();
    });

    it('mostra a mensagem de erro do backend quando o cancelamento falha', async () => {
      getSolicitacaoDetailMock.mockResolvedValue(sampleDetail);
      cancelSolicitacaoMock.mockRejectedValue(
        new ApiError(409, 'CONFLICT', 'Solicitação não pode mais ser cancelada (status atual: Publicado).'),
      );

      renderPage();
      fireEvent.click(await screen.findByRole('button', { name: 'Cancelar arte' }));
      fireEvent.click(screen.getByRole('button', { name: 'Confirmar cancelamento' }));

      expect(await screen.findByText(/não pode mais ser cancelada/)).toBeInTheDocument();
    });
  });

  it('mostra detalhes, atendimento e histórico', async () => {
    getSolicitacaoDetailMock.mockResolvedValue(sampleDetail);

    renderPage();

    expect(await screen.findByText('Cliente Teste', { exact: false })).toBeInTheDocument();
    expect(screen.getByText('Qual o tema?')).toBeInTheDocument();
    expect(screen.getByText(/Solicitação criada/)).toBeInTheDocument();
    expect(screen.getByText('Nenhuma versão enviada ainda.')).toBeInTheDocument();
  });

  it('exibe a descrição do ajuste solicitado pelo cliente (RF010: "designer deve visualizar claramente o solicitado")', async () => {
    getSolicitacaoDetailMock.mockResolvedValue({
      ...sampleDetail,
      ajustes: [
        {
          idAjuste: 1,
          numeroVersao: 1,
          descricao: 'Trocar a cor de fundo para azul.',
          observacoes: null,
          imagemReferenciaUrl: 'solicitacoes/10/referencias/abc.png',
          createdAt: '2026-01-02T00:00:00Z',
        },
      ],
    });

    renderPage();

    expect(await screen.findByText('Ajustes solicitados pelo cliente')).toBeInTheDocument();
    expect(screen.getByText('Trocar a cor de fundo para azul.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Visualizar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Baixar' })).toBeInTheDocument();
  });

  it('exibe tema/cores/observações como somente leitura (QUADRO 34: "Alteração de solicitação de arte")', async () => {
    getSolicitacaoDetailMock.mockResolvedValue(sampleDetail);

    renderPage();

    expect(await screen.findByText((_, el) => el?.textContent === 'Tema: Tema X')).toBeInTheDocument();
    expect(screen.getByText((_, el) => el?.textContent === 'Preferência de cores: Azul')).toBeInTheDocument();
    expect(screen.queryByLabelText('Tema')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Salvar alterações' })).not.toBeInTheDocument();
    expect(updateSolicitacaoMock).not.toHaveBeenCalled();
  });

  it('exibe o formulário de envio de versão quando o status permite upload (RN26)', async () => {
    getSolicitacaoDetailMock.mockResolvedValue(sampleDetail);

    renderPage();

    expect(await screen.findByRole('form', { name: 'Enviar nova versão da arte' })).toBeInTheDocument();
  });

  it('oculta o formulário de envio de versão quando o status não permite upload (RN26)', async () => {
    getSolicitacaoDetailMock.mockResolvedValue({
      ...sampleDetail,
      solicitacao: { ...sampleDetail.solicitacao, status: 'Aprovado' },
    });

    renderPage();

    await screen.findByText('Cliente Teste', { exact: false });
    expect(screen.queryByRole('form', { name: 'Enviar nova versão da arte' })).not.toBeInTheDocument();
  });

  it('envia a nova versão selecionada e recarrega os dados', async () => {
    getSolicitacaoDetailMock.mockResolvedValue(sampleDetail);
    uploadVersaoArteMock.mockResolvedValue({
      idVersao: 1,
      numeroVersao: 1,
      status: 'Enviado para avaliação',
    });

    renderPage();
    await screen.findByRole('form', { name: 'Enviar nova versão da arte' });

    const file = new File(['%PDF-1.4'], 'arte.pdf', { type: 'application/pdf' });
    fireEvent.change(screen.getByLabelText('Arquivo (PDF, JPG ou PNG)'), { target: { files: [file] } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar versão' }));

    await waitFor(() => {
      expect(uploadVersaoArteMock).toHaveBeenCalledWith(10, file, undefined);
    });
    expect(await screen.findByText('Versão V1 enviada com sucesso.')).toBeInTheDocument();
    expect(getSolicitacaoDetailMock).toHaveBeenCalledTimes(2);
  });

  it('bloqueia o envio sem arquivo selecionado', async () => {
    getSolicitacaoDetailMock.mockResolvedValue(sampleDetail);

    renderPage();
    await screen.findByRole('form', { name: 'Enviar nova versão da arte' });

    fireEvent.click(screen.getByRole('button', { name: 'Enviar versão' }));

    expect(await screen.findByText('Selecione um arquivo PDF, JPG ou PNG.')).toBeInTheDocument();
    expect(uploadVersaoArteMock).not.toHaveBeenCalled();
  });

  it('gera e abre a URL assinada de download de uma versão', async () => {
    const detailWithVersao: SolicitacaoDetailResult = {
      ...sampleDetail,
      versoes: [
        { id_versao: 1, numero_versao: 1, formato: 'PDF', data_envio: '2026-01-02T00:00:00Z', observacoes: null },
      ],
    };
    getSolicitacaoDetailMock.mockResolvedValue(detailWithVersao);
    getVersaoArteDownloadUrlMock.mockResolvedValue({
      url: 'https://exemplo.supabase.co/signed-url',
      expiresInSeconds: 300,
    });
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

    renderPage();
    await screen.findByRole('button', { name: 'Baixar' });
    fireEvent.click(screen.getByRole('button', { name: 'Baixar' }));

    await waitFor(() => {
      expect(getVersaoArteDownloadUrlMock).toHaveBeenCalledWith(10, 1, false);
    });
    expect(openSpy).toHaveBeenCalledWith(
      'https://exemplo.supabase.co/signed-url',
      '_blank',
      'noopener,noreferrer',
    );

    openSpy.mockRestore();
  });

  it('oculta a seção de avaliação quando o status não é "Enviado para avaliação"', async () => {
    getSolicitacaoDetailMock.mockResolvedValue(sampleDetail);

    renderPage();

    await screen.findByText('Cliente Teste', { exact: false });
    expect(screen.queryByText('Avaliação do cliente')).not.toBeInTheDocument();
  });

  it('gera o link de avaliação e reporta o resultado da notificação WhatsApp', async () => {
    getSolicitacaoDetailMock.mockResolvedValue({
      ...sampleDetail,
      solicitacao: { ...sampleDetail.solicitacao, status: 'Enviado para avaliação' },
    });
    gerarLinkAvaliacaoMock.mockResolvedValue({
      url: 'https://app.exemplo.com/avaliacao/token123',
      expiresAt: '2026-01-08T00:00:00Z',
      whatsappNotified: true,
    });

    renderPage();
    // item 6 (correções 13/09/2026): status de notificação, separado do status de negócio.
    expect(await screen.findByText('Link de avaliação ainda não enviado.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Gerar e enviar link de avaliação' }));

    await waitFor(() => {
      expect(gerarLinkAvaliacaoMock).toHaveBeenCalledWith(10);
    });
    expect(await screen.findByText(/Cliente notificado via WhatsApp com sucesso/)).toBeInTheDocument();
    expect(screen.getByText('Link enviado ao cliente.')).toBeInTheDocument();
    expect(screen.queryByText('Link de avaliação ainda não enviado.')).not.toBeInTheDocument();
  });

  it('não mascara falha de notificação WhatsApp ao gerar o link', async () => {
    getSolicitacaoDetailMock.mockResolvedValue({
      ...sampleDetail,
      solicitacao: { ...sampleDetail.solicitacao, status: 'Enviado para avaliação' },
    });
    gerarLinkAvaliacaoMock.mockResolvedValue({
      url: 'https://app.exemplo.com/avaliacao/token123',
      expiresAt: '2026-01-08T00:00:00Z',
      whatsappNotified: false,
      whatsappError: 'WHATSAPP_ACCESS_TOKEN ausente',
    });

    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Gerar e enviar link de avaliação' }));

    expect(await screen.findByText(/não foi possível notificar via WhatsApp/)).toBeInTheDocument();
  });

  it('exibe o formulário de agendamento quando o status é "Aprovado" (RF012/RN30)', async () => {
    getSolicitacaoDetailMock.mockResolvedValue({
      ...sampleDetail,
      solicitacao: { ...sampleDetail.solicitacao, status: 'Aprovado' },
    });

    renderPage();

    expect(await screen.findByRole('form', { name: 'Agendar publicação' })).toBeInTheDocument();
  });

  it('pré-preenche Data/Horário com a preferência do cliente quando ainda não há agendamento (RN22/RN27)', async () => {
    getSolicitacaoDetailMock.mockResolvedValue({
      ...sampleDetail,
      solicitacao: { ...sampleDetail.solicitacao, status: 'Aprovado' },
      preferenciaAgendamento: {
        desejaAgendamento: true,
        dataDesejada: '2026-08-25',
        horarioDesejado: '20:12:00',
        opcaoPublicacao: 'designer_manual',
        legendaDesejada: null,
      },
    });

    renderPage();
    await screen.findByRole('form', { name: 'Agendar publicação' });

    expect(screen.getByLabelText('Data')).toHaveValue('2026-08-25');
    expect(screen.getByLabelText('Horário')).toHaveValue('20:12');
    expect(screen.getByText(/O cliente indicou que deseja agendar para/)).toBeInTheDocument();
  });

  it('rodada correções (item 8): avisa quando o cliente escolheu publicar por conta própria', async () => {
    getSolicitacaoDetailMock.mockResolvedValue({
      ...sampleDetail,
      solicitacao: { ...sampleDetail.solicitacao, status: 'Aprovado' },
      preferenciaAgendamento: {
        desejaAgendamento: false,
        dataDesejada: null,
        horarioDesejado: null,
        opcaoPublicacao: 'proprio_cliente',
        legendaDesejada: null,
      },
    });

    renderPage();

    expect(
      await screen.findByText(/vai publicar esta arte por conta própria/),
    ).toBeInTheDocument();
  });

  it('rodada correções (item 7/8): avisa quando o agendamento automático não foi possível (Instagram desconectado na hora)', async () => {
    getSolicitacaoDetailMock.mockResolvedValue({
      ...sampleDetail,
      solicitacao: { ...sampleDetail.solicitacao, status: 'Aprovado' },
      preferenciaAgendamento: {
        desejaAgendamento: true,
        dataDesejada: '2026-08-25',
        horarioDesejado: '20:12:00',
        opcaoPublicacao: 'automatico',
        legendaDesejada: null,
      },
    });

    renderPage();

    expect(
      await screen.findByText(/O cliente escolheu agendar automaticamente, mas isso não foi possível/),
    ).toBeInTheDocument();
  });

  it('avisa quando o Instagram do cliente não está conectado (RF014/ADR 0005)', async () => {
    getClienteInstagramStatusMock.mockResolvedValue({ conectado: false, conectadoEm: null, expiraEm: null });
    getSolicitacaoDetailMock.mockResolvedValue({
      ...sampleDetail,
      solicitacao: { ...sampleDetail.solicitacao, status: 'Aprovado' },
    });

    renderPage();

    expect(
      await screen.findByText(/conta do Instagram deste cliente não está conectada/),
    ).toBeInTheDocument();
    expect(getClienteInstagramStatusMock).toHaveBeenCalledWith(sampleDetail.solicitacao.idCliente);
    // item 7.3 (correções 13/09/2026): orienta a conectar OU registrar manualmente, nunca finge automação.
    expect(screen.getByRole('link', { name: 'Conecte o Instagram do cliente' })).toHaveAttribute(
      'href',
      '/designer/clientes',
    );
  });

  it('não avisa sobre Instagram quando o cliente já está conectado', async () => {
    getClienteInstagramStatusMock.mockResolvedValue({
      conectado: true,
      conectadoEm: '2026-08-20T10:00:00Z',
      expiraEm: '2026-10-19T10:00:00Z',
    });
    getSolicitacaoDetailMock.mockResolvedValue({
      ...sampleDetail,
      solicitacao: { ...sampleDetail.solicitacao, status: 'Aprovado' },
    });

    renderPage();
    await screen.findByRole('form', { name: 'Agendar publicação' });

    expect(screen.queryByText(/não está conectada/)).not.toBeInTheDocument();
  });

  it('cria o agendamento com os dados informados', async () => {
    getSolicitacaoDetailMock.mockResolvedValue({
      ...sampleDetail,
      solicitacao: { ...sampleDetail.solicitacao, status: 'Aprovado' },
    });
    createAgendamentoMock.mockResolvedValue({ idAgendamento: 1 });

    renderPage();
    await screen.findByRole('form', { name: 'Agendar publicação' });

    fireEvent.change(screen.getByLabelText('Data'), { target: { value: '2026-09-01' } });
    fireEvent.change(screen.getByLabelText('Horário'), { target: { value: '10:00' } });
    fireEvent.change(screen.getByLabelText('Legenda (opcional)'), { target: { value: 'Nova arte no ar!' } });
    fireEvent.click(screen.getByRole('button', { name: 'Agendar publicação' }));

    await waitFor(() => {
      expect(createAgendamentoMock).toHaveBeenCalledWith(10, {
        dataPublicacao: '2026-09-01',
        horario: '10:00',
        legenda: 'Nova arte no ar!',
      });
    });
    expect(await screen.findByText('Publicação agendada com sucesso.')).toBeInTheDocument();
  });

  it('item 8.1 (correções 13/09/2026): cria o agendamento sem preencher a legenda (opcional)', async () => {
    getSolicitacaoDetailMock.mockResolvedValue({
      ...sampleDetail,
      solicitacao: { ...sampleDetail.solicitacao, status: 'Aprovado' },
    });
    createAgendamentoMock.mockResolvedValue({ idAgendamento: 1 });

    renderPage();
    await screen.findByRole('form', { name: 'Agendar publicação' });

    const legendaInput = screen.getByLabelText('Legenda (opcional)');
    expect(legendaInput).not.toBeRequired();

    fireEvent.change(screen.getByLabelText('Data'), { target: { value: '2026-09-01' } });
    fireEvent.change(screen.getByLabelText('Horário'), { target: { value: '10:00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Agendar publicação' }));

    await waitFor(() => {
      expect(createAgendamentoMock).toHaveBeenCalledWith(10, {
        dataPublicacao: '2026-09-01',
        horario: '10:00',
        legenda: '',
      });
    });
  });

  it('mostra os dados do agendamento ativo e permite editar quando o status é "Agendado"', async () => {
    getSolicitacaoDetailMock.mockResolvedValue({
      ...sampleDetail,
      solicitacao: { ...sampleDetail.solicitacao, status: 'Agendado' },
      agendamento: { idAgendamento: 1, dataPublicacao: '2026-09-01', horario: '10:00:00', legenda: 'Post' },
    });
    updateAgendamentoMock.mockResolvedValue(undefined);

    renderPage();

    expect(await screen.findByText(/Agendado para/)).toBeInTheDocument();
    expect(await screen.findByRole('form', { name: 'Editar agendamento de publicação' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações do agendamento' }));

    await waitFor(() => {
      expect(updateAgendamentoMock).toHaveBeenCalledWith(10, {
        dataPublicacao: '2026-09-01',
        horario: '10:00',
        legenda: 'Post',
      });
    });
  });

  it('cancela o agendamento somente após confirmação explícita (RN31)', async () => {
    getSolicitacaoDetailMock.mockResolvedValue({
      ...sampleDetail,
      solicitacao: { ...sampleDetail.solicitacao, status: 'Agendado' },
      agendamento: { idAgendamento: 1, dataPublicacao: '2026-09-01', horario: '10:00:00', legenda: null },
    });
    cancelAgendamentoMock.mockResolvedValue(undefined);

    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Cancelar agendamento' }));

    expect(cancelAgendamentoMock).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole('button', { name: 'Confirmar cancelamento do agendamento' }));

    await waitFor(() => {
      expect(cancelAgendamentoMock).toHaveBeenCalledWith(10);
    });
  });

  it('rodada correções (item 13/31): mostra "Agendamento cancelado com sucesso." e nunca deixa a mensagem antiga de agendar visível', async () => {
    getSolicitacaoDetailMock.mockResolvedValueOnce({
      ...sampleDetail,
      solicitacao: { ...sampleDetail.solicitacao, status: 'Aprovado' },
    });
    createAgendamentoMock.mockResolvedValue({ idAgendamento: 1 });

    renderPage();
    await screen.findByRole('form', { name: 'Agendar publicação' });
    fireEvent.change(screen.getByLabelText('Data'), { target: { value: '2026-09-01' } });
    fireEvent.change(screen.getByLabelText('Horário'), { target: { value: '10:00' } });

    // Após agendar, a solicitação recarrega já como "Agendado".
    getSolicitacaoDetailMock.mockResolvedValue({
      ...sampleDetail,
      solicitacao: { ...sampleDetail.solicitacao, status: 'Agendado' },
      agendamento: { idAgendamento: 1, dataPublicacao: '2026-09-01', horario: '10:00:00', legenda: null },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Agendar publicação' }));

    expect(await screen.findByText('Publicação agendada com sucesso.')).toBeInTheDocument();

    // Agora cancela o agendamento recém-criado.
    cancelAgendamentoMock.mockResolvedValue(undefined);
    getSolicitacaoDetailMock.mockResolvedValue({
      ...sampleDetail,
      solicitacao: { ...sampleDetail.solicitacao, status: 'Aprovado' },
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Cancelar agendamento' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar cancelamento do agendamento' }));

    expect(await screen.findByText('Agendamento cancelado com sucesso.')).toBeInTheDocument();
    expect(screen.queryByText('Publicação agendada com sucesso.')).not.toBeInTheDocument();
  });

  it('exibe o erro do backend quando o cancelamento é rejeitado pela janela de 3h (RN31)', async () => {
    getSolicitacaoDetailMock.mockResolvedValue({
      ...sampleDetail,
      solicitacao: { ...sampleDetail.solicitacao, status: 'Agendado' },
      agendamento: { idAgendamento: 1, dataPublicacao: '2026-09-01', horario: '10:00:00', legenda: null },
    });
    cancelAgendamentoMock.mockRejectedValue(
      new ApiError(409, 'CONFLICT', 'Cancelamento não permitido: faltam menos de 3 horas para a publicação.'),
    );

    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Cancelar agendamento' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Confirmar cancelamento do agendamento' }));

    expect(await screen.findByText(/faltam menos de 3 horas/)).toBeInTheDocument();
  });

  it('registra a publicação manual e recarrega os dados (RF014)', async () => {
    getSolicitacaoDetailMock.mockResolvedValue({
      ...sampleDetail,
      solicitacao: { ...sampleDetail.solicitacao, status: 'Agendado' },
      agendamento: { idAgendamento: 1, dataPublicacao: '2026-09-01', horario: '10:00:00', legenda: null },
    });
    registrarPublicacaoManualMock.mockResolvedValue(undefined);

    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Registrar publicação manual' }));

    await waitFor(() => {
      expect(registrarPublicacaoManualMock).toHaveBeenCalledWith(10);
    });
    expect(getSolicitacaoDetailMock).toHaveBeenCalledTimes(2);
  });

  it('exibe o erro do backend quando o registro de publicação manual é rejeitado (RF014)', async () => {
    getSolicitacaoDetailMock.mockResolvedValue({
      ...sampleDetail,
      solicitacao: { ...sampleDetail.solicitacao, status: 'Agendado' },
      agendamento: { idAgendamento: 1, dataPublicacao: '2026-09-01', horario: '10:00:00', legenda: null },
    });
    registrarPublicacaoManualMock.mockRejectedValue(
      new ApiError(409, 'CONFLICT', 'Solicitação não está aguardando publicação (status atual: Publicado).'),
    );

    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Registrar publicação manual' }));

    expect(await screen.findByText(/não está aguardando publicação/)).toBeInTheDocument();
  });

  it('item 9.1 (correções 13/09/2026): mostra badge com data/hora, tipo e permalink quando publicado automaticamente', async () => {
    getSolicitacaoDetailMock.mockResolvedValue({
      ...sampleDetail,
      solicitacao: { ...sampleDetail.solicitacao, status: 'Publicado' },
    });
    getPublicacaoDetalheMock.mockResolvedValue({
      dataPublicada: '2026-09-01T14:00:00Z',
      tipo: 'automatica',
      permalink: 'https://www.instagram.com/p/abc123/',
      numeroVersao: 2,
      temComprovante: false,
    });

    renderPage();

    expect(await screen.findByText(/automática \(Instagram\)/)).toBeInTheDocument();
    expect(screen.getByText(/V2/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver publicação no Instagram' })).toHaveAttribute(
      'href',
      'https://www.instagram.com/p/abc123/',
    );
  });

  it('melhoria autorizada (item 10): permite reenviar o aviso ao cliente quando publicado', async () => {
    getSolicitacaoDetailMock.mockResolvedValue({
      ...sampleDetail,
      solicitacao: { ...sampleDetail.solicitacao, status: 'Publicado' },
    });
    getPublicacaoDetalheMock.mockResolvedValue({
      dataPublicada: '2026-09-01T14:00:00Z',
      tipo: 'automatica',
      permalink: null,
      numeroVersao: 2,
      temComprovante: false,
    });
    reenviarNotificacaoPublicacaoMock.mockResolvedValue(undefined);

    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Reenviar aviso ao cliente' }));

    await waitFor(() => {
      expect(reenviarNotificacaoPublicacaoMock).toHaveBeenCalledWith(10);
    });
    expect(await screen.findByText(/Reenvio solicitado/)).toBeInTheDocument();
  });

  it('item 9.3: permite enviar o comprovante quando ainda não há um anexado', async () => {
    getSolicitacaoDetailMock.mockResolvedValue({
      ...sampleDetail,
      solicitacao: { ...sampleDetail.solicitacao, status: 'Publicado' },
    });
    getPublicacaoDetalheMock.mockResolvedValue({
      dataPublicada: '2026-09-01T14:00:00Z',
      tipo: 'manual',
      permalink: null,
      numeroVersao: 1,
      temComprovante: false,
    });
    uploadComprovantePublicacaoMock.mockResolvedValue(undefined);

    renderPage();
    await screen.findByText(/manual/);

    const file = new File(['conteudo'], 'print.png', { type: 'image/png' });
    fireEvent.change(screen.getByLabelText(/Comprovante\/print/), { target: { files: [file] } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar comprovante' }));

    await waitFor(() => {
      expect(uploadComprovantePublicacaoMock).toHaveBeenCalledWith(10, file);
    });
    expect(await screen.findByText('Comprovante enviado com sucesso.')).toBeInTheDocument();
  });

  it('rodada correções (item 10): clicar em "Ver comprovante" limpa a mensagem "enviado com sucesso" de um upload anterior na mesma visita', async () => {
    getSolicitacaoDetailMock.mockResolvedValue({
      ...sampleDetail,
      solicitacao: { ...sampleDetail.solicitacao, status: 'Publicado' },
    });
    getPublicacaoDetalheMock.mockResolvedValueOnce({
      dataPublicada: '2026-09-01T14:00:00Z',
      tipo: 'manual',
      permalink: null,
      numeroVersao: 1,
      temComprovante: false,
    });
    uploadComprovantePublicacaoMock.mockResolvedValue(undefined);

    renderPage();
    await screen.findByText(/manual/);

    const file = new File(['conteudo'], 'print.png', { type: 'image/png' });
    fireEvent.change(screen.getByLabelText(/Comprovante\/print/), { target: { files: [file] } });
    // O reload após o upload passa a devolver temComprovante=true (arquivo já anexado).
    getPublicacaoDetalheMock.mockResolvedValue({
      dataPublicada: '2026-09-01T14:00:00Z',
      tipo: 'manual',
      permalink: null,
      numeroVersao: 1,
      temComprovante: true,
    });
    getComprovanteDownloadUrlMock.mockResolvedValue({
      url: 'https://exemplo.supabase.co/signed-comprovante',
      expiresInSeconds: 300,
    });
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    fireEvent.click(screen.getByRole('button', { name: 'Enviar comprovante' }));

    expect(await screen.findByText('Comprovante enviado com sucesso.')).toBeInTheDocument();
    const verComprovanteBtn = await screen.findByRole('button', { name: 'Ver comprovante' });

    fireEvent.click(verComprovanteBtn);

    await waitFor(() => {
      expect(screen.queryByText('Comprovante enviado com sucesso.')).not.toBeInTheDocument();
    });

    openSpy.mockRestore();
  });

  it('item 9.3: mostra "Ver comprovante" em vez do formulário de envio quando já existe um anexado', async () => {
    getSolicitacaoDetailMock.mockResolvedValue({
      ...sampleDetail,
      solicitacao: { ...sampleDetail.solicitacao, status: 'Publicado' },
    });
    getPublicacaoDetalheMock.mockResolvedValue({
      dataPublicada: '2026-09-01T14:00:00Z',
      tipo: 'manual',
      permalink: null,
      numeroVersao: 1,
      temComprovante: true,
    });
    getComprovanteDownloadUrlMock.mockResolvedValue({
      url: 'https://exemplo.supabase.co/signed-comprovante',
      expiresInSeconds: 300,
    });
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Ver comprovante' }));

    await waitFor(() => {
      expect(getComprovanteDownloadUrlMock).toHaveBeenCalledWith(10);
      expect(openSpy).toHaveBeenCalledWith(
        'https://exemplo.supabase.co/signed-comprovante',
        '_blank',
        'noopener,noreferrer',
      );
    });
    expect(screen.queryByRole('button', { name: 'Enviar comprovante' })).not.toBeInTheDocument();

    openSpy.mockRestore();
  });
});
