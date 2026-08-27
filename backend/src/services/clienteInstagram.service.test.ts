import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConflictError, NotFoundError } from '../lib/errors.js';

const {
  getSupabaseAdminClientMock,
  getClienteByIdMock,
  buildAuthorizeUrlMock,
  exchangeCodeForLongLivedTokenMock,
  createOAuthStateMock,
  consumeOAuthStateMock,
  getStatusConexaoMock,
  deleteConexaoMock,
  upsertConexaoMock,
} = vi.hoisted(() => ({
  getSupabaseAdminClientMock: vi.fn(() => ({ __kind: 'admin-client' })),
  getClienteByIdMock: vi.fn(),
  buildAuthorizeUrlMock: vi.fn(),
  exchangeCodeForLongLivedTokenMock: vi.fn(),
  createOAuthStateMock: vi.fn(),
  consumeOAuthStateMock: vi.fn(),
  getStatusConexaoMock: vi.fn(),
  deleteConexaoMock: vi.fn(),
  upsertConexaoMock: vi.fn(),
}));

vi.mock('../config/supabase.js', () => ({ getSupabaseAdminClient: getSupabaseAdminClientMock }));
vi.mock('../repositories/cliente.repository.js', () => ({ getClienteById: getClienteByIdMock }));
vi.mock('../integrations/instagram/instagramOAuth.js', () => ({
  buildAuthorizeUrl: buildAuthorizeUrlMock,
  exchangeCodeForLongLivedToken: exchangeCodeForLongLivedTokenMock,
}));
vi.mock('../repositories/clienteInstagram.repository.js', () => ({
  createOAuthState: createOAuthStateMock,
  consumeOAuthState: consumeOAuthStateMock,
  getStatusConexao: getStatusConexaoMock,
  deleteConexao: deleteConexaoMock,
  upsertConexao: upsertConexaoMock,
}));

const {
  gerarAutorizacaoInstagramUrl,
  getInstagramStatus,
  removerInstagramConexao,
  processarCallbackInstagram,
} = await import('./clienteInstagram.service.js');

describe('gerarAutorizacaoInstagramUrl (RF014/ADR 0005)', () => {
  beforeEach(() => {
    getClienteByIdMock.mockReset();
    createOAuthStateMock.mockReset().mockResolvedValue(undefined);
    buildAuthorizeUrlMock.mockReset().mockReturnValue('https://www.instagram.com/oauth/authorize?state=abc');
  });

  it('rejeita quando o cliente não pertence ao designer (ownership via RLS)', async () => {
    getClienteByIdMock.mockResolvedValue(null);

    await expect(
      gerarAutorizacaoInstagramUrl({} as never, 1, 'designer-1'),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(createOAuthStateMock).not.toHaveBeenCalled();
  });

  it('gera o state e devolve a URL de autorização quando o cliente pertence ao designer', async () => {
    getClienteByIdMock.mockResolvedValue({ id: 1, idDesigner: 'designer-1' });

    const result = await gerarAutorizacaoInstagramUrl({} as never, 1, 'designer-1');

    expect(result).toEqual({ url: 'https://www.instagram.com/oauth/authorize?state=abc' });
    expect(createOAuthStateMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ idCliente: 1, idDesigner: 'designer-1' }),
    );
  });
});

describe('getInstagramStatus/removerInstagramConexao (ownership)', () => {
  beforeEach(() => {
    getClienteByIdMock.mockReset();
    getStatusConexaoMock.mockReset();
    deleteConexaoMock.mockReset().mockResolvedValue(undefined);
  });

  it('getInstagramStatus rejeita cliente de outro designer', async () => {
    getClienteByIdMock.mockResolvedValue(null);
    await expect(getInstagramStatus({} as never, 1)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('getInstagramStatus retorna o status quando o cliente pertence ao designer', async () => {
    getClienteByIdMock.mockResolvedValue({ id: 1, idDesigner: 'designer-1' });
    getStatusConexaoMock.mockResolvedValue({ conectado: true, conectadoEm: '2026-08-20', expiraEm: '2026-10-19' });

    await expect(getInstagramStatus({} as never, 1)).resolves.toEqual({
      conectado: true,
      conectadoEm: '2026-08-20',
      expiraEm: '2026-10-19',
    });
  });

  it('removerInstagramConexao rejeita cliente de outro designer', async () => {
    getClienteByIdMock.mockResolvedValue(null);
    await expect(removerInstagramConexao({} as never, 1)).rejects.toBeInstanceOf(NotFoundError);
    expect(deleteConexaoMock).not.toHaveBeenCalled();
  });

  it('removerInstagramConexao remove quando o cliente pertence ao designer', async () => {
    getClienteByIdMock.mockResolvedValue({ id: 1, idDesigner: 'designer-1' });
    await removerInstagramConexao({} as never, 1);
    expect(deleteConexaoMock).toHaveBeenCalledWith(expect.anything(), 1);
  });
});

describe('processarCallbackInstagram (RF014/ADR 0005 — callback público)', () => {
  beforeEach(() => {
    consumeOAuthStateMock.mockReset();
    exchangeCodeForLongLivedTokenMock.mockReset();
    upsertConexaoMock.mockReset().mockResolvedValue(undefined);
  });

  it('rejeita quando o state é inválido/expirado/já usado', async () => {
    consumeOAuthStateMock.mockResolvedValue(null);

    await expect(processarCallbackInstagram('state-invalido', 'code-1')).rejects.toBeInstanceOf(ConflictError);
    expect(exchangeCodeForLongLivedTokenMock).not.toHaveBeenCalled();
  });

  it('troca o code e grava a conexão vinculada ao id_cliente do state validado', async () => {
    consumeOAuthStateMock.mockResolvedValue({ id_cliente: 7, id_designer: 'designer-1' });
    exchangeCodeForLongLivedTokenMock.mockResolvedValue({
      accessToken: 'token-longo',
      instagramUserId: 'conta-7',
      expiresInSeconds: 5_184_000,
    });

    const result = await processarCallbackInstagram('state-valido', 'code-1');

    expect(result).toEqual({ idCliente: 7 });
    expect(upsertConexaoMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ idCliente: 7, instagramUserId: 'conta-7', accessToken: 'token-longo' }),
    );
  });
});
