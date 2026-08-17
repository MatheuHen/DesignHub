import { MulterError } from 'multer';
import { describe, expect, it } from 'vitest';
import { ValidationError, toAppError } from './errors.js';

describe('toAppError — MulterError (RF007, upload de versão de arte)', () => {
  it('mapeia LIMIT_FILE_SIZE para ValidationError com mensagem amigável (sem detalhe interno do multer)', () => {
    const result = toAppError(new MulterError('LIMIT_FILE_SIZE'));
    expect(result).toBeInstanceOf(ValidationError);
    expect((result as ValidationError).status).toBe(400);
    expect((result as ValidationError).message).not.toMatch(/multer/i);
  });

  it('mapeia outros códigos MulterError para ValidationError genérica', () => {
    const result = toAppError(new MulterError('LIMIT_UNEXPECTED_FILE'));
    expect(result).toBeInstanceOf(ValidationError);
  });
});
