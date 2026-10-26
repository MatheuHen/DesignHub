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

  it('aceita "+55 (64) 98403-5274" (formato com máscara completa)', () => {
    const result = createClienteSchema.parse({ nome: 'Cliente', whatsapp: '+55 (64) 98403-5274' });
    expect(result.whatsapp).toBe('5564984035274');
  });

  it('aceita "5564984035274" (já normalizado, 13 dígitos)', () => {
    const result = createClienteSchema.parse({ nome: 'Cliente', whatsapp: '5564984035274' });
    expect(result.whatsapp).toBe('5564984035274');
  });

  it('aceita "55 64 98403-5274" (máscara parcial, com espaços)', () => {
    const result = createClienteSchema.parse({ nome: 'Cliente', whatsapp: '55 64 98403-5274' });
    expect(result.whatsapp).toBe('5564984035274');
  });

  it('rejeita celular sem o 9º dígito obrigatório (12 dígitos)', () => {
    expect(() => createClienteSchema.parse({ nome: 'Cliente', whatsapp: '5564 8403-5274' })).toThrow(
      'Informe um celular válido com DDI 55, DDD e número iniciado por 9.',
    );
  });

  it('rejeita número com 14 dígitos (um dígito além do esperado)', () => {
    expect(() => createClienteSchema.parse({ nome: 'Cliente', whatsapp: '556498403527499' })).toThrow();
  });

  it('rejeita DDI diferente de 55', () => {
    expect(() => createClienteSchema.parse({ nome: 'Cliente', whatsapp: '1164984035274' })).toThrow(
      'Informe um celular válido com DDI 55, DDD e número iniciado por 9.',
    );
  });

  it('rejeita telefone fixo (sem o 9 inicial do celular)', () => {
    expect(() => createClienteSchema.parse({ nome: 'Cliente', whatsapp: '5564 3045-5274' })).toThrow();
  });

  it('NÃO adiciona o 9 automaticamente — número sem ele é rejeitado, nunca corrigido', () => {
    // "556498403274" tem 12 dígitos (sem o 9); o sistema não deve transformar
    // isso em "5564984032740" nem em qualquer outro valor de 13 dígitos.
    expect(() => createClienteSchema.parse({ nome: 'Cliente', whatsapp: '556498403274' })).toThrow();
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
    const result = updateClienteSchema.parse({ whatsapp: '+55 (64) 98403-5274' });
    expect(result.whatsapp).toBe('5564984035274');
  });
});
