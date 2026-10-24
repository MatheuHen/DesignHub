import { describe, expect, it } from 'vitest';
import { createClienteSchema, updateClienteSchema } from './cliente.schemas.js';

describe('createClienteSchema (RF003/RN07 — item 2.2: normalização do WhatsApp)', () => {
  it('normaliza WhatsApp com máscara para somente dígitos', () => {
    const result = createClienteSchema.parse({ nome: 'João da Silva', whatsapp: '+55 (64) 98403-5274' });
    expect(result.whatsapp).toBe('5564984035274');
  });

  it('"(64) 98403-5274" com DDI e "5564984035274" sem máscara geram o mesmo valor normalizado', () => {
    const comMascara = createClienteSchema.parse({ nome: 'Cliente', whatsapp: '+55 (64) 98403-5274' });
    const semMascara = createClienteSchema.parse({ nome: 'Cliente', whatsapp: '5564984035274' });
    expect(comMascara.whatsapp).toBe(semMascara.whatsapp);
    expect(comMascara.whatsapp).toBe('5564984035274');
  });

  it('rejeita WhatsApp sem código do país/DDD suficiente', () => {
    expect(() => createClienteSchema.parse({ nome: 'Cliente', whatsapp: '98403-5274' })).toThrow();
  });

  it('permite dois clientes com o mesmo nome (sem unicidade de nome no schema)', () => {
    const cliente1 = createClienteSchema.parse({ nome: 'João da Silva', whatsapp: '5564999991111' });
    const cliente2 = createClienteSchema.parse({ nome: 'João da Silva', whatsapp: '5564999992222' });
    expect(cliente1.nome).toBe(cliente2.nome);
    expect(cliente1.whatsapp).not.toBe(cliente2.whatsapp);
  });

  it('aceita cadastro sem observação', () => {
    const result = createClienteSchema.parse({ nome: 'Cliente', whatsapp: '5564984035274' });
    expect(result.observacao).toBeUndefined();
  });

  it('aceita cadastro com observação', () => {
    const result = createClienteSchema.parse({
      nome: 'Cliente',
      whatsapp: '5564984035274',
      observacao: 'Prefere artes com tons pastel.',
    });
    expect(result.observacao).toBe('Prefere artes com tons pastel.');
  });

  it('rejeita observação acima de 1000 caracteres', () => {
    expect(() =>
      createClienteSchema.parse({
        nome: 'Cliente',
        whatsapp: '5564984035274',
        observacao: 'a'.repeat(1001),
      }),
    ).toThrow();
  });
});

describe('updateClienteSchema — edição da observação', () => {
  it('permite limpar a observação enviando null', () => {
    const result = updateClienteSchema.parse({ observacao: null });
    expect(result.observacao).toBeNull();
  });

  it('permite atualizar apenas a observação', () => {
    const result = updateClienteSchema.parse({ observacao: 'Nova observação.' });
    expect(result.observacao).toBe('Nova observação.');
  });

  it('normaliza WhatsApp também na edição', () => {
    const result = updateClienteSchema.parse({ whatsapp: '(64) 98403-5274+55' });
    expect(result.whatsapp).toMatch(/^\d+$/);
  });
});
