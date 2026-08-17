import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { config as loadDotEnv } from 'dotenv';
import { z } from 'zod';

const candidates = [
  resolve(process.cwd(), '.env.local'),
  resolve(process.cwd(), '..', '.env.local'),
];

for (const candidate of candidates) {
  if (existsSync(candidate)) {
    loadDotEnv({ path: candidate, quiet: true });
    break;
  }
}

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  FRONTEND_URL: z.string().url().default('http://localhost:5173'),
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_PUBLISHABLE_KEY: z.string().min(1).optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  META_APP_ID: z.string().min(1).optional(),
  META_APP_SECRET: z.string().min(1).optional(),
  WHATSAPP_ACCESS_TOKEN: z.string().min(1).optional(),
  WHATSAPP_PHONE_NUMBER_ID: z.string().min(1).optional(),
  WHATSAPP_BUSINESS_ACCOUNT_ID: z.string().min(1).optional(),
  WHATSAPP_VERIFY_TOKEN: z.string().min(1).optional(),
  INSTAGRAM_ACCESS_TOKEN: z.string().min(1).optional(),
  INSTAGRAM_ACCOUNT_ID: z.string().min(1).optional(),
  /**
   * RF014/seção 11: segredo compartilhado do endpoint interno de publicação
   * (chamado pelo job/cron, nunca por um usuário). Mínimo de 32 caracteres
   * (seção 12.3/12.5) — a rota é protegida só por este segredo, sem sessão
   * de usuário, então um valor curto/previsível facilitaria força bruta.
   */
  INTERNAL_JOB_SECRET: z.string().min(32).optional(),
});

// Aceita nomes de convenção alternativa (ex.: NEXT_PUBLIC_*) apenas como
// fallback de conveniência local, sem alterar os nomes canônicos do
// .env.example. Nunca duplica valor em arquivo; lê só em memória.
const rawEnv = {
  ...process.env,
  SUPABASE_URL: process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY:
    process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
};

const parsed = schema.safeParse(rawEnv);

if (!parsed.success) {
  const names = parsed.error.issues.map((issue) => issue.path.join('.')).filter(Boolean);
  throw new Error(`Configuração de ambiente inválida: ${names.join(', ')}`);
}

export const env = parsed.data;

export const supabaseConfigStatus = {
  hasPublicClient: Boolean(env.SUPABASE_URL && env.SUPABASE_PUBLISHABLE_KEY),
  hasAdminClient: Boolean(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY),
} as const;

export const whatsappConfigStatus = {
  /** Necessário para enviar mensagens (RF004) via WhatsApp Cloud API oficial. */
  hasSendingClient: Boolean(env.WHATSAPP_ACCESS_TOKEN && env.WHATSAPP_PHONE_NUMBER_ID),
  /** Necessário para verificar assinatura/handshake do webhook (seção 12.3). */
  hasWebhookSecurity: Boolean(env.META_APP_SECRET && env.WHATSAPP_VERIFY_TOKEN),
} as const;

export const instagramConfigStatus = {
  /** Necessário para publicar automaticamente (RF014) via Instagram API oficial. */
  hasPublishingClient: Boolean(env.INSTAGRAM_ACCESS_TOKEN && env.INSTAGRAM_ACCOUNT_ID),
} as const;

export const internalJobConfigStatus = {
  /** RF014/seção 11: sem este segredo, o endpoint interno de publicação fica indisponível (fail-closed). */
  hasSecret: Boolean(env.INTERNAL_JOB_SECRET),
} as const;
