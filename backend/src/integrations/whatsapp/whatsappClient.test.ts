import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BlockedExternalCredentialError, ValidationError } from '../../lib/errors.js';

const { envMock, whatsappConfigStatusMock } = vi.hoisted(() => ({
  envMock: {
    WHATSAPP_ACCESS_TOKEN: 'token-teste',
    WHATSAPP_PHONE_NUMBER_ID: 'phone-teste',
    WHATSAPP_TEMPLATE_NAME: 'inicio_atendimento',
    WHATSAPP_TEMPLATE_LANGUAGE: 'pt_BR',
  },
  whatsappConfigStatusMock: {
    hasSendingClient: true,
    hasWebhookSecurity: true,
    hasTemplateConfigured: true,
  },
}));

vi.mock('../../config/env.js', () => ({
  env: envMock,
  whatsappConfigStatus: whatsappConfigStatusMock,
}));

const {
  sendTextMessage,
  sendTemplateMessage,
  downloadMediaFromWhatsApp,
} = await import('./whatsappClient.js');

describe('whatsappClient (RF004/seção 2.1, items 14/20)', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    whatsappConfigStatusMock.hasSendingClient = true;
    whatsappConfigStatusMock.hasTemplateConfigured = true;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('sendTextMessage', () => {
    it('lança BlockedExternalCredentialError quando faltam credenciais de envio', async () => {
      whatsappConfigStatusMock.hasSendingClient = false;

      await expect(sendTextMessage('5511999999999', 'olá')).rejects.toBeInstanceOf(
        BlockedExternalCredentialError,
      );
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('envia type:text e retorna o wamid', async () => {
      fetchMock.mockResolvedValue(
        new Response(JSON.stringify({ messages: [{ id: 'wamid.123' }] }), { status: 200 }),
      );

      const result = await sendTextMessage('5511999999999', 'olá');

      expect(result).toEqual({ wamid: 'wamid.123' });
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toContain('/phone-teste/messages');
      const body = JSON.parse(init.body as string) as { type: string };
      expect(body.type).toBe('text');
    });
  });

  describe('sendTemplateMessage (item 20)', () => {
    it('lança BlockedExternalCredentialError quando nenhum template está configurado', async () => {
      whatsappConfigStatusMock.hasTemplateConfigured = false;

      await expect(sendTemplateMessage('5511999999999', ['pergunta'])).rejects.toBeInstanceOf(
        BlockedExternalCredentialError,
      );
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('envia type:template com o nome/idioma configurados e os parâmetros do corpo', async () => {
      fetchMock.mockResolvedValue(
        new Response(JSON.stringify({ messages: [{ id: 'wamid.456' }] }), { status: 200 }),
      );

      const result = await sendTemplateMessage('5511999999999', ['Podemos começar?']);

      expect(result).toEqual({ wamid: 'wamid.456' });
      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(init.body as string) as {
        type: string;
        template: { name: string; language: { code: string }; components?: unknown };
      };
      expect(body.type).toBe('template');
      expect(body.template.name).toBe('inicio_atendimento');
      expect(body.template.language.code).toBe('pt_BR');
      expect(body.template.components).toEqual([
        { type: 'body', parameters: [{ type: 'text', text: 'Podemos começar?' }] },
      ]);
    });
  });

  describe('downloadMediaFromWhatsApp (item 14)', () => {
    it('lança BlockedExternalCredentialError quando faltam credenciais de envio', async () => {
      whatsappConfigStatusMock.hasSendingClient = false;

      await expect(downloadMediaFromWhatsApp('media-1')).rejects.toBeInstanceOf(
        BlockedExternalCredentialError,
      );
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('resolve o media_id em URL e baixa o binário (fluxo oficial de 2 etapas)', async () => {
      fetchMock
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({ url: 'https://lookaside.fbsbx.com/media/x', file_size: 1024 }),
            { status: 200 },
          ),
        )
        .mockResolvedValueOnce(new Response(new Uint8Array([1, 2, 3]), { status: 200 }));

      const buffer = await downloadMediaFromWhatsApp('media-1');

      expect(buffer).toEqual(Buffer.from([1, 2, 3]));
      expect(fetchMock).toHaveBeenCalledTimes(2);
      const [firstUrl] = fetchMock.mock.calls[0] as [string];
      expect(firstUrl).toContain('/media-1');
      const [secondUrl] = fetchMock.mock.calls[1] as [string];
      expect(secondUrl).toBe('https://lookaside.fbsbx.com/media/x');
    });

    it('rejeita a URL de download quando o host não é um domínio Meta conhecido (seção 12.3, SSRF)', async () => {
      fetchMock.mockResolvedValueOnce(
        new Response(JSON.stringify({ url: 'https://attacker.example/x', file_size: 10 }), { status: 200 }),
      );

      await expect(downloadMediaFromWhatsApp('media-1')).rejects.toThrow(/domínios Meta esperados/);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('rejeita antes de baixar quando file_size excede o limite (seção 12.2)', async () => {
      fetchMock.mockResolvedValueOnce(
        new Response(JSON.stringify({ url: 'https://lookaside.fbsbx.com/media/x', file_size: 99_999_999 }), {
          status: 200,
        }),
      );

      await expect(downloadMediaFromWhatsApp('media-1')).rejects.toBeInstanceOf(ValidationError);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });
});
