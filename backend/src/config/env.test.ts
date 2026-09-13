import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Item 1 (correções 13/09/2026): FRONTEND_URL/PUBLIC_BACKEND_URL não podem
 * cair silenciosamente no default de desenvolvimento (localhost) quando
 * NODE_ENV=production — isso é exatamente o que causava links de
 * recuperação de senha/avaliação apontando para localhost em produção.
 */
describe('config/env — guarda de produção', () => {
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  async function importEnvWith(overrides: Record<string, string | undefined>) {
    process.env = { ...ORIGINAL_ENV, ...overrides };
    return import('./env.js');
  }

  it('lança erro quando NODE_ENV=production e FRONTEND_URL não está configurada', async () => {
    await expect(
      importEnvWith({ NODE_ENV: 'production', FRONTEND_URL: undefined, PUBLIC_BACKEND_URL: 'https://api.exemplo.com' }),
    ).rejects.toThrow(/FRONTEND_URL/);
  });

  it('lança erro quando NODE_ENV=production e FRONTEND_URL ainda é localhost', async () => {
    await expect(
      importEnvWith({
        NODE_ENV: 'production',
        FRONTEND_URL: 'http://localhost:5173',
        PUBLIC_BACKEND_URL: 'https://api.exemplo.com',
      }),
    ).rejects.toThrow(/FRONTEND_URL/);
  });

  it('lança erro quando NODE_ENV=production e PUBLIC_BACKEND_URL ainda é localhost', async () => {
    await expect(
      importEnvWith({
        NODE_ENV: 'production',
        FRONTEND_URL: 'https://app.exemplo.com',
        PUBLIC_BACKEND_URL: 'http://localhost:3001',
      }),
    ).rejects.toThrow(/PUBLIC_BACKEND_URL/);
  });

  it('carrega normalmente em produção quando as URLs públicas reais estão configuradas', async () => {
    const { env } = await importEnvWith({
      NODE_ENV: 'production',
      FRONTEND_URL: 'https://app.exemplo.com',
      PUBLIC_BACKEND_URL: 'https://api.exemplo.com',
    });
    expect(env.FRONTEND_URL).toBe('https://app.exemplo.com');
  });

  it('permite o default de localhost em desenvolvimento (não bloqueia o dia a dia local)', async () => {
    const { env } = await importEnvWith({ NODE_ENV: 'development', FRONTEND_URL: undefined, PUBLIC_BACKEND_URL: undefined });
    expect(env.FRONTEND_URL).toBe('http://localhost:5173');
  });
});
