import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * RF014/ADR 0005 — handshake OAuth do produto "Instagram API with Instagram
 * Login". `env.ts` resolve as variáveis uma única vez na importação, então
 * cada cenário de configuração precisa de `vi.resetModules()` +
 * reimportação dinâmica (mesmo padrão de `config/env.test.ts`).
 *
 * Motivação: a vinculação do Instagram não funcionava porque, sem
 * `PUBLIC_BACKEND_URL` configurada, o `redirect_uri` caía no default de
 * desenvolvimento (`http://localhost:3001`) — que a Meta SEMPRE rejeita,
 * exibindo apenas uma tela de erro genérica do instagram.com. O sistema
 * montava a URL silenciosamente em vez de avisar o que faltava configurar.
 */
describe('instagramOAuth — buildAuthorizeUrl/redirect_uri', () => {
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  async function importWith(overrides: Record<string, string | undefined>) {
    process.env = { ...ORIGINAL_ENV, ...overrides };
    return import('./instagramOAuth.js');
  }

  const CREDENCIAIS_OK = { INSTAGRAM_APP_ID: 'app-id-teste', INSTAGRAM_APP_SECRET: 'app-secret-teste' };

  it('monta a URL de autorização oficial com os escopos mínimos e o redirect_uri HTTPS configurado', async () => {
    const { buildAuthorizeUrl, getInstagramRedirectUri } = await importWith({
      ...CREDENCIAIS_OK,
      PUBLIC_BACKEND_URL: 'https://api.designhub.test',
    });

    const url = new URL(buildAuthorizeUrl('state-opaco'));

    expect(`${url.origin}${url.pathname}`).toBe('https://www.instagram.com/oauth/authorize');
    expect(url.searchParams.get('client_id')).toBe('app-id-teste');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('state')).toBe('state-opaco');
    expect(url.searchParams.get('scope')).toBe('instagram_business_basic,instagram_business_content_publish');
    // Mesma string usada no token exchange e exposta em /api/health.
    expect(url.searchParams.get('redirect_uri')).toBe('https://api.designhub.test/api/instagram/oauth/callback');
    expect(getInstagramRedirectUri()).toBe('https://api.designhub.test/api/instagram/oauth/callback');
    // O App secret nunca aparece na URL de autorização.
    expect(url.search).not.toContain('app-secret-teste');
  });

  it('REGRESSÃO: sem PUBLIC_BACKEND_URL, falha com erro acionável em vez de gerar um redirect_uri que a Meta rejeita', async () => {
    const { buildAuthorizeUrl } = await importWith({
      ...CREDENCIAIS_OK,
      PUBLIC_BACKEND_URL: undefined,
    });

    // `vi.resetModules()` recarrega `lib/errors.js`, então a identidade da
    // classe difere entre instâncias do módulo — a asserção é sobre a
    // mensagem, que é o que chega ao operador e nomeia o que configurar.
    expect(() => buildAuthorizeUrl('state-opaco')).toThrow(/PUBLIC_BACKEND_URL/);
    expect(() => buildAuthorizeUrl('state-opaco')).toThrow(/HTTPS/);
  });

  it('rejeita redirect_uri em HTTP mesmo quando a URL não é localhost (a Meta exige HTTPS)', async () => {
    const { buildAuthorizeUrl } = await importWith({
      ...CREDENCIAIS_OK,
      PUBLIC_BACKEND_URL: 'http://api.designhub.test',
    });

    expect(() => buildAuthorizeUrl('state-opaco')).toThrow(/HTTPS/);
  });

  it('rejeita endereço local (127.0.0.1) em HTTPS — a Meta não aceita host local como Valid OAuth Redirect URI', async () => {
    const { buildAuthorizeUrl } = await importWith({
      ...CREDENCIAIS_OK,
      PUBLIC_BACKEND_URL: 'https://127.0.0.1:3001',
    });

    expect(() => buildAuthorizeUrl('state-opaco')).toThrow(/HTTPS/);
  });

  it('sem INSTAGRAM_APP_ID/SECRET, falha nomeando as variáveis ausentes (nunca gera URL inválida)', async () => {
    const { buildAuthorizeUrl } = await importWith({
      INSTAGRAM_APP_ID: undefined,
      INSTAGRAM_APP_SECRET: undefined,
      PUBLIC_BACKEND_URL: 'https://api.designhub.test',
    });

    expect(() => buildAuthorizeUrl('state-opaco')).toThrow(/INSTAGRAM_APP_ID/);
  });
});
