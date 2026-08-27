import { describe, expect, it } from 'vitest';
import { ConflictError, NotFoundError } from '../lib/errors.js';
import { assertDesignerIsActive } from './designer.repository.js';

function createMaybeSingleClient(row: unknown) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({ maybeSingle: () => Promise.resolve({ data: row, error: null }) }),
          maybeSingle: () => Promise.resolve({ data: row, error: null }),
        }),
      }),
    }),
  } as unknown as Parameters<typeof assertDesignerIsActive>[0];
}

describe('assertDesignerIsActive (RF016/RN44/RN45)', () => {
  it('lança NotFoundError quando o designer de destino não existe', async () => {
    const client = createMaybeSingleClient(null);
    await expect(assertDesignerIsActive(client, 'designer-x')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('lança ConflictError quando o designer de destino está inativo', async () => {
    const client = createMaybeSingleClient({
      id_usuario: 'designer-x',
      nome_completo: 'Designer X',
      email: 'x@exemplo.com',
      status: 'inativo',
      designer: { whatsapp: null, bloqueado: false, status_operacional: null },
    });
    await expect(assertDesignerIsActive(client, 'designer-x')).rejects.toBeInstanceOf(ConflictError);
  });

  it('resolve sem erro quando o designer está ativo', async () => {
    const client = createMaybeSingleClient({
      id_usuario: 'designer-x',
      nome_completo: 'Designer X',
      email: 'x@exemplo.com',
      status: 'ativo',
      designer: { whatsapp: null, bloqueado: false, status_operacional: null },
    });
    await expect(assertDesignerIsActive(client, 'designer-x')).resolves.toBeUndefined();
  });
});
