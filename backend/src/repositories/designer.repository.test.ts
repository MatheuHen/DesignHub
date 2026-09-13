import { describe, expect, it } from 'vitest';
import { ConflictError, NotFoundError } from '../lib/errors.js';
import { assertDesignerIsActive, deleteDesigner, updateDesignerPassword } from './designer.repository.js';

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

function createAuthAdminClient(deleteUserResult: { error: { message: string; code?: string } | null }) {
  return {
    auth: { admin: { deleteUser: () => Promise.resolve(deleteUserResult), updateUserById: () => Promise.resolve({ error: null }) } },
  } as unknown as Parameters<typeof deleteDesigner>[0];
}

describe('deleteDesigner (RF001/item 2.4 — exclusão ADITIVA ao Ativo/Inativo)', () => {
  it('lança ConflictError quando há violação de FK (cliente/solicitação vinculados)', async () => {
    const client = createAuthAdminClient({ error: { message: 'foreign key violation', code: '23503' } });
    await expect(deleteDesigner(client, 'designer-x')).rejects.toBeInstanceOf(ConflictError);
  });

  it('resolve sem erro quando não há impedimento histórico', async () => {
    const client = createAuthAdminClient({ error: null });
    await expect(deleteDesigner(client, 'designer-x')).resolves.toBeUndefined();
  });
});

describe('updateDesignerPassword (RF001/item 2.1)', () => {
  it('resolve sem erro quando o Supabase Auth aceita a atualização', async () => {
    const client = {
      auth: { admin: { updateUserById: () => Promise.resolve({ error: null }) } },
    } as unknown as Parameters<typeof updateDesignerPassword>[0];
    await expect(updateDesignerPassword(client, 'designer-x', 'senha1234')).resolves.toBeUndefined();
  });

  it('lança erro quando o Supabase Auth rejeita a atualização', async () => {
    const client = {
      auth: { admin: { updateUserById: () => Promise.resolve({ error: { message: 'boom' } }) } },
    } as unknown as Parameters<typeof updateDesignerPassword>[0];
    await expect(updateDesignerPassword(client, 'designer-x', 'senha1234')).rejects.toThrow('boom');
  });
});
