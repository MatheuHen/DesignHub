import { describe, expect, it } from 'vitest';

import { registrarPublicacaoManualSchema } from './solicitacao.schemas.js';

/**
 * RF014/RN33: o permalink da publicação manual é informado pelo designer e
 * depois renderizado como link para o cliente — por isso a validação de
 * esquema é controle de segurança (seção 12.2), não só formatação.
 */
describe('registrarPublicacaoManualSchema', () => {
  it('aceita body vazio: o link é opcional e a publicação manual vale sem ele', () => {
    expect(registrarPublicacaoManualSchema.parse({})).toEqual({ permalink: undefined });
  });

  it('aceita uma URL https e remove espaços em volta', () => {
    expect(
      registrarPublicacaoManualSchema.parse({ permalink: '  https://www.instagram.com/p/ABC123/  ' }),
    ).toEqual({ permalink: 'https://www.instagram.com/p/ABC123/' });
  });

  it('trata string vazia como ausência de link', () => {
    expect(registrarPublicacaoManualSchema.parse({ permalink: '   ' })).toEqual({
      permalink: undefined,
    });
  });

  it.each([
    ['javascript:alert(1)'],
    ['JavaScript:alert(1)'],
    ['data:text/html;base64,PHNjcmlwdD4='],
    ['http://www.instagram.com/p/ABC123/'],
    ['//www.instagram.com/p/ABC123/'],
    ['vbscript:msgbox(1)'],
  ])('rejeita esquema não-https: %s', (value) => {
    expect(() => registrarPublicacaoManualSchema.parse({ permalink: value })).toThrow();
  });

  it('rejeita link acima do tamanho máximo', () => {
    const gigante = `https://exemplo.com/${'a'.repeat(500)}`;
    expect(() => registrarPublicacaoManualSchema.parse({ permalink: gigante })).toThrow();
  });

  it('rejeita campo desconhecido (mass assignment)', () => {
    expect(() =>
      registrarPublicacaoManualSchema.parse({ permalink: 'https://ok.com/p', tipo: 'automatica' }),
    ).toThrow();
  });
});
