import { describe, expect, it } from 'vitest';
import { createClienteSchema } from './cliente.schemas.js';

describe('whatsappSchema (RF004: matching do webhook exige código do país)', () => {
  it('rejeita número sem código do país (11 dígitos: DDD + número), mesmo com 11 dígitos', () => {
    const result = createClienteSchema.safeParse({ nome: 'Cliente Teste', whatsapp: '64988885274' });
    expect(result.success).toBe(false);
  });

  it('aceita número com código do país (13 dígitos: 55 + DDD + número)', () => {
    const result = createClienteSchema.safeParse({ nome: 'Cliente Teste', whatsapp: '5564988885274' });
    expect(result.success).toBe(true);
  });
});
