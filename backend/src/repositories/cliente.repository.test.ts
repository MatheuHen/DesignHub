import { describe, expect, it } from 'vitest';
import { ConflictError, NotFoundError } from '../lib/errors.js';
import { deleteCliente, updateCliente } from './cliente.repository.js';

function createUpdateClient(returnedRows: unknown[]) {
  return {
    from: () => ({
      update: () => ({
        eq: () => ({
          eq: () => ({
            select: () => Promise.resolve({ data: returnedRows, error: null }),
          }),
        }),
      }),
    }),
  } as unknown as Parameters<typeof updateCliente>[0];
}

function createDeleteClient(returnedRows: unknown[], error: { message: string; code?: string } | null = null) {
  return {
    from: () => ({
      delete: () => ({
        eq: () => ({
          eq: () => ({
            select: () => Promise.resolve({ data: error ? null : returnedRows, error }),
          }),
        }),
      }),
    }),
  } as unknown as Parameters<typeof deleteCliente>[0];
}

describe('updateCliente (RF003 — defesa em profundidade de ownership)', () => {
  it('lança NotFoundError quando nenhuma linha corresponde a id + id_designer', async () => {
    const client = createUpdateClient([]);
    await expect(updateCliente(client, 1, 'designer-x', { nome: 'Novo' })).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it('resolve quando exatamente uma linha é atualizada', async () => {
    const client = createUpdateClient([{ id_cliente: 1 }]);
    await expect(updateCliente(client, 1, 'designer-x', { nome: 'Novo' })).resolves.toBeUndefined();
  });
});

describe('deleteCliente (RF003)', () => {
  it('traduz violação de FK em ConflictError acionável', async () => {
    const client = createDeleteClient([], {
      message: 'update or delete on table "cliente" violates foreign key constraint',
      code: '23503',
    });
    await expect(deleteCliente(client, 1, 'designer-x')).rejects.toBeInstanceOf(ConflictError);
  });

  it('lança NotFoundError quando nenhuma linha corresponde a id + id_designer', async () => {
    const client = createDeleteClient([]);
    await expect(deleteCliente(client, 1, 'designer-x')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('resolve quando exatamente uma linha é excluída', async () => {
    const client = createDeleteClient([{ id_cliente: 1 }]);
    await expect(deleteCliente(client, 1, 'designer-x')).resolves.toBeUndefined();
  });
});
