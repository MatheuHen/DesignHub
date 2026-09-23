import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BlockedExternalCredentialError, ConflictError, NotFoundError } from '../lib/errors.js';

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
  sendTextMessageMock,
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
  sendTextMessageMock: vi.fn(),
}));

vi.mock('../config/supabase.js', () => ({ getSupabaseAdminClient: getSupabaseAdminClientMock }));
vi.mock('../config/env.js', () => ({ env: { INSTAGRAM_TOKEN_ENC_KEY: 'chave-de-teste-com-32-caracteres' } }));
vi.mock('../repositories/cliente.repository.js', () => ({ getClienteById: getClienteByIdMock }));
vi.mock('../integrations/instagram/instagramOAuth.js', () => ({
  buildAuthorizeUrl: buildAuthorizeUrlMock,
  exchangeCodeForLongLivedToken: exchangeCodeForLongLivedTokenMock,
}));
vi.mock('../integrations/whatsapp/whatsappClient.js', () => ({ sendTextMessage: sendTextMessageMock }));
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
  enviarLinkConexaoInstagram,
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

describe('enviarLinkConexaoInstagram (item 4 — rodada correções Instagram)', () => {
  beforeEach(() => {
    getClienteByIdMock.mockReset();
    createOAuthStateMock.mockReset().mockResolvedValue(undefined);
    buildAuthorizeUrlMock.mockReset().mockReturnValue('https://www.instagram.com/oauth/authorize?state=abc');
    sendTextMessageMock.mockReset();
  });

  it('rejeita quando o cliente não pertence ao designer', async () => {
    getClienteByIdMock.mockResolvedValue(null);

    await expect(enviarLinkConexaoInstagram({} as never, 1, 'designer-1')).rejects.toBeInstanceOf(NotFoundError);
    expect(createOAuthStateMock).not.toHaveBeenCalled();
    expect(sendTextMessageMock).not.toHaveBeenCalled();
  });

  it('gera o link e envia por WhatsApp com sucesso', async () => {
    getClienteByIdMock.mockResolvedValue({ id: 1, idDesigner: 'designer-1', whatsapp: '5511988887777' });
    sendTextMessageMock.mockResolvedValue({ wamid: 'wamid-1' });

    const result = await enviarLinkConexaoInstagram({} as never, 1, 'designer-1');

    expect(result).toEqual({ url: 'https://www.instagram.com/oauth/authorize?state=abc', whatsappNotified: true });
    expect(sendTextMessageMock).toHaveBeenCalledWith(
      '5511988887777',
      expect.stringContaining('https://www.instagram.com/oauth/authorize?state=abc'),
    );
    // Reforça a garantia da seção 5/10: a mensagem tranquiliza o cliente, nunca pede a senha dele.
    expect(sendTextMessageMock).toHaveBeenCalledWith(
      '5511988887777',
      expect.stringContaining('não solicita sua senha'),
    );
  });

  it('nunca mascara falha de envio via WhatsApp — devolve o link mesmo assim', async () => {
    getClienteByIdMock.mockResolvedValue({ id: 1, idDesigner: 'designer-1', whatsapp: '5511988887777' });
    sendTextMessageMock.mockRejectedValue(new Error('Falha ao enviar mensagem'));

    const result = await enviarLinkConexaoInstagram({} as never, 1, 'designer-1');

    expect(result.whatsappNotified).toBe(false);
    expect(result.url).toBe('https://www.instagram.com/oauth/authorize?state=abc');
    expect(result.whatsappError).toContain('Falha ao enviar mensagem');
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
      expect.objectContaining({
        idCliente: 7,
        instagramUserId: 'conta-7',
        accessToken: 'token-longo',
        encKey: 'chave-de-teste-com-32-caracteres',
      }),
    );
  });

  it('item N.5.5: rejeita (fail-closed) sem gravar nada quando INSTAGRAM_TOKEN_ENC_KEY está ausente', async () => {
    const { env } = await import('../config/env.js');
    const originalKey = (env as { INSTAGRAM_TOKEN_ENC_KEY: string | undefined }).INSTAGRAM_TOKEN_ENC_KEY;
    (env as { INSTAGRAM_TOKEN_ENC_KEY: string | undefined }).INSTAGRAM_TOKEN_ENC_KEY = undefined;
    try {
      await expect(processarCallbackInstagram('state-valido', 'code-1')).rejects.toBeInstanceOf(
        BlockedExternalCredentialError,
      );
      expect(consumeOAuthStateMock).not.toHaveBeenCalled();
      expect(upsertConexaoMock).not.toHaveBeenCalled();
    } finally {
      (env as { INSTAGRAM_TOKEN_ENC_KEY: string | undefined }).INSTAGRAM_TOKEN_ENC_KEY = originalKey;
    }
  });
});
