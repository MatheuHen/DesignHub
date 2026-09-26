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
  syncDesignerBloqueioMock,
  listPendenciasByDesignerMock,
  adminCancelarPendenciasDesignerRpcMock,
  deleteDesignerRowMock,
  updateDesignerPasswordRowMock,
  updateDesignerProfileMock,
  setDesignerStatusMock,
} = vi.hoisted(() => ({
  createUserMock: vi.fn(),
  deleteUserMock: vi.fn(),
  getSupabaseAdminClientMock: vi.fn(),
  insertDesignerProfileMock: vi.fn(),
  getDesignerByIdMock: vi.fn(),
  assertDesignerIsActiveMock: vi.fn(),
  getSolicitacaoCoreMock: vi.fn(),
  reassignSolicitacaoRpcMock: vi.fn(),
  syncDesignerBloqueioMock: vi.fn(),
  listPendenciasByDesignerMock: vi.fn(),
  adminCancelarPendenciasDesignerRpcMock: vi.fn(),
  deleteDesignerRowMock: vi.fn(),
  updateDesignerPasswordRowMock: vi.fn(),
  updateDesignerProfileMock: vi.fn(),
  setDesignerStatusMock: vi.fn(),
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
  updateDesignerProfile: updateDesignerProfileMock,
  setDesignerStatus: setDesignerStatusMock,
  deleteDesigner: deleteDesignerRowMock,
  updateDesignerPassword: updateDesignerPasswordRowMock,
}));

vi.mock('../repositories/solicitacao.repository.js', () => ({
  getSolicitacaoCore: getSolicitacaoCoreMock,
  reassignSolicitacaoRpc: reassignSolicitacaoRpcMock,
  syncDesignerBloqueio: syncDesignerBloqueioMock,
  listPendenciasByDesigner: listPendenciasByDesignerMock,
  adminCancelarPendenciasDesignerRpc: adminCancelarPendenciasDesignerRpcMock,
}));

