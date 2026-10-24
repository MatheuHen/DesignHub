import { describe, expect, it } from 'vitest';
import { ConflictError, NotFoundError } from '../lib/errors.js';
import { deleteCliente, listClientes, updateCliente } from './cliente.repository.js';

function createListClient(capturedOr: { value?: string }) {
  const range = () => Promise.resolve({ data: [], error: null, count: 0 });
  const or = (value: string) => {
    capturedOr.value = value;
    return { range };
  };
  return {
    from: () => ({
      select: () => ({
        order: () => ({ or, range }),
      }),
    }),
  } as unknown as Parameters<typeof listClientes>[0];
}

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

describe('listClientes — busca por WhatsApp mascarado (bug real de smoke test em produção)', () => {
  it('escapa parênteses/vírgula com aspas duplas (sintaxe do PostgREST), nunca com barra invertida', async () => {
    const captured: { value?: string } = {};
    const client = createListClient(captured);
    await listClientes(client, { search: '(64) 98403-5274', page: 1, pageSize: 20 });
    expect(captured.value).toBeDefined();
    // Backslash antes de parênteses corrompe o filtro or() do PostgREST —
    // regressão do bug encontrado em produção (busca retornava 0 resultados).
    expect(captured.value).not.toMatch(/\\\(/);
    expect(captured.value).not.toMatch(/\\\)/);
    // O termo de WhatsApp buscado deve estar normalizado para dígitos.
    expect(captured.value).toContain('whatsapp.ilike."%64984035274%"');
  });

  it('usa aspas duplas em volta do valor do nome quando há parênteses', async () => {
    const captured: { value?: string } = {};
    const client = createListClient(captured);
    await listClientes(client, { search: '(64) 98403-5274', page: 1, pageSize: 20 });
    expect(captured.value).toContain('nome.ilike."%(64) 98403-5274%"');
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
