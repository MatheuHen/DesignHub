import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BlockedExternalCredentialError } from '../../lib/errors.js';

const { envMock, instagramConfigStatusMock } = vi.hoisted(() => ({
  envMock: {
    INSTAGRAM_ACCESS_TOKEN: 'token-teste',
    INSTAGRAM_ACCOUNT_ID: '27882228474720270',
  },
  instagramConfigStatusMock: {
    hasPublishingClient: true,
  },
}));

vi.mock('../../config/env.js', () => ({
  env: envMock,
  instagramConfigStatus: instagramConfigStatusMock,
}));

const { publishImage } = await import('./instagramClient.js');

describe('instagramClient (RF014 — Instagram API with Instagram Login)', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    instagramConfigStatusMock.hasPublishingClient = true;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('lança BlockedExternalCredentialError quando faltam credenciais', async () => {
    instagramConfigStatusMock.hasPublishingClient = false;

    await expect(publishImage('https://example.com/img.png', 'legenda')).rejects.toBeInstanceOf(
      BlockedExternalCredentialError,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('chama graph.instagram.com (não graph.facebook.com), espera o container ficar FINISHED e publica', async () => {
    vi.useFakeTimers();
    try {
      fetchMock
        .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'container-1' }), { status: 200 }))
        .mockResolvedValueOnce(new Response(JSON.stringify({ status_code: 'FINISHED' }), { status: 200 }))
        .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'media-1' }), { status: 200 }));

      const resultPromise = publishImage('https://example.com/img.png', 'legenda de teste');
      await vi.advanceTimersByTimeAsync(1_500);
      const result = await resultPromise;

      expect(result).toEqual({ mediaId: 'media-1' });
      expect(fetchMock).toHaveBeenCalledTimes(3);

      const [containerUrl, containerInit] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(containerUrl).toBe('https://graph.instagram.com/v21.0/27882228474720270/media');
      expect(containerUrl).not.toContain('graph.facebook.com');
      const containerBody = JSON.parse(containerInit.body as string) as { image_url: string; caption: string };
      expect(containerBody).toEqual({ image_url: 'https://example.com/img.png', caption: 'legenda de teste' });

      const [statusUrl] = fetchMock.mock.calls[1] as [string, RequestInit];
      expect(statusUrl).toBe('https://graph.instagram.com/v21.0/container-1?fields=status_code');

      const [publishUrl, publishInit] = fetchMock.mock.calls[2] as [string, RequestInit];
      expect(publishUrl).toBe('https://graph.instagram.com/v21.0/27882228474720270/media_publish');
      const publishBody = JSON.parse(publishInit.body as string) as { creation_id: string };
      expect(publishBody).toEqual({ creation_id: 'container-1' });
    } finally {
      vi.useRealTimers();
    }
  });

  it('não publica e falha quando o container nunca fica pronto (Gate G — API oficial, "Media ID is not available")', async () => {
    vi.useFakeTimers();
    try {
      fetchMock
        .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'container-1' }), { status: 200 }))
        .mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ status_code: 'IN_PROGRESS' }), { status: 200 })));

      const resultPromise = publishImage('https://example.com/img.png', 'legenda de teste');
      const assertion = expect(resultPromise).rejects.toThrow('não ficou pronto a tempo');
      await vi.advanceTimersByTimeAsync(10_000);
      await assertion;

      // 1 criação + 5 tentativas de status — nunca chama media_publish.
      expect(fetchMock).toHaveBeenCalledTimes(6);
    } finally {
      vi.useRealTimers();
    }
  });

  it('não publica e falha quando o container reporta ERROR', async () => {
    vi.useFakeTimers();
    try {
      fetchMock
        .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'container-1' }), { status: 200 }))
        .mockResolvedValueOnce(new Response(JSON.stringify({ status_code: 'ERROR' }), { status: 200 }));

      const resultPromise = publishImage('https://example.com/img.png', 'legenda de teste');
      const assertion = expect(resultPromise).rejects.toThrow('status ERROR');
      await vi.advanceTimersByTimeAsync(1_500);
      await assertion;

      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
