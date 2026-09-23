import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Item 10/17 (rodada de correções): leitura das credenciais necessárias ao
 * E2E de Web Push. Nada é embutido no repositório — os valores vêm de
 * `.env.local` e do arquivo de credenciais sintéticas, ambos ignorados pelo
 * Git (seção 3.6.1). Nenhuma função deste módulo devolve valor para log:
 * o teste só imprime presença/ausência.
 */
/**
 * Sobe a partir do diretório de execução até achar a raiz do repositório.
 * Evita depender de `__dirname` (indisponível em ESM) e de qual diretório o
 * Playwright foi invocado — a suíte funciona tanto de `frontend/` quanto da
 * raiz do monorepo.
 */
function findRepoRoot(): string {
  let dir = process.cwd();
  for (let i = 0; i < 5; i += 1) {
    if (existsSync(resolve(dir, '.git')) || existsSync(resolve(dir, 'CLAUDE.md'))) return dir;
    const parent = resolve(dir, '..');
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

const REPO_ROOT = findRepoRoot();

/**
 * `.env.local` do projeto mistura `NOME=valor` e `NOME: valor` (é também um
 * bloco de anotações do TFC), então o parser aceita os dois separadores e
 * mantém a PRIMEIRA ocorrência de cada nome.
 */
function loadEnvLocal(): Record<string, string> {
  const path = resolve(REPO_ROOT, '.env.local');
  if (!existsSync(path)) return {};
  const out: Record<string, string> = {};
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const match = /^\s*([A-Z0-9_]+)\s*[:=]\s*(.*?)\s*$/.exec(line);
    if (!match?.[1] || !match[2]) continue;
    out[match[1]] ??= match[2].replace(/^["']|["']$/g, '');
  }
  return out;
}

const envLocal = loadEnvLocal();

/** Precedência: variável de ambiente real > `.env.local`. */
function readSecret(name: string): string | undefined {
  return process.env[name] ?? envLocal[name];
}

export function requireSecret(name: string): string {
  const value = readSecret(name);
  if (!value) throw new Error(`Variável ${name} ausente — configure o ambiente antes de rodar o E2E.`);
  return value;
}

export interface DesignerCredentials {
  email: string;
  password: string;
  userId?: string;
}

/**
 * Credenciais do designer sintético. Aceita `E2E_DESIGNER_EMAIL`/
 * `E2E_DESIGNER_PASSWORD` do ambiente e, na ausência, o arquivo gerado por
 * `scripts/bootstrap-e2e-designer.mjs` (gitignored).
 */
export function loadDesignerCredentials(): DesignerCredentials {
  const email = process.env.E2E_DESIGNER_EMAIL;
  const password = process.env.E2E_DESIGNER_PASSWORD;
  if (email && password) return { email, password };

  const path = resolve(REPO_ROOT, 'docs/evidencias/.e2e-credentials.local.json');
  if (!existsSync(path)) {
    throw new Error(
      'Credenciais do designer E2E indisponíveis. Rode `node scripts/bootstrap-e2e-designer.mjs` ou defina E2E_DESIGNER_EMAIL/E2E_DESIGNER_PASSWORD.',
    );
  }
  const parsed = JSON.parse(readFileSync(path, 'utf8')) as { designer?: DesignerCredentials };
  if (!parsed.designer?.email || !parsed.designer.password) {
    throw new Error('Arquivo de credenciais E2E não contém o designer. Rode `node scripts/bootstrap-e2e-designer.mjs`.');
  }
  return parsed.designer;
}

/**
 * Impressão segura de um valor sensível: só um hash curto, suficiente para
 * comparar duas amostras (ex.: assinatura no navegador x assinatura no banco)
 * sem revelar endpoint, p256dh ou auth (seção 17 do pedido/12.5).
 */
export function fingerprint(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 12);
}
