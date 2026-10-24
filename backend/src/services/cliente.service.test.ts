import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConflictError, NotFoundError } from '../lib/errors.js';

const {
  getSupabaseAdminClientMock,
  getClienteByIdMock,
  insertClienteMock,
  updateClienteMock,
  deleteClienteMock,
  findClienteDuplicadoPorWhatsappMock,
} = vi.hoisted(() => ({
  getSupabaseAdminClientMock: vi.fn(() => ({ __kind: 'admin-client' })),
  getClienteByIdMock: vi.fn(),
  insertClienteMock: vi.fn(),
  updateClienteMock: vi.fn(),
  deleteClienteMock: vi.fn(),
  findClienteDuplicadoPorWhatsappMock: vi.fn(),
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
  findClienteDuplicadoPorWhatsapp: findClienteDuplicadoPorWhatsappMock,
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
    findClienteDuplicadoPorWhatsappMock.mockReset();
    findClienteDuplicadoPorWhatsappMock.mockResolvedValue(null);
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

  it('createCliente permite mesmo nome com WhatsApp diferente (sem checar duplicidade de nome)', async () => {
    findClienteDuplicadoPorWhatsappMock.mockResolvedValue(null);
    insertClienteMock.mockResolvedValue(sampleCliente);

    await createCliente('designer-1', { nome: 'Cliente Teste', whatsapp: '5511999998888' });

    expect(findClienteDuplicadoPorWhatsappMock).toHaveBeenCalledWith(
      expect.anything(),
      'designer-1',
      '5511999998888',
      undefined,
    );
    expect(insertClienteMock).toHaveBeenCalled();
  });

  it('createCliente bloqueia WhatsApp (já normalizado) repetido no mesmo designer', async () => {
    findClienteDuplicadoPorWhatsappMock.mockResolvedValue(5);

    await expect(
      createCliente('designer-1', { nome: 'Outro Cliente', whatsapp: '5511988887777' }),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(insertClienteMock).not.toHaveBeenCalled();
  });

  it('createCliente bloqueia mesmo quando a máscara digitada é diferente (schema já normalizou antes de chegar aqui)', async () => {
    // O schema Zod normaliza "(64) 99999-9999" e "64999999999" para o
    // mesmo valor ("64999999999") antes do service ser chamado — aqui
    // simulamos o valor já normalizado chegando, que é o contrato real.
    findClienteDuplicadoPorWhatsappMock.mockResolvedValue(7);

    await expect(
      createCliente('designer-1', { nome: 'Outro Cliente', whatsapp: '64999999999' }),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(findClienteDuplicadoPorWhatsappMock).toHaveBeenCalledWith(
      expect.anything(),
      'designer-1',
      '64999999999',
      undefined,
    );
  });

  it('createCliente permite o mesmo WhatsApp quando pertence a outro designer (checagem é escopada por designer)', async () => {
    // A própria assinatura do repository já recebe idDesigner — este teste
    // confirma que o service nunca verifica duplicidade fora do designer
    // atual (a query real do repository filtra por id_designer).
    findClienteDuplicadoPorWhatsappMock.mockResolvedValue(null);
    insertClienteMock.mockResolvedValue(sampleCliente);

    await createCliente('designer-2', { nome: 'Cliente de outro designer', whatsapp: '5511988887777' });

    expect(findClienteDuplicadoPorWhatsappMock).toHaveBeenCalledWith(
      expect.anything(),
      'designer-2',
      '5511988887777',
      undefined,
    );
    expect(insertClienteMock).toHaveBeenCalled();
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

  it('updateCliente bloqueia edição para WhatsApp já usado por outro cliente do mesmo designer', async () => {
    getClienteByIdMock.mockResolvedValue(sampleCliente);
    findClienteDuplicadoPorWhatsappMock.mockResolvedValue(9);

    await expect(updateCliente({} as never, 1, { whatsapp: '5511977776666' })).rejects.toBeInstanceOf(
      ConflictError,
    );
    expect(findClienteDuplicadoPorWhatsappMock).toHaveBeenCalledWith(
      expect.anything(),
      'designer-1',
      '5511977776666',
      1,
    );
    expect(updateClienteMock).not.toHaveBeenCalled();
  });

  it('updateCliente permite edição mantendo o próprio WhatsApp (nem chama a checagem de duplicidade)', async () => {
    getClienteByIdMock.mockResolvedValue(sampleCliente);
    updateClienteMock.mockResolvedValue(undefined);

    await updateCliente({} as never, 1, { whatsapp: sampleCliente.whatsapp, nome: 'Nome Atualizado' });

    expect(findClienteDuplicadoPorWhatsappMock).not.toHaveBeenCalled();
    expect(updateClienteMock).toHaveBeenCalledWith(expect.anything(), 1, 'designer-1', {
      whatsapp: sampleCliente.whatsapp,
      nome: 'Nome Atualizado',
    });
  });

  it('updateCliente permite edição para um WhatsApp novo, não usado por nenhum outro cliente do designer', async () => {
    getClienteByIdMock.mockResolvedValue(sampleCliente);
    findClienteDuplicadoPorWhatsappMock.mockResolvedValue(null);
    updateClienteMock.mockResolvedValue(undefined);

    await updateCliente({} as never, 1, { whatsapp: '5511955554444' });

    expect(findClienteDuplicadoPorWhatsappMock).toHaveBeenCalledWith(
      expect.anything(),
      'designer-1',
      '5511955554444',
      1,
    );
    expect(updateClienteMock).toHaveBeenCalled();
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
