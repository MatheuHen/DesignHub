// Provisionamento do designer sintetico usado pelo E2E de Web Push (item 10
// da rodada de correcoes). Mesmo padrao e mesmas garantias de
// `bootstrap-e2e-admin.mjs`: nao e funcionalidade de produto, e dado
// sintetico de teste (RNF010/secao 12.5) e a senha nunca e impressa em
// stdout - vai so para um arquivo local ignorado pelo Git.
//
// A conta e reutilizada entre execucoes: se ja existir, apenas a senha e
// rotacionada, para que o teste consiga autenticar sem que nenhuma senha
// precise ser versionada ou digitada.
import { createClient } from '@supabase/supabase-js';
import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const envPath = resolve(process.cwd(), '.env.local');
const raw = readFileSync(envPath, 'utf8');
function pick(name) {
  const m = raw.match(new RegExp(`^${name}\\s*[:=]\\s*(.*)$`, 'm'));
  return m ? m[1].trim() : undefined;
}
const url = pick('NEXT_PUBLIC_SUPABASE_URL') ?? pick('SUPABASE_URL');
const secret = pick('SUPABASE_SECRET_KEY');
if (!url || !secret) {
  console.error('SUPABASE_URL/SUPABASE_SECRET_KEY ausentes em .env.local');
  process.exit(1);
}

const admin = createClient(url, secret, { auth: { persistSession: false } });

// Sem sufixo `.adm`: RN50 reserva esse sufixo para o perfil administrativo, e
// esta conta precisa ser reconhecida como Designer em todas as camadas.
const email = 'e2e.rf014.designer@designhub.test';
const password = randomBytes(18).toString('base64url');

async function main() {
  let userId;
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createErr) {
    if (createErr.message?.includes('already been registered') || createErr.status === 422) {
      const { data: list, error: listErr } = await admin.auth.admin.listUsers();
      if (listErr) throw listErr;
      const existing = list.users.find((u) => u.email === email);
      if (!existing) throw createErr;
      userId = existing.id;
      await admin.auth.admin.updateUserById(userId, { password });
    } else {
      throw createErr;
    }
  } else {
    userId = created.user.id;
  }

  const { error: usuarioErr } = await admin
    .from('usuario')
    .upsert(
      { id_usuario: userId, nome_completo: 'E2E Designer', email, perfil: 'designer', status: 'ativo' },
      { onConflict: 'id_usuario' },
    );
  if (usuarioErr) throw usuarioErr;

  const { error: designerErr } = await admin
    .from('designer')
    .upsert({ id_usuario: userId, bloqueado: false, status_operacional: 'ativo' }, { onConflict: 'id_usuario' });
  if (designerErr) throw designerErr;

  const outPath = resolve(process.cwd(), 'docs/evidencias/.e2e-credentials.local.json');
  const atual = existsSync(outPath) ? JSON.parse(readFileSync(outPath, 'utf8')) : {};
  writeFileSync(outPath, JSON.stringify({ ...atual, designer: { email, password, userId } }, null, 2));
  console.log('OK: designer E2E provisionado. Credenciais em', outPath, '(gitignored, nunca commitar).');
}

main().catch((err) => {
  console.error('FALHA no bootstrap do designer E2E:', err.message ?? err);
  process.exit(1);
});
