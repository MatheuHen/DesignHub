// Bootstrap único de um usuario administrador para os cenarios E2E da Fase 15.
// Nao e uma funcionalidade de produto (RF001-016 nao incluem "criar o primeiro
// administrador" - isso e provisionamento fora da aplicacao, igual a qualquer
// sistema real). Dado sintetico de teste (RNF010/secao 12.5), nunca deve ir
// para producao. Nunca imprime a senha gerada em stdout de forma legivel por
// terceiros alem deste processo local; grava so em arquivo local ignorado
// pelo Git.
import { createClient } from '@supabase/supabase-js';
import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const envPath = resolve(process.cwd(), '.env.local');
const raw = readFileSync(envPath, 'utf8');
function pick(name) {
  const m = raw.match(new RegExp(`^${name}=(.*)$`, 'm'));
  return m ? m[1] : undefined;
}
const url = pick('NEXT_PUBLIC_SUPABASE_URL');
const secret = pick('SUPABASE_SECRET_KEY');
if (!url || !secret) {
  console.error('SUPABASE_URL/SUPABASE_SECRET_KEY ausentes em .env.local');
  process.exit(1);
}

const admin = createClient(url, secret, { auth: { persistSession: false } });

const email = 'e2e.admin@designhub.adm';
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
      { id_usuario: userId, nome_completo: 'E2E Admin', email, perfil: 'administrador', status: 'ativo' },
      { onConflict: 'id_usuario' },
    );
  if (usuarioErr) throw usuarioErr;

  const { error: adminErr } = await admin
    .from('administrador')
    .upsert({ id_usuario: userId }, { onConflict: 'id_usuario' });
  if (adminErr) throw adminErr;

  const outPath = resolve(process.cwd(), 'docs/evidencias/.e2e-credentials.local.json');
  writeFileSync(
    outPath,
    JSON.stringify({ admin: { email, password, userId } }, null, 2),
  );
  console.log('OK: admin E2E provisionado. Credenciais em', outPath, '(gitignored, nunca commitar).');
}

main().catch((err) => {
  console.error('FALHA no bootstrap do admin E2E:', err.message ?? err);
  process.exit(1);
});
