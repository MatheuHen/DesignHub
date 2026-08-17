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
  gerarLinkAvaliacaoMock,
  createAgendamentoMock,
  updateAgendamentoMock,
  cancelAgendamentoMock,
  registrarPublicacaoManualMock,
} = vi.hoisted(() => ({
  getSolicitacaoDetailMock: vi.fn(),
  updateSolicitacaoMock: vi.fn(),
  uploadVersaoArteMock: vi.fn(),
  getVersaoArteDownloadUrlMock: vi.fn(),
  gerarLinkAvaliacaoMock: vi.fn(),
  createAgendamentoMock: vi.fn(),
  updateAgendamentoMock: vi.fn(),
  cancelAgendamentoMock: vi.fn(),
  registrarPublicacaoManualMock: vi.fn(),
}));

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./api')>();
  return {
    ...actual,
    getSolicitacaoDetail: getSolicitacaoDetailMock,
    updateSolicitacao: updateSolicitacaoMock,
    uploadVersaoArte: uploadVersaoArteMock,
    getVersaoArteDownloadUrl: getVersaoArteDownloadUrlMock,
    gerarLinkAvaliacao: gerarLinkAvaliacaoMock,
    createAgendamento: createAgendamentoMock,
    updateAgendamento: updateAgendamentoMock,
    cancelAgendamento: cancelAgendamentoMock,
    registrarPublicacaoManual: registrarPublicacaoManualMock,
  };
});

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
  agendamento: null,
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
    gerarLinkAvaliacaoMock.mockReset();
    createAgendamentoMock.mockReset();
    updateAgendamentoMock.mockReset();
    cancelAgendamentoMock.mockReset();
    registrarPublicacaoManualMock.mockReset();
  });

  it('mostra detalhes, atendimento e histórico', async () => {
    getSolicitacaoDetailMock.mockResolvedValue(sampleDetail);

    renderPage();

    expect(await screen.findByText('Cliente Teste', { exact: false })).toBeInTheDocument();
    expect(screen.getByText('Qual o tema?')).toBeInTheDocument();
    expect(screen.getByText(/Solicitação criada/)).toBeInTheDocument();
    expect(screen.getByText('Nenhuma versão enviada ainda.')).toBeInTheDocument();
  });

  it('salva as alterações do formulário', async () => {
    getSolicitacaoDetailMock.mockResolvedValue(sampleDetail);
    updateSolicitacaoMock.mockResolvedValue(undefined);

    renderPage();
    await screen.findByDisplayValue('Tema X');

    fireEvent.change(screen.getByLabelText('Tema'), { target: { value: 'Tema Novo' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));

    await waitFor(() => {
      expect(updateSolicitacaoMock).toHaveBeenCalledWith(10, {
        tema: 'Tema Novo',
        cores: 'Azul',
        observacoes: null,
        descricao: null,
      });
    });
    expect(await screen.findByText('Alterações salvas.')).toBeInTheDocument();
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
      expect(getVersaoArteDownloadUrlMock).toHaveBeenCalledWith(10, 1);
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
    fireEvent.click(await screen.findByRole('button', { name: 'Gerar e enviar link de avaliação' }));

    await waitFor(() => {
      expect(gerarLinkAvaliacaoMock).toHaveBeenCalledWith(10);
    });
    expect(await screen.findByText(/Cliente notificado via WhatsApp com sucesso/)).toBeInTheDocument();
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
    fireEvent.click(screen.getByRole('button', { name: 'Agendar publicação' }));

    await waitFor(() => {
      expect(createAgendamentoMock).toHaveBeenCalledWith(10, {
        dataPublicacao: '2026-09-01',
        horario: '10:00',
        legenda: undefined,
      });
    });
    expect(await screen.findByText('Publicação agendada com sucesso.')).toBeInTheDocument();
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

  it('exibe o erro do backend quando o cancelamento é rejeitado pela janela de 3h (RN31)', async () => {
    getSolicitacaoDetailMock.mockResolvedValue({
      ...sampleDetail,
      solicitacao: { ...sampleDetail.solicitacao, status: 'Agendado' },
      agendamento: { idAgendamento: 1, dataPublicacao: '2026-09-01', horario: '10:00:00', legenda: null },
    });
    cancelAgendamentoMock.mockRejectedValue(
      new ApiError(409, 'CONFLICT', 'Cancelamento não permitido: faltam menos de 3 horas para a publicação (RN31).'),
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
});
