import { describe, expect, it } from 'vitest';
import { avisoProporcaoInstagram } from './proporcaoInstagram';

/**
 * O aviso existe por causa de uma recusa real da Meta em produção: arte
 * 360x106 (proporção 3,40) foi rejeitada no horário agendado com
 * `code 36003 / error_subcode 2207009`. O designer só descobria dias depois.
 */
describe('avisoProporcaoInstagram', () => {
  it('avisa sobre a arte 360x106 recusada em produção', () => {
    const aviso = avisoProporcaoInstagram(360, 106);
    expect(aviso).toContain('360×106');
    expect(aviso).toContain('3.40:1');
    expect(aviso).toContain('larga');
    // O texto precisa deixar claro que enviar continua possível (RF014 manual).
    expect(aviso).toContain('publicar manualmente');
  });

  it('não avisa para imagem quadrada (1080x1080)', () => {
    expect(avisoProporcaoInstagram(1080, 1080)).toBeNull();
  });

  it('não avisa nos extremos aceitos pelo feed (4:5 e 1.91:1)', () => {
    expect(avisoProporcaoInstagram(1080, 1350)).toBeNull(); // 0,80
    expect(avisoProporcaoInstagram(1910, 1000)).toBeNull(); // 1,91
  });

  it('avisa quando é alta demais (mais estreita que 4:5)', () => {
    const aviso = avisoProporcaoInstagram(1080, 1920);
    expect(aviso).toContain('alta');
  });

  it('ignora dimensões inválidas em vez de inventar aviso', () => {
    expect(avisoProporcaoInstagram(0, 100)).toBeNull();
    expect(avisoProporcaoInstagram(Number.NaN, 100)).toBeNull();
  });
});
