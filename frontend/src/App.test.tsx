import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';

const { getSessionMock, onAuthStateChangeMock } = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  onAuthStateChangeMock: vi.fn(),
}));

vi.mock('./lib/supabaseClient', () => ({
  isSupabaseConfigured: true,
  supabase: {
    auth: {
      getSession: getSessionMock,
      onAuthStateChange: onAuthStateChangeMock,
      signInWithPassword: vi.fn(),
      signOut: vi.fn(),
    },
  },
}));

describe('App routing por perfil (RF002)', () => {
  beforeEach(() => {
    window.history.pushState({}, 'Test', '/');
    getSessionMock.mockReset();
    onAuthStateChangeMock.mockReset().mockReturnValue({
      data: { subscription: { unsubscribe: vi.fn() } },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('redireciona usuário não autenticado para a tela de login', async () => {
    getSessionMock.mockResolvedValue({ data: { session: null } });

    render(<App />);

    expect(await screen.findByRole('heading', { name: 'Entrar' })).toBeInTheDocument();
  });

  it('direciona designer autenticado para a área do designer', async () => {
    getSessionMock.mockResolvedValue({
      data: { session: { access_token: 'token-designer', user: { id: 'u1' } } },
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            id: 'u1',
            email: 'designer@exemplo.com',
            nomeCompleto: 'Dora Designer',
            perfil: 'designer',
            status: 'ativo',
          }),
      }),
    );

    render(<App />);

    expect(await screen.findByText(/Olá, Dora Designer/)).toBeInTheDocument();
  });

  it('direciona administrador autenticado para a área administrativa', async () => {
    getSessionMock.mockResolvedValue({
      data: { session: { access_token: 'token-admin', user: { id: 'u2' } } },
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            id: 'u2',
            email: 'admin@exemplo.adm',
            nomeCompleto: 'Ana Admin',
            perfil: 'administrador',
            status: 'ativo',
          }),
      }),
    );

    render(<App />);

    expect(await screen.findByText(/Olá, Ana Admin/)).toBeInTheDocument();
  });

  it('não deixa um perfil designer acessar a área administrativa (autorização negativa)', async () => {
    getSessionMock.mockResolvedValue({
      data: { session: { access_token: 'token-designer', user: { id: 'u1' } } },
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            id: 'u1',
            email: 'designer@exemplo.com',
            nomeCompleto: 'Dora Designer',
            perfil: 'designer',
            status: 'ativo',
          }),
      }),
    );
    window.history.pushState({}, 'Test', '/admin');

    render(<App />);

    expect(await screen.findByText(/Olá, Dora Designer/)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Designers' })).not.toBeInTheDocument();
  });

  it('bloqueia acesso anônimo a uma URL profunda de admin (link copiado sem sessão)', async () => {
    getSessionMock.mockResolvedValue({ data: { session: null } });
    window.history.pushState({}, 'Test', '/admin/designers');

    render(<App />);

    expect(await screen.findByRole('heading', { name: 'Entrar' })).toBeInTheDocument();
    expect(screen.queryByText('Designers')).not.toBeInTheDocument();
  });

  it('bloqueia acesso anônimo a uma URL profunda de designer (link copiado sem sessão)', async () => {
    getSessionMock.mockResolvedValue({ data: { session: null } });
    window.history.pushState({}, 'Test', '/designer/clientes');

    render(<App />);

    expect(await screen.findByRole('heading', { name: 'Entrar' })).toBeInTheDocument();
  });

  it('não expõe conteúdo protegido quando o perfil não pôde ser carregado (token inválido/expirado)', async () => {
    getSessionMock.mockResolvedValue({
      data: { session: { access_token: 'token-expirado', user: { id: 'u1' } } },
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 401, json: () => Promise.resolve({}) }),
    );
    window.history.pushState({}, 'Test', '/admin/designers');

    render(<App />);

    expect(await screen.findByText(/não foi possível carregar o perfil/i)).toBeInTheDocument();
    expect(screen.queryByText('Designers')).not.toBeInTheDocument();
  });

  it('mostra o aviso de bloqueio quando o designer está bloqueado por atraso (RF006)', async () => {
    getSessionMock.mockResolvedValue({
      data: { session: { access_token: 'token-designer', user: { id: 'u1' } } },
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            id: 'u1',
            email: 'designer@exemplo.com',
            nomeCompleto: 'Dora Designer',
            perfil: 'designer',
            status: 'ativo',
            bloqueado: true,
          }),
      }),
    );

    render(<App />);

    expect(await screen.findByText(/bloqueado para iniciar novos atendimentos/i)).toBeInTheDocument();
  });
});
