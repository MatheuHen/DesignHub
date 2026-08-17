import { describe, expect, it } from 'vitest';
import { detectVersaoArteFormato } from './fileSignature.js';

describe('detectVersaoArteFormato (RF007/RN23, seção 12.2 "MIME real")', () => {
  it('reconhece PDF pela assinatura %PDF', () => {
    expect(detectVersaoArteFormato(Buffer.from('%PDF-1.4 resto do arquivo'))).toBe('PDF');
  });

  it('reconhece JPG pela assinatura FF D8 FF', () => {
    expect(detectVersaoArteFormato(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00]))).toBe('JPG');
  });

  it('reconhece PNG pela assinatura de 8 bytes', () => {
    expect(
      detectVersaoArteFormato(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00])),
    ).toBe('PNG');
  });

  it('retorna null para conteúdo que não é PDF/JPG/PNG, mesmo com extensão/MIME forjados', () => {
    expect(detectVersaoArteFormato(Buffer.from('MZ executável disfarçado'))).toBeNull();
  });

  it('retorna null para buffer vazio ou curto demais', () => {
    expect(detectVersaoArteFormato(Buffer.alloc(0))).toBeNull();
    expect(detectVersaoArteFormato(Buffer.from([0xff]))).toBeNull();
  });
});
