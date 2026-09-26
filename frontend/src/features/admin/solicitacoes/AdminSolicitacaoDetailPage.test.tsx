import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { SolicitacaoDetailResult } from '../../designer/solicitacoes/api';

const { getSolicitacaoDetailMock, getVersaoArteDownloadUrlMock, getPublicacaoDetalheMock, getComprovanteDownloadUrlMock } = vi.hoisted(() => ({
  getSolicitacaoDetailMock: vi.fn(),
  getVersaoArteDownloadUrlMock: vi.fn(),
  getPublicacaoDetalheMock: vi.fn(),
  getComprovanteDownloadUrlMock: vi.fn(),
}));

vi.mock('../../designer/solicitacoes/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../designer/solicitacoes/api')>();
  return {
    ...actual,
    getSolicitacaoDetail: getSolicitacaoDetailMock,
    getVersaoArteDownloadUrl: getVersaoArteDownloadUrlMock,
    getPublicacaoDetalhe: getPublicacaoDetalheMock,
    getComprovanteDownloadUrl: getComprovanteDownloadUrlMock,
  };
});

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

const { AdminSolicitacaoDetailPage } = await import('./AdminSolicitacaoDetailPage');

const sampleDetail: SolicitacaoDetailResult = {
  solicitacao: {
    id: 10,
    idCliente: 1,
    clienteNome: 'Cliente Teste',
    idDesigner: 'designer-2',
    tema: 'Tema X',
    status: 'Aprovado',
    dataCriacao: '2026-01-01T00:00:00Z',
    prazoPrimeiraVersao: '2026-01-06T00:00:00Z',
    prazoAtual: { tipo: 'sem_prazo_definido', dataHora: null, responsavel: null },
    descricao: null,
    cores: 'Azul',
    observacoes: 'Observação teste',
  },
  historico: [
    {
      id_historico: 1,
      acao: 'Solicitação criada',
      status_anterior: null,
      status_novo: 'Em produção',
      data_hora: '2026-01-01T00:00:00Z',
    },
  ],
  respostasAtendimento: [],
  versoes: [
    { id_versao: 1, numero_versao: 1, formato: 'PNG', data_envio: '2026-01-02T00:00:00Z', observacoes: null },
  ],
  ajustes: [],
  agendamento: null,
  preferenciaAgendamento: null,
};

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/admin/solicitacoes/10']}>
      <Routes>
        <Route path="/admin/solicitacoes/:id" element={<AdminSolicitacaoDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('AdminSolicitacaoDetailPage (RF016/QUADRO 61: Consultar solicitação de qualquer designer)', () => {
  it('exibe os dados da solicitação em modo somente leitura, sem ações de escrita', async () => {
    getSolicitacaoDetailMock.mockResolvedValue(sampleDetail);

    renderPage();

    expect(await screen.findByText('Cliente Teste')).toBeInTheDocument();
    expect(screen.getByText('Aprovado')).toBeInTheDocument();
    expect(screen.getByText('Tema X')).toBeInTheDocument();
    expect(screen.getByText('Azul')).toBeInTheDocument();
    expect(screen.getByText(/V1 — PNG/)).toBeInTheDocument();
    expect(screen.getByText(/Solicitação criada/)).toBeInTheDocument();

    expect(getSolicitacaoDetailMock).toHaveBeenCalledWith(10);
    expect(screen.queryByRole('button', { name: /salvar/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /reatribuir/i })).not.toBeInTheDocument();
  });

  it('item 5.6 (correções 13/09/2026): admin visualiza e baixa versões de qualquer designer', async () => {
    getSolicitacaoDetailMock.mockResolvedValue(sampleDetail);
    getVersaoArteDownloadUrlMock.mockReset().mockResolvedValue({
      url: 'https://exemplo.supabase.co/signed-url',
      expiresInSeconds: 300,
    });
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

    renderPage();
    await screen.findByText('Cliente Teste');

    fireEvent.click(screen.getByRole('button', { name: 'Baixar' }));

    await waitFor(() => {
      expect(getVersaoArteDownloadUrlMock).toHaveBeenCalledWith(10, 1, false);
      expect(openSpy).toHaveBeenCalledWith('https://exemplo.supabase.co/signed-url', '_blank', 'noopener,noreferrer');
    });

    openSpy.mockRestore();
  });

  it('item 9.1/9.3 (correções 13/09/2026): mostra badge de publicação e permite ver o comprovante, somente leitura', async () => {
    getSolicitacaoDetailMock.mockResolvedValue({
      ...sampleDetail,
      solicitacao: { ...sampleDetail.solicitacao, status: 'Publicado' },
    });
    getPublicacaoDetalheMock.mockReset().mockResolvedValue({
      dataPublicada: '2026-09-01T14:00:00Z',
      tipo: 'automatica',
      permalink: 'https://www.instagram.com/p/abc123/',
      numeroVersao: 2,
      temComprovante: true,
    });
    getComprovanteDownloadUrlMock.mockReset().mockResolvedValue({
      url: 'https://exemplo.supabase.co/signed-comprovante',
      expiresInSeconds: 300,
    });
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

    renderPage();

    expect(await screen.findByText(/automática \(Instagram\)/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver publicação no Instagram' })).toHaveAttribute(
      'href',
      'https://www.instagram.com/p/abc123/',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Ver comprovante' }));

    await waitFor(() => {
      expect(getComprovanteDownloadUrlMock).toHaveBeenCalledWith(10);
      expect(openSpy).toHaveBeenCalledWith(
        'https://exemplo.supabase.co/signed-comprovante',
        '_blank',
        'noopener,noreferrer',
      );
    });

    openSpy.mockRestore();
  });
});