const {
  createDesigner,
  reassignSolicitacao,
  removeDesigner,
  changeDesignerPassword,
  updateDesigner,
  changeDesignerStatus,
  listPendenciasDesigner,
} = await import('./designer.service.js');

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
    syncDesignerBloqueioMock.mockReset().mockResolvedValue(false);
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

  it('item 5/5.1 (rodada final): rejeita reatribuir para designer de destino bloqueado por atraso (RF006)', async () => {
    getSolicitacaoCoreMock.mockResolvedValue({
      idSolicitacao: 10,
      idDesigner: 'designer-atual',
      status: 'Em produção',
    });
    assertDesignerIsActiveMock.mockResolvedValue(undefined);
    syncDesignerBloqueioMock.mockResolvedValue(true);

    await expect(
      reassignSolicitacao('admin-1', 10, { novoDesignerId: 'designer-atrasado' }),
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

describe('updateDesigner (auditoria — corrige falta de checagem de existência/perfil)', () => {
  beforeEach(() => {
    getDesignerByIdMock.mockReset();
    updateDesignerProfileMock.mockReset();
  });

  it('lança NotFoundError quando o alvo não existe ou não é designer (nunca escreve)', async () => {
    getDesignerByIdMock.mockResolvedValue(null);

    await expect(
      updateDesigner('outro-admin-ou-inexistente', { nomeCompleto: 'Novo Nome' }),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(updateDesignerProfileMock).not.toHaveBeenCalled();
  });

  it('atualiza quando o designer existe', async () => {
    getDesignerByIdMock.mockResolvedValue({ id: 'designer-x', email: 'x@exemplo.com' });
    updateDesignerProfileMock.mockResolvedValue(undefined);

    await expect(updateDesigner('designer-x', { nomeCompleto: 'Novo Nome' })).resolves.toBeUndefined();
    expect(updateDesignerProfileMock).toHaveBeenCalledWith(expect.anything(), 'designer-x', {
      nomeCompleto: 'Novo Nome',
    });
  });
});

describe('changeDesignerStatus (item 4/rodada final — inativação com pendências)', () => {
  const pendenciaExemplo = {
    idSolicitacao: 42,
    clienteNome: 'Waynne',
    tema: 'Post de aniversário',
    status: 'Em produção' as const,
    atrasada: true,
  };

  beforeEach(() => {
    getDesignerByIdMock.mockReset().mockResolvedValue({ id: 'designer-x', email: 'x@exemplo.com' });
    setDesignerStatusMock.mockReset().mockResolvedValue(undefined);
    listPendenciasByDesignerMock.mockReset().mockResolvedValue([]);
    adminCancelarPendenciasDesignerRpcMock.mockReset().mockResolvedValue(1);
    getSolicitacaoCoreMock.mockReset();
    assertDesignerIsActiveMock.mockReset().mockResolvedValue(undefined);
    syncDesignerBloqueioMock.mockReset().mockResolvedValue(false);
    reassignSolicitacaoRpcMock.mockReset().mockResolvedValue(undefined);
  });

  it('lança NotFoundError quando o designer não existe (nunca escreve)', async () => {
    getDesignerByIdMock.mockResolvedValue(null);

    await expect(
      changeDesignerStatus('admin-1', 'inexistente', { status: 'inativo' }),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(setDesignerStatusMock).not.toHaveBeenCalled();
  });

  it('reativar nunca exige estratégia nem consulta pendências', async () => {
    await changeDesignerStatus('admin-1', 'designer-x', { status: 'ativo' });

    expect(setDesignerStatusMock).toHaveBeenCalledWith(expect.anything(), 'designer-x', 'ativo');
    expect(listPendenciasByDesignerMock).not.toHaveBeenCalled();
  });

  it('inativa direto quando não há pendências e nenhuma estratégia foi informada', async () => {
    listPendenciasByDesignerMock.mockResolvedValue([]);

    const result = await changeDesignerStatus('admin-1', 'designer-x', { status: 'inativo' });

    expect(result.pendencias).toBeUndefined();
    expect(setDesignerStatusMock).toHaveBeenCalledWith(expect.anything(), 'designer-x', 'inativo');
  });

  it('rejeita a inativação direta e devolve as pendências quando existem e nenhuma estratégia foi escolhida', async () => {
    listPendenciasByDesignerMock.mockResolvedValue([pendenciaExemplo]);

    const result = await changeDesignerStatus('admin-1', 'designer-x', { status: 'inativo' });

    expect(result.pendencias).toEqual([pendenciaExemplo]);
    expect(setDesignerStatusMock).not.toHaveBeenCalled();
  });

  it('estratégia "inativar_mesmo_assim": inativa sem tocar nas pendências', async () => {
    listPendenciasByDesignerMock.mockResolvedValue([pendenciaExemplo]);

    await changeDesignerStatus('admin-1', 'designer-x', {
      status: 'inativo',
      estrategia: 'inativar_mesmo_assim',
    });

    expect(setDesignerStatusMock).toHaveBeenCalledWith(expect.anything(), 'designer-x', 'inativo');
    expect(adminCancelarPendenciasDesignerRpcMock).not.toHaveBeenCalled();
    expect(reassignSolicitacaoRpcMock).not.toHaveBeenCalled();
  });

  it('estratégia "cancelar_pendentes": delega para a RPC atômica (cancela + inativa) e não chama setDesignerStatus separadamente', async () => {
    await changeDesignerStatus('admin-1', 'designer-x', {
      status: 'inativo',
      estrategia: 'cancelar_pendentes',
    });

    expect(adminCancelarPendenciasDesignerRpcMock).toHaveBeenCalledWith(expect.anything(), {
      idDesigner: 'designer-x',
      atorId: 'admin-1',
    });
    expect(setDesignerStatusMock).not.toHaveBeenCalled();
  });

  it('estratégia "reatribuir_pendentes": rejeita quando falta destino para alguma pendência', async () => {
    listPendenciasByDesignerMock.mockResolvedValue([pendenciaExemplo, { ...pendenciaExemplo, idSolicitacao: 43 }]);

    await expect(
      changeDesignerStatus('admin-1', 'designer-x', {
        status: 'inativo',
        estrategia: 'reatribuir_pendentes',
        reatribuicoes: [{ idSolicitacao: 42, novoDesignerId: 'designer-novo' }],
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(setDesignerStatusMock).not.toHaveBeenCalled();
  });

  it('estratégia "reatribuir_pendentes": rejeita solicitação informada que não é pendência deste designer', async () => {
    listPendenciasByDesignerMock.mockResolvedValue([pendenciaExemplo]);

    await expect(
      changeDesignerStatus('admin-1', 'designer-x', {
        status: 'inativo',
        estrategia: 'reatribuir_pendentes',
        reatribuicoes: [{ idSolicitacao: 999, novoDesignerId: 'designer-novo' }],
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('estratégia "reatribuir_pendentes": reatribui cada pendência (reaproveitando reassignSolicitacao) e só então inativa', async () => {
    listPendenciasByDesignerMock.mockResolvedValue([pendenciaExemplo]);
    getSolicitacaoCoreMock.mockResolvedValue({ idSolicitacao: 42, idDesigner: 'designer-x', status: 'Em produção' });

    await changeDesignerStatus('admin-1', 'designer-x', {
      status: 'inativo',
      estrategia: 'reatribuir_pendentes',
      reatribuicoes: [{ idSolicitacao: 42, novoDesignerId: 'designer-novo' }],
    });

    expect(reassignSolicitacaoRpcMock).toHaveBeenCalledWith(expect.anything(), {
      idSolicitacao: 42,
      novoDesignerId: 'designer-novo',
      atorId: 'admin-1',
    });
    expect(setDesignerStatusMock).toHaveBeenCalledWith(expect.anything(), 'designer-x', 'inativo');
  });

  it('estratégia "reatribuir_pendentes": não inativa se a reatribuição falhar (destino bloqueado)', async () => {
    listPendenciasByDesignerMock.mockResolvedValue([pendenciaExemplo]);
    getSolicitacaoCoreMock.mockResolvedValue({ idSolicitacao: 42, idDesigner: 'designer-x', status: 'Em produção' });
    syncDesignerBloqueioMock.mockResolvedValue(true);

    await expect(
      changeDesignerStatus('admin-1', 'designer-x', {
        status: 'inativo',
        estrategia: 'reatribuir_pendentes',
        reatribuicoes: [{ idSolicitacao: 42, novoDesignerId: 'designer-atrasado' }],
      }),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(setDesignerStatusMock).not.toHaveBeenCalled();
  });
});

describe('listPendenciasDesigner (item 4/rodada final)', () => {
  beforeEach(() => {
    getDesignerByIdMock.mockReset();
    listPendenciasByDesignerMock.mockReset();
  });

  it('lança NotFoundError quando o designer não existe', async () => {
    getDesignerByIdMock.mockResolvedValue(null);
    await expect(listPendenciasDesigner('inexistente')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('devolve as pendências do designer', async () => {
    getDesignerByIdMock.mockResolvedValue({ id: 'designer-x' });
    listPendenciasByDesignerMock.mockResolvedValue([
      { idSolicitacao: 1, clienteNome: 'Waynne', tema: 'Post', status: 'Em produção', atrasada: true },
    ]);

    const result = await listPendenciasDesigner('designer-x');
    expect(result).toHaveLength(1);
  });
});
