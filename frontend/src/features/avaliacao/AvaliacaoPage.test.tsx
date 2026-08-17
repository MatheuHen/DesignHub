import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AvaliacaoPreview } from './api';

const { getAvaliacaoPreviewMock, submitAvaliacaoMock } = vi.hoisted(() => ({
  getAvaliacaoPreviewMock: vi.fn(),
  submitAvaliacaoMock: vi.fn(),
}));

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./api')>();
  return {
    ...actual,
    getAvaliacaoPreview: getAvaliacaoPreviewMock,
    submitAvaliacao: submitAvaliacaoMock,
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
    ['invalid', 'Este link de avaliação não é válido. Solicite um novo link ao designer responsável.'],
    ['expired', 'Este link de avaliação expirou. Solicite um novo link ao designer responsável.'],
    ['used', 'Este link de avaliação já foi utilizado.'],
  ] as const)('mostra mensagem amigável quando o link está %s', async (state, message) => {
    getAvaliacaoPreviewMock.mockResolvedValue({ state });

    renderPage();

    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Aprovar' })).not.toBeInTheDocument();
  });

  it('aprova a arte com um clique', async () => {
    getAvaliacaoPreviewMock.mockResolvedValue(validPreview);
    submitAvaliacaoMock.mockResolvedValue({ idSolicitacao: 10, statusNovo: 'Aprovado' });

    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Aprovar' }));

    await waitFor(() => {
      expect(submitAvaliacaoMock).toHaveBeenCalledWith(TOKEN, { decisao: 'Aprovado' });
    });
    expect(await screen.findByText(/Arte aprovada com sucesso/)).toBeInTheDocument();
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
