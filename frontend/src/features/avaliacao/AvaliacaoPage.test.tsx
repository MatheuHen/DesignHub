import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AvaliacaoPreview } from './api';

const { getAvaliacaoPreviewMock, submitAvaliacaoMock, cancelarAgendamentoClienteMock } = vi.hoisted(() => ({
  getAvaliacaoPreviewMock: vi.fn(),
  submitAvaliacaoMock: vi.fn(),
  cancelarAgendamentoClienteMock: vi.fn(),
}));

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./api')>();
  return {
    ...actual,
    getAvaliacaoPreview: getAvaliacaoPreviewMock,
    submitAvaliacao: submitAvaliacaoMock,
    cancelarAgendamentoCliente: cancelarAgendamentoClienteMock,
  };
});

const { AvaliacaoPage } = await import('./AvaliacaoPage');

const validPreview: AvaliacaoPreview = {
  state: 'valid',
  tema: 'Post promocional',
  numeroVersao: 1,
  formato: 'PNG',
  observacoes: null,
  downloadUrl: 'https://exemplo.supabase.co/signed',
  expiresInSeconds: 300,
};

const TOKEN = 'a'.repeat(64);

function renderPage() {
  return render(
    <MemoryRouter initialEntries={[`/avaliacao/${TOKEN}`]}>
      <Routes>
        <Route path="/avaliacao/:token" element={<AvaliacaoPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('AvaliacaoPage (RF009/RF010)', () => {
  beforeEach(() => {
    getAvaliacaoPreviewMock.mockReset();
    submitAvaliacaoMock.mockReset();
    cancelarAgendamentoClienteMock.mockReset();
  });

  it('mostra a arte e as três ações quando o link é válido', async () => {
    getAvaliacaoPreviewMock.mockResolvedValue(validPreview);

    renderPage();

    expect(await screen.findByText(/Post promocional/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Aprovar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Solicitar ajustes' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeInTheDocument();
    expect(screen.getByAltText(/Arte da versão V1/)).toBeInTheDocument();
  });

  it.each([
    ['invalid', 'Este link de avaliação não está mais disponível.'],
    ['expired', 'Este link de avaliação não está mais disponível.'],
    ['used', 'Este link de avaliação já foi utilizado.'],
  ] as const)('mostra mensagem amigável quando o link está %s', async (state, message) => {
    getAvaliacaoPreviewMock.mockResolvedValue({ state });

    renderPage();

    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Aprovar' })).not.toBeInTheDocument();
  });

  it.each(['invalid', 'expired'] as const)(
    'orienta a verificar o WhatsApp por um link mais recente quando o link está %s (rodada correções, item 6)',
    async (state) => {
      getAvaliacaoPreviewMock.mockResolvedValue({ state });

      renderPage();

      expect(
        await screen.findByText('Verifique no WhatsApp se você recebeu um link mais recente desta arte.'),
      ).toBeInTheDocument();
      expect(
        screen.getByText('Se não encontrar outro link válido, entre em contato com o designer responsável.'),
      ).toBeInTheDocument();
    },
  );

  it('mostra o acompanhamento somente-leitura quando o link já foi usado, mas identifica a solicitação (RN13/RN14/RN18)', async () => {
    getAvaliacaoPreviewMock.mockResolvedValue({
      state: 'used',
      tracking: {
        status: 'Agendado',
        tema: 'Post promocional',
        versoes: [
          { numeroVersao: 1, formato: 'PDF', dataEnvio: '2026-01-01T00:00:00Z', downloadUrl: 'https://exemplo.supabase.co/v1' },
        ],
        historico: [
          { acao: 'Solicitação criada a partir do atendimento pelo WhatsApp', statusNovo: 'Em produção', dataHora: '2026-01-01T00:00:00Z' },
        ],
        agendamento: { dataPublicacao: '2026-09-01', horario: '14:00:00', status: 'Agendado' },
      },
    });

    renderPage();

    expect(await screen.findByText(/Acompanhamento da solicitação/)).toBeInTheDocument();
    expect(screen.getAllByText(/Agendado/).length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: 'Ver arte' })).toHaveAttribute('href', 'https://exemplo.supabase.co/v1');
    expect(screen.getByText(/Solicitação criada a partir do atendimento pelo WhatsApp/)).toBeInTheDocument();
    expect(screen.queryByText('Este link de avaliação já foi utilizado.')).not.toBeInTheDocument();
  });

  const usedPreviewComAgendamento: AvaliacaoPreview = {
    state: 'used',
    tracking: {
      status: 'Agendado',
      tema: 'Post promocional',
      versoes: [],
      historico: [],
      agendamento: { dataPublicacao: '2026-09-01', horario: '14:00:00', status: 'Agendado' },
    },
  };

  it('item 8.4 (correções 13/09/2026): exige confirmação antes de cancelar o agendamento', async () => {
    getAvaliacaoPreviewMock.mockResolvedValue(usedPreviewComAgendamento);
    cancelarAgendamentoClienteMock.mockResolvedValue({ idSolicitacao: 10 });

    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Cancelar agendamento' }));

    expect(cancelarAgendamentoClienteMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar cancelamento do agendamento' }));

    await waitFor(() => expect(cancelarAgendamentoClienteMock).toHaveBeenCalledWith(TOKEN));
  });

  it('item 8.4: mostra sucesso e recarrega o acompanhamento após cancelar o agendamento', async () => {
    getAvaliacaoPreviewMock.mockResolvedValueOnce(usedPreviewComAgendamento).mockResolvedValue({
      ...usedPreviewComAgendamento,
      tracking: { ...usedPreviewComAgendamento.tracking!, status: 'Aprovado', agendamento: null },
    });
    cancelarAgendamentoClienteMock.mockResolvedValue({ idSolicitacao: 10 });

    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Cancelar agendamento' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar cancelamento do agendamento' }));

    expect(await screen.findByText('Agendamento cancelado com sucesso.')).toBeInTheDocument();
  });

  it('item 8.4: mostra o erro do backend quando faltam menos de 3h (RN31), sem cancelar', async () => {
    getAvaliacaoPreviewMock.mockResolvedValue(usedPreviewComAgendamento);
    cancelarAgendamentoClienteMock.mockRejectedValue(
      new (await import('./api')).PublicApiError(
        409,
        'CONFLICT',
        'Cancelamento não permitido: faltam menos de 3 horas para a publicação.',
      ),
    );

    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Cancelar agendamento' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar cancelamento do agendamento' }));

    expect(
      await screen.findByText('Cancelamento não permitido: faltam menos de 3 horas para a publicação.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Agendamento cancelado com sucesso.')).not.toBeInTheDocument();
  });

  it('rodada correções (item 8): aprova escolhendo "eu mesmo vou publicar" (sem data/horário)', async () => {
    getAvaliacaoPreviewMock.mockResolvedValue(validPreview);
    submitAvaliacaoMock.mockResolvedValue({ idSolicitacao: 10, statusNovo: 'Aprovado' });

    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Aprovar' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Eu mesmo vou publicar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar aprovação' }));

    await waitFor(() => {
      expect(submitAvaliacaoMock).toHaveBeenCalledWith(TOKEN, {
        decisao: 'Aprovado',
        opcaoPublicacao: 'proprio_cliente',
        dataDesejada: undefined,
        horarioDesejado: undefined,
        legendaDesejada: undefined,
      });
    });
    expect(await screen.findByText(/Arte aprovada com sucesso/)).toBeInTheDocument();
  });

  it('rodada correções (item 8): aprova escolhendo "designer agendar manualmente" informando data/horário', async () => {
    getAvaliacaoPreviewMock.mockResolvedValue(validPreview);
    submitAvaliacaoMock.mockResolvedValue({ idSolicitacao: 10, statusNovo: 'Aprovado' });

    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Aprovar' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Designer agendar manualmente' }));
    fireEvent.change(screen.getByLabelText('Data desejada'), { target: { value: '2030-06-15' } });
    fireEvent.change(screen.getByLabelText('Horário desejado'), { target: { value: '14:30' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar aprovação' }));

    await waitFor(() => {
      expect(submitAvaliacaoMock).toHaveBeenCalledWith(TOKEN, {
        decisao: 'Aprovado',
        opcaoPublicacao: 'designer_manual',
        dataDesejada: '2030-06-15',
        horarioDesejado: '14:30',
        legendaDesejada: undefined,
      });
    });
    expect(await screen.findByText(/Arte aprovada com sucesso/)).toBeInTheDocument();
  });

  it('rodada correções (item 7/8/19): "agendar automaticamente" fica desabilitado quando o Instagram não está conectado', async () => {
    getAvaliacaoPreviewMock.mockResolvedValue({ ...validPreview, clienteInstagramConectado: false });

    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Aprovar' }));

    expect(await screen.findByRole('button', { name: 'Agendar automaticamente' })).toBeDisabled();
    expect(screen.getByText(/conecte sua conta do Instagram ao DesignHub/)).toBeInTheDocument();
  });

  it('rodada correções (item 7/8/19): aprova escolhendo "agendar automaticamente" quando o Instagram está conectado e confirma o agendamento real', async () => {
    getAvaliacaoPreviewMock.mockResolvedValue({ ...validPreview, clienteInstagramConectado: true });
    submitAvaliacaoMock.mockResolvedValue({ idSolicitacao: 10, statusNovo: 'Agendado', agendamentoAutomaticoCriado: true });

    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Aprovar' }));
    const automaticoBtn = await screen.findByRole('button', { name: 'Agendar automaticamente' });
    expect(automaticoBtn).not.toBeDisabled();
    fireEvent.click(automaticoBtn);
    fireEvent.change(screen.getByLabelText('Data da publicação'), { target: { value: '2026-09-26' } });
    fireEvent.change(screen.getByLabelText('Horário da publicação'), { target: { value: '12:00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar aprovação' }));

    await waitFor(() => {
      expect(submitAvaliacaoMock).toHaveBeenCalledWith(TOKEN, {
        decisao: 'Aprovado',
        opcaoPublicacao: 'automatico',
        dataDesejada: '2026-09-26',
        horarioDesejado: '12:00',
        legendaDesejada: undefined,
      });
    });
    expect(await screen.findByText('Publicação agendada automaticamente com sucesso.')).toBeInTheDocument();
  });

  it('cancela somente após confirmação explícita', async () => {
    getAvaliacaoPreviewMock.mockResolvedValue(validPreview);
    submitAvaliacaoMock.mockResolvedValue({ idSolicitacao: 10, statusNovo: 'Cancelado' });

    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Cancelar' }));

    expect(submitAvaliacaoMock).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole('button', { name: 'Confirmar cancelamento' }));

    await waitFor(() => {
      expect(submitAvaliacaoMock).toHaveBeenCalledWith(TOKEN, { decisao: 'Cancelado' });
    });
    expect(await screen.findByText('Solicitação cancelada.')).toBeInTheDocument();
  });

  it('envia o pedido de ajustes com a descrição preenchida', async () => {
    getAvaliacaoPreviewMock.mockResolvedValue(validPreview);
    submitAvaliacaoMock.mockResolvedValue({ idSolicitacao: 10, statusNovo: 'Ajustes' });

    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Solicitar ajustes' }));

    fireEvent.change(await screen.findByLabelText('Descreva o que precisa ser ajustado'), {
      target: { value: 'Mudar a cor de fundo' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar pedido de ajustes' }));

    await waitFor(() => {
      expect(submitAvaliacaoMock).toHaveBeenCalledWith(TOKEN, {
        decisao: 'Ajustes',
        descricao: 'Mudar a cor de fundo',
        observacoes: undefined,
        referencia: undefined,
      });
    });
    expect(await screen.findByText(/Pedido de ajustes enviado/)).toBeInTheDocument();
  });

  it('mostra o aviso de tratamento de dados conforme a LGPD (RNF010)', async () => {
    getAvaliacaoPreviewMock.mockResolvedValue(validPreview);

    renderPage();

    expect(await screen.findByText(/LGPD \(Lei nº 13\.709\/2018\)/)).toBeInTheDocument();
  });

  it('mostra erro amigável quando a prévia falha ao carregar', async () => {
    getAvaliacaoPreviewMock.mockRejectedValue(new Error('network down'));

    renderPage();

    expect(await screen.findByText('Não foi possível carregar o link de avaliação.')).toBeInTheDocument();
  });
});
