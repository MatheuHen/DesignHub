import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConflictError, NotFoundError, ValidationError } from '../lib/errors.js';

const {
  inviteUserByEmailMock,
  deleteUserMock,
  getSupabaseAdminClientMock,
  insertDesignerProfileMock,
  getDesignerByIdMock,
  assertDesignerIsActiveMock,
  getSolicitacaoCoreMock,
  reassignSolicitacaoRpcMock,
} = vi.hoisted(() => ({
  inviteUserByEmailMock: vi.fn(),
  deleteUserMock: vi.fn(),
  getSupabaseAdminClientMock: vi.fn(),
  insertDesignerProfileMock: vi.fn(),
  getDesignerByIdMock: vi.fn(),
  assertDesignerIsActiveMock: vi.fn(),
  getSolicitacaoCoreMock: vi.fn(),
  reassignSolicitacaoRpcMock: vi.fn(),
}));

getSupabaseAdminClientMock.mockImplementation(() => ({
  auth: { admin: { inviteUserByEmail: inviteUserByEmailMock, deleteUser: deleteUserMock } },
}));

vi.mock('../config/supabase.js', () => ({
  getSupabaseAdminClient: getSupabaseAdminClientMock,
}));

vi.mock('../repositories/designer.repository.js', () => ({
  insertDesignerProfile: insertDesignerProfileMock,
  getDesignerById: getDesignerByIdMock,
  assertDesignerIsActive: assertDesignerIsActiveMock,
  listDesigners: vi.fn(),
  updateDesignerProfile: vi.fn(),
  setDesignerStatus: vi.fn(),
  deleteDesigner: vi.fn(),
}));

vi.mock('../repositories/solicitacao.repository.js', () => ({
  getSolicitacaoCore: getSolicitacaoCoreMock,
  reassignSolicitacaoRpc: reassignSolicitacaoRpcMock,
}));

const { createDesigner, reassignSolicitacao } = await import('./designer.service.js');

describe('createDesigner (RF001)', () => {
  beforeEach(() => {
    inviteUserByEmailMock.mockReset();
    deleteUserMock.mockReset().mockResolvedValue({ error: null });
    insertDesignerProfileMock.mockReset();
  });

  it('lança ConflictError quando o convite Supabase Auth falha', async () => {
    inviteUserByEmailMock.mockResolvedValue({ data: null, error: { message: 'e-mail já existe' } });

    await expect(
      createDesigner({ nomeCompleto: 'Dora Designer', email: 'dora@exemplo.com', whatsapp: '5511999999999' }),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(insertDesignerProfileMock).not.toHaveBeenCalled();
  });

  it('cria o perfil vinculado após convite bem-sucedido', async () => {
    inviteUserByEmailMock.mockResolvedValue({ data: { user: { id: 'auth-user-1' } }, error: null });
    insertDesignerProfileMock.mockResolvedValue(undefined);

    const result = await createDesigner({
      nomeCompleto: 'Dora Designer',
      email: 'dora@exemplo.com',
      whatsapp: '5511999999999',
    });

    expect(insertDesignerProfileMock).toHaveBeenCalledWith(expect.anything(), {
      id: 'auth-user-1',
      nomeCompleto: 'Dora Designer',
      email: 'dora@exemplo.com',
      whatsapp: '5511999999999',
    });
    expect(result).toMatchObject({ id: 'auth-user-1', status: 'ativo', bloqueado: false });
    expect(deleteUserMock).not.toHaveBeenCalled();
  });

  it('compensa (exclui o usuário Auth convidado) quando a criação do perfil falha (RNF009)', async () => {
    inviteUserByEmailMock.mockResolvedValue({ data: { user: { id: 'auth-user-2' } }, error: null });
    insertDesignerProfileMock.mockRejectedValue(new Error('Falha ao criar perfil de designer: boom'));

    await expect(
      createDesigner({ nomeCompleto: 'Dora Designer', email: 'dora@exemplo.com', whatsapp: '5511999999999' }),
    ).rejects.toThrow('boom');

    expect(deleteUserMock).toHaveBeenCalledWith('auth-user-2');
  });
});

describe('reassignSolicitacao (RF016)', () => {
  beforeEach(() => {
    getSolicitacaoCoreMock.mockReset();
    assertDesignerIsActiveMock.mockReset();
    getDesignerByIdMock.mockReset();
    reassignSolicitacaoRpcMock.mockReset();
  });

  it('rejeita quando a solicitação já pertence ao designer de destino', async () => {
    getSolicitacaoCoreMock.mockResolvedValue({
      idSolicitacao: 10,
      idDesigner: 'designer-atual',
      status: 'Em produção',
    });

    await expect(
      reassignSolicitacao('admin-1', 10, { novoDesignerId: 'designer-atual' }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(assertDesignerIsActiveMock).not.toHaveBeenCalled();
  });

  it('propaga NotFoundError quando a solicitação não existe', async () => {
    getSolicitacaoCoreMock.mockRejectedValue(new NotFoundError('Solicitação não encontrada.'));

    await expect(
      reassignSolicitacao('admin-1', 999, { novoDesignerId: 'designer-novo' }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('rejeita quando o designer de destino não está ativo (RN44/RN45)', async () => {
    getSolicitacaoCoreMock.mockResolvedValue({
      idSolicitacao: 10,
      idDesigner: 'designer-atual',
      status: 'Em produção',
    });
    assertDesignerIsActiveMock.mockRejectedValue(new ConflictError('Designer de destino precisa estar ativo.'));

    await expect(
      reassignSolicitacao('admin-1', 10, { novoDesignerId: 'designer-inativo' }),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(reassignSolicitacaoRpcMock).not.toHaveBeenCalled();
  });

  it('reatribui delegando a auditoria (nomes) para a função SQL sob lock', async () => {
    getSolicitacaoCoreMock.mockResolvedValue({
      idSolicitacao: 10,
      idDesigner: 'designer-atual',
      status: 'Em produção',
    });
    assertDesignerIsActiveMock.mockResolvedValue(undefined);
    reassignSolicitacaoRpcMock.mockResolvedValue(undefined);

    await reassignSolicitacao('admin-1', 10, { novoDesignerId: 'designer-novo' });

    expect(reassignSolicitacaoRpcMock).toHaveBeenCalledWith(expect.anything(), {
      idSolicitacao: 10,
      novoDesignerId: 'designer-novo',
      atorId: 'admin-1',
    });
  });
});
