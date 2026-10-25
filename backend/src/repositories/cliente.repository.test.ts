import { describe, expect, it } from 'vitest';
import { ConflictError, NotFoundError } from '../lib/errors.js';
import {
  deleteCliente,
  findClienteDuplicadoPorWhatsapp,
  insertCliente,
  listClientes,
  updateCliente,
} from './cliente.repository.js';

function createInsertClient(error: { code?: string; message: string } | null, data: unknown = null) {
  return {
    from: () => ({
      insert: () => ({
        select: () => ({
          single: () => Promise.resolve({ data, error }),
        }),
      }),
    }),
  } as unknown as Parameters<typeof insertCliente>[0];
}

function createUpdateClientWithError(error: { code?: string; message: string } | null) {
  return {
    from: () => ({
      update: () => ({
        eq: () => ({
          eq: () => ({
            select: () => Promise.resolve({ data: error ? null : [{ id_cliente: 1 }], error }),
          }),
        }),
      }),
    }),
  } as unknown as Parameters<typeof updateCliente>[0];
}

function createFindDuplicadoClient(
  response: { data: unknown; error: { message: string; code?: string } | null },
  capturedFilters: { idDesigner?: string; whatsapp?: string; excludedId?: number } = {},
) {
  return {
    from: () => ({
      select: () => ({
        eq: (col: string, value: string) => {
          if (col === 'id_designer') capturedFilters.idDesigner = value;
          if (col === 'whatsapp') capturedFilters.whatsapp = value;
          return {
            eq: (col2: string, value2: string) => {
              if (col2 === 'whatsapp') capturedFilters.whatsapp = value2;
              return {
                neq: (col3: string, value3: number) => {
                  if (col3 === 'id_cliente') capturedFilters.excludedId = value3;
                  return { maybeSingle: () => Promise.resolve(response) };
                },
                maybeSingle: () => Promise.resolve(response),
              };
            },
          };
        },
      }),
    }),
  } as unknown as Parameters<typeof findClienteDuplicadoPorWhatsapp>[0];
}

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

describe('findClienteDuplicadoPorWhatsapp (RF003 — WhatsApp único por designer)', () => {
  it('retorna null quando não há duplicado', async () => {
    const client = createFindDuplicadoClient({ data: null, error: null });
    await expect(
      findClienteDuplicadoPorWhatsapp(client, 'designer-1', '5564984035274'),
    ).resolves.toBeNull();
  });

  it('retorna o id do cliente duplicado encontrado', async () => {
    const client = createFindDuplicadoClient({ data: { id_cliente: 7 }, error: null });
    await expect(
      findClienteDuplicadoPorWhatsapp(client, 'designer-1', '5564984035274'),
    ).resolves.toBe(7);
  });

  it('trata PGRST116 (mais de uma linha — duplicidade antiga pré-existente) como duplicidade confirmada', async () => {
    const client = createFindDuplicadoClient({
      data: null,
      error: { message: 'JSON object requested, multiple (or no) rows returned', code: 'PGRST116' },
    });
    await expect(
      findClienteDuplicadoPorWhatsapp(client, 'designer-1', '5564984035274'),
    ).resolves.toBe(-1);
  });

  it('propaga outros erros do banco', async () => {
    const client = createFindDuplicadoClient({
      data: null,
      error: { message: 'erro de conexão' },
    });
    await expect(
      findClienteDuplicadoPorWhatsapp(client, 'designer-1', '5564984035274'),
    ).rejects.toThrow('Falha ao verificar WhatsApp duplicado');
  });
});

describe('insertCliente/updateCliente — violação da UNIQUE (id_designer, whatsapp) (409 amigável)', () => {
  it('insertCliente traduz 23505 de cliente_designer_whatsapp_unico em ConflictError amigável', async () => {
    const client = createInsertClient({
      code: '23505',
      message:
        'duplicate key value violates unique constraint "cliente_designer_whatsapp_unico"',
    });
    await expect(
      insertCliente(client, { idDesigner: 'designer-1', nome: 'Cliente', whatsapp: '5564999999999' }),
    ).rejects.toThrow('Você já tem um cliente cadastrado com este WhatsApp.');
  });

  it('insertCliente propaga outros erros 23505 não relacionados sem mascarar', async () => {
    const client = createInsertClient({
      code: '23505',
      message: 'duplicate key value violates unique constraint "outra_constraint_qualquer"',
    });
    await expect(
      insertCliente(client, { idDesigner: 'designer-1', nome: 'Cliente', whatsapp: '5564999999999' }),
    ).rejects.toThrow('Falha ao criar cliente');
  });

  it('updateCliente traduz 23505 de cliente_designer_whatsapp_unico em ConflictError amigável', async () => {
    const client = createUpdateClientWithError({
      code: '23505',
      message:
        'duplicate key value violates unique constraint "cliente_designer_whatsapp_unico"',
    });
    await expect(
      updateCliente(client, 1, 'designer-1', { whatsapp: '5564999999999' }),
    ).rejects.toBeInstanceOf(ConflictError);
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
