import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConflictError, NotFoundError, ValidationError } from '../lib/errors.js';

const {
  createUserMock,
  deleteUserMock,
  getSupabaseAdminClientMock,
  insertDesignerProfileMock,
  getDesignerByIdMock,
  assertDesignerIsActiveMock,
  getSolicitacaoCoreMock,
  reassignSolicitacaoRpcMock,
  deleteDesignerRowMock,
  updateDesignerPasswordRowMock,
} = vi.hoisted(() => ({
  createUserMock: vi.fn(),
  deleteUserMock: vi.fn(),
  getSupabaseAdminClientMock: vi.fn(),
  insertDesignerProfileMock: vi.fn(),
  getDesignerByIdMock: vi.fn(),
  assertDesignerIsActiveMock: vi.fn(),
  getSolicitacaoCoreMock: vi.fn(),
  reassignSolicitacaoRpcMock: vi.fn(),
  deleteDesignerRowMock: vi.fn(),
  updateDesignerPasswordRowMock: vi.fn(),
}));

getSupabaseAdminClientMock.mockImplementation(() => ({
  auth: { admin: { createUser: createUserMock, deleteUser: deleteUserMock } },
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
  deleteDesigner: deleteDesignerRowMock,
  updateDesignerPassword: updateDesignerPasswordRowMock,
}));

vi.mock('../repositories/solicitacao.repository.js', () => ({
  getSolicitacaoCore: getSolicitacaoCoreMock,
  reassignSolicitacaoRpc: reassignSolicitacaoRpcMock,
}));

const { createDesigner, reassignSolicitacao, removeDesigner, changeDesignerPassword } = await import(
  './designer.service.js'
);

describe('createDesigner (RF001/FIGURA 28)', () => {
  beforeEach(() => {
    createUserMock.mockReset();
    deleteUserMock.mockReset().mockResolvedValue({ error: null });
    insertDesignerProfileMock.mockReset();
  });

  it('lança ConflictError quando a criação no Supabase Auth falha', async () => {
    createUserMock.mockResolvedValue({ data: null, error: { message: 'e-mail já existe' } });

    await expect(
      createDesigner({
        nomeCompleto: 'Dora Designer',
        email: 'dora@exemplo.com',
        whatsapp: '5511999999999',
        senha: 'senha-forte-123',
      }),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(insertDesignerProfileMock).not.toHaveBeenCalled();
  });

  it('cria a identidade Auth com a senha definida pelo admin e o perfil vinculado', async () => {
    createUserMock.mockResolvedValue({ data: { user: { id: 'auth-user-1' } }, error: null });
    insertDesignerProfileMock.mockResolvedValue(undefined);

    const result = await createDesigner({
      nomeCompleto: 'Dora Designer',
      email: 'dora@exemplo.com',
      whatsapp: '5511999999999',
      senha: 'senha-forte-123',
    });

    expect(createUserMock).toHaveBeenCalledWith({
      email: 'dora@exemplo.com',
      password: 'senha-forte-123',
      email_confirm: true,
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

  it('compensa (exclui o usuário Auth recém-criado) quando a criação do perfil falha (RNF009)', async () => {
    createUserMock.mockResolvedValue({ data: { user: { id: 'auth-user-2' } }, error: null });
    insertDesignerProfileMock.mockRejectedValue(new Error('Falha ao criar perfil de designer: boom'));

    await expect(
      createDesigner({
        nomeCompleto: 'Dora Designer',
        email: 'dora@exemplo.com',
        whatsapp: '5511999999999',
        senha: 'senha-forte-123',
      }),
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

describe('removeDesigner (RF001/item 2.4 — exclusão ADITIVA ao Ativo/Inativo)', () => {
  beforeEach(() => {
    getDesignerByIdMock.mockReset();
    deleteDesignerRowMock.mockReset();
  });

  it('lança NotFoundError quando o designer não existe', async () => {
    getDesignerByIdMock.mockResolvedValue(null);

    await expect(removeDesigner('admin-1', 'designer-x')).rejects.toBeInstanceOf(NotFoundError);
    expect(deleteDesignerRowMock).not.toHaveBeenCalled();
  });

  it('propaga ConflictError do repository quando há impedimento histórico', async () => {
    getDesignerByIdMock.mockResolvedValue({ id: 'designer-x', email: 'x@exemplo.com' });
    deleteDesignerRowMock.mockRejectedValue(
      new ConflictError('Não é possível excluir: designer possui clientes ou solicitações vinculados. Reatribua-os antes de excluir.'),
    );

    await expect(removeDesigner('admin-1', 'designer-x')).rejects.toBeInstanceOf(ConflictError);
  });

  it('exclui quando não há impedimento histórico', async () => {
    getDesignerByIdMock.mockResolvedValue({ id: 'designer-x', email: 'x@exemplo.com' });
    deleteDesignerRowMock.mockResolvedValue(undefined);

    await expect(removeDesigner('admin-1', 'designer-x')).resolves.toBeUndefined();
    expect(deleteDesignerRowMock).toHaveBeenCalledWith(expect.anything(), 'designer-x');
  });
});

describe('changeDesignerPassword (RF001/item 2.1 — admin altera senha do designer)', () => {
  beforeEach(() => {
    getDesignerByIdMock.mockReset();
    updateDesignerPasswordRowMock.mockReset();
  });

  it('lança NotFoundError quando o designer não existe', async () => {
    getDesignerByIdMock.mockResolvedValue(null);

    await expect(changeDesignerPassword('admin-1', 'designer-x', 'senha1234')).rejects.toBeInstanceOf(
      NotFoundError,
    );
    expect(updateDesignerPasswordRowMock).not.toHaveBeenCalled();
  });

  it('atualiza a senha via Supabase Auth quando o designer existe', async () => {
    getDesignerByIdMock.mockResolvedValue({ id: 'designer-x', email: 'x@exemplo.com' });
    updateDesignerPasswordRowMock.mockResolvedValue(undefined);

    await expect(changeDesignerPassword('admin-1', 'designer-x', 'senha1234')).resolves.toBeUndefined();
    expect(updateDesignerPasswordRowMock).toHaveBeenCalledWith(expect.anything(), 'designer-x', 'senha1234');
  });
});
