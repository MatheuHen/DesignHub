import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConflictError, NotFoundError } from '../lib/errors.js';

const {
  getSupabaseAdminClientMock,
  getClienteByIdMock,
  insertClienteMock,
  updateClienteMock,
  deleteClienteMock,
} = vi.hoisted(() => ({
  getSupabaseAdminClientMock: vi.fn(() => ({ __kind: 'admin-client' })),
  getClienteByIdMock: vi.fn(),
  insertClienteMock: vi.fn(),
  updateClienteMock: vi.fn(),
  deleteClienteMock: vi.fn(),
}));

vi.mock('../config/supabase.js', () => ({
  getSupabaseAdminClient: getSupabaseAdminClientMock,
}));

vi.mock('../repositories/cliente.repository.js', () => ({
  getClienteById: getClienteByIdMock,
  insertCliente: insertClienteMock,
  listClientes: vi.fn(),
  updateCliente: updateClienteMock,
  deleteCliente: deleteClienteMock,
}));

const { createCliente, getCliente, removeCliente, updateCliente } = await import('./cliente.service.js');

const sampleCliente = {
  id: 1,
  idDesigner: 'designer-1',
  nome: 'Cliente Teste',
  whatsapp: '5511988887777',
  instagram: null,
};

describe('cliente.service (RF003)', () => {
  beforeEach(() => {
    getClienteByIdMock.mockReset();
    insertClienteMock.mockReset();
    updateClienteMock.mockReset();
    deleteClienteMock.mockReset();
  });

  it('createCliente delega ao repository com o designer autenticado como dono', async () => {
    insertClienteMock.mockResolvedValue(sampleCliente);

    const result = await createCliente('designer-1', {
      nome: 'Cliente Teste',
      whatsapp: '5511988887777',
    });

    expect(insertClienteMock).toHaveBeenCalledWith(expect.anything(), {
      idDesigner: 'designer-1',
      nome: 'Cliente Teste',
      whatsapp: '5511988887777',
    });
    expect(result).toEqual(sampleCliente);
  });

  it('getCliente lança NotFoundError quando o cliente não pertence ao designer (ownership via RLS)', async () => {
    getClienteByIdMock.mockResolvedValue(null);

    await expect(getCliente({} as never, 999)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('updateCliente só escreve depois de confirmar ownership', async () => {
    getClienteByIdMock.mockResolvedValue(sampleCliente);
    updateClienteMock.mockResolvedValue(undefined);

    await updateCliente({} as never, 1, { nome: 'Novo Nome' });

    expect(getClienteByIdMock).toHaveBeenCalled();
    expect(updateClienteMock).toHaveBeenCalledWith(expect.anything(), 1, 'designer-1', {
      nome: 'Novo Nome',
    });
  });

  it('updateCliente rejeita sem chamar o repository de escrita quando não é dono', async () => {
    getClienteByIdMock.mockResolvedValue(null);

    await expect(updateCliente({} as never, 1, { nome: 'Novo Nome' })).rejects.toBeInstanceOf(
      NotFoundError,
    );
    expect(updateClienteMock).not.toHaveBeenCalled();
  });

  it('removeCliente propaga ConflictError de impedimento histórico (FK solicitacao)', async () => {
    getClienteByIdMock.mockResolvedValue(sampleCliente);
    deleteClienteMock.mockRejectedValue(
      new ConflictError('Não é possível excluir: cliente possui solicitações vinculadas.'),
    );

    await expect(removeCliente({} as never, 1)).rejects.toBeInstanceOf(ConflictError);
  });
});
