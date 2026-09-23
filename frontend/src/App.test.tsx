import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';

const { getSessionMock, onAuthStateChangeMock, signOutMock } = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  onAuthStateChangeMock: vi.fn(),
  signOutMock: vi.fn(),
}));

vi.mock('./lib/supabaseClient', () => ({
  isSupabaseConfigured: true,
  supabase: {
    auth: {
      getSession: getSessionMock,
      onAuthStateChange: onAuthStateChangeMock,
      signInWithPassword: vi.fn(),
      signOut: signOutMock,
    },
  },
}));

/** Callback registrado por `AuthProvider` — usado para simular o evento real de logout do Supabase. */
let authStateChangeCallback: ((event: string, session: unknown) => void) | null = null;

describe('App routing por perfil (RF002)', () => {
  beforeEach(() => {
    window.history.pushState({}, 'Test', '/');
    getSessionMock.mockReset();
    authStateChangeCallback = null;
    onAuthStateChangeMock.mockReset().mockImplementation((callback: (event: string, session: unknown) => void) => {
      authStateChangeCallback = callback;
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    });
    signOutMock.mockReset().mockImplementation(() => {
      authStateChangeCallback?.('SIGNED_OUT', null);
      return Promise.resolve({ error: null });
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
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

  it('não deixa um perfil administrador acessar a área do designer (autorização negativa, sentido inverso)', async () => {
    getSessionMock.mockResolvedValue({
      data: { session: { access_token: 'token-admin', user: { id: 'u2' } } },
    });
    // AdminHome redireciona para /admin/designers (única área administrativa
    // real, ver AdminHome.tsx) — o fetch precisa responder corretamente tanto
    // /api/auth/me quanto a listagem de designers dessa página.
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        if (url.includes('/api/auth/me')) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                id: 'u2',
                email: 'admin@exemplo.adm',
                nomeCompleto: 'Ana Admin',
                perfil: 'administrador',
                status: 'ativo',
              }),
          });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ items: [], total: 0, page: 1, pageSize: 20 }),
        });
      }),
    );
    window.history.pushState({}, 'Test', '/designer/clientes');

    render(<App />);

    expect(await screen.findByText(/Olá, Ana Admin/)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Clientes' })).not.toBeInTheDocument();
  });

  it('correção de segurança: desloga automaticamente após 1h de inatividade e mostra o aviso no login', async () => {
    // Timers fake desde antes do render: o timeout de inatividade é agendado
    // já no efeito de montagem, então precisa ser o MESMO `setTimeout` fake
    // que será avançado depois (senão o timer real fica pendurado, nunca
    // avança, e o teste passaria por engano). `findBy*` do RTL não é usado
    // aqui por depender de setTimeout real para o próprio retry — em vez
    // disso avançamos os timers fake por 0ms para drenar as promises da
    // carga inicial do perfil antes de checar com `getBy*` (síncrono).
    vi.useFakeTimers();
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
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByText(/Olá, Dora Designer/)).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60 * 60 * 1000 + 1_000);
    });

    expect(signOutMock).toHaveBeenCalled();
    expect(screen.getByRole('heading', { name: 'Entrar' })).toBeInTheDocument();
    expect(screen.getByText('Sua sessão expirou por inatividade.')).toBeInTheDocument();
  });

  it('correção de segurança: atividade do usuário reinicia o contador e evita o logout automático', async () => {
    vi.useFakeTimers();
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
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByText(/Olá, Dora Designer/)).toBeInTheDocument();

    // Passa 59min, gera atividade real (reinicia o contador) e passa mais 59min —
    // sem a atividade, os 118min totais já teriam disparado o logout de 1h.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(59 * 60 * 1000);
    });
    act(() => {
      window.dispatchEvent(new MouseEvent('mousemove'));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(59 * 60 * 1000);
    });

    expect(signOutMock).not.toHaveBeenCalled();
    expect(screen.getByText(/Olá, Dora Designer/)).toBeInTheDocument();
  });

  it('correção de segurança: restauração via bfcache revalida a sessão em vez de confiar no estado em memória', async () => {
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

    // Sessão real já não existe mais (ex.: usuário deslogou em outra aba/dispositivo,
    // ou o token expirou) — o navegador restaura o documento pelo bfcache.
    getSessionMock.mockResolvedValue({ data: { session: null } });
    const pageShowEvent = new Event('pageshow');
    Object.defineProperty(pageShowEvent, 'persisted', { value: true });
    act(() => {
      window.dispatchEvent(pageShowEvent);
    });

    expect(await screen.findByRole('heading', { name: 'Entrar' })).toBeInTheDocument();
  });
});
