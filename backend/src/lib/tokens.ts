import { createHash, randomBytes } from 'node:crypto';

/**
 * RF009/seção 12.1: token opaco de 256 bits para o link público de
 * avaliação. Só o hash é persistido — o valor bruto (`raw`) existe apenas
 * em memória, é devolvido uma única vez na resposta HTTP da geração e
 * inserido na mensagem WhatsApp enviada ao cliente; nunca é logado.
 */
export function generateOpaqueToken(): { raw: string; hash: string } {
  const raw = randomBytes(32).toString('hex');
  const hash = hashOpaqueToken(raw);
  return { raw, hash };
}

export function hashOpaqueToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}
