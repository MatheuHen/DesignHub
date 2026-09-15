import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const errors = [];
const warnings = [];

function exists(rel) {
  return existsSync(join(root, rel));
}

const required = [
  'CLAUDE.md',
  '.gitignore',
  '.env.example',
  '.claude/agents',
  '.claude/skills',
  'docs/tfc-oficial/ORDEM_DE_PRECEDENCIA.md',
  'frontend/package.json',
  'backend/package.json',
  'supabase/migrations'
];

for (const item of required) {
  if (!exists(item)) errors.push(`Ausente: ${item}`);
}

if (exists('.env.local.txt')) {
  errors.push('Existe .env.local.txt. Renomeie para .env.local.');
}

const gitRepo = spawnSync('git', ['rev-parse', '--is-inside-work-tree'], { cwd: root, encoding: 'utf8' });
const insideGit = gitRepo.status === 0 && gitRepo.stdout.trim() === 'true';

if (exists('.env.local')) {
  if (insideGit) {
    const git = spawnSync('git', ['check-ignore', '-q', '.env.local'], { cwd: root });
    if (git.status !== 0) {
      errors.push('.env.local existe, mas git check-ignore não confirmou que está ignorado.');
    }
  } else {
    warnings.push('Ainda não é um repositório Git; valide git check-ignore após git init/clonar o repositório.');
  }
} else {
  warnings.push('.env.local ainda não existe. Isso é esperado até você inserir as credenciais.');
}

const forbiddenNames = new Set(['chaves.txt']);
const skipDirs = new Set(['node_modules', 'dist', 'build']);

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const rel = relative(root, full).replaceAll('\\', '/');

    if (name === '.git') {
      if (rel !== '.git') errors.push(`Repositório Git aninhado detectado: ${rel}`);
      continue;
    }

    if (skipDirs.has(name)) continue;

    const st = statSync(full);
    if (st.isDirectory()) {
      walk(full);
    } else if (forbiddenNames.has(name.toLowerCase())) {
      errors.push(`Arquivo de segredo proibido no projeto: ${rel}`);
    }
  }
}
walk(root);

const gitignore = exists('.gitignore') ? readFileSync(join(root, '.gitignore'), 'utf8') : '';
if (!gitignore.includes('.env.*')) errors.push('Revise .gitignore: regra .env.* não encontrada.');
if (!gitignore.includes('!.env.example')) errors.push('Revise .gitignore: exceção !.env.example não encontrada.');

console.log('DESIGNHUB PREFLIGHT');
for (const warning of warnings) console.warn(`WARN: ${warning}`);
for (const error of errors) console.error(`ERROR: ${error}`);

if (errors.length > 0) process.exit(1);
console.log('OK: estrutura base aprovada.');
