import { describe, expect, it } from 'vitest';
import {
  changeDesignerPasswordSchema,
  createDesignerSchema,
  updateDesignerSchema,
} from './designer.schemas.js';

const BASE_DESIGNER = { nomeCompleto: 'Dora Designer', email: 'dora@exemplo.com', whatsapp: '5511999999999' };

describe('senhaSchema (auditoria — política mínima de complexidade, RNF007)', () => {
  it('rejeita senha só com letras', () => {
    expect(createDesignerSchema.safeParse({ ...BASE_DESIGNER, senha: 'somenteletras' }).success).toBe(false);
  });

  it('rejeita senha só com números', () => {
    expect(createDesignerSchema.safeParse({ ...BASE_DESIGNER, senha: '12345678' }).success).toBe(false);
  });

  it('aceita senha com letra e número', () => {
    expect(createDesignerSchema.safeParse({ ...BASE_DESIGNER, senha: 'senha1234' }).success).toBe(true);
  });

  it('changeDesignerPasswordSchema também exige letra e número em ambos os campos', () => {
    expect(
      changeDesignerPasswordSchema.safeParse({ novaSenha: 'somenteletras', confirmarSenha: 'somenteletras' })
        .success,
    ).toBe(false);
  });
});

describe('updateDesignerSchema (auditoria — .strict() contra mass assignment)', () => {
  it('rejeita campo desconhecido (ex.: status/perfil injetado no payload)', () => {
    const result = updateDesignerSchema.safeParse({ nomeCompleto: 'Novo Nome', perfil: 'administrador' });
    expect(result.success).toBe(false);
  });

  it('aceita payload só com campos conhecidos', () => {
    const result = updateDesignerSchema.safeParse({ nomeCompleto: 'Novo Nome' });
    expect(result.success).toBe(true);
  });
});
