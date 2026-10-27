import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  sendWebPushNotificationMock,
  listPushSubscriptionsByDesignerMock,
  deletePushSubscriptionByEndpointMock,
  getSolicitacaoDetailMock,
} = vi.hoisted(() => ({
  sendWebPushNotificationMock: vi.fn(),
  listPushSubscriptionsByDesignerMock: vi.fn(),
  deletePushSubscriptionByEndpointMock: vi.fn(),
  getSolicitacaoDetailMock: vi.fn(),
}));

vi.mock('../config/env.js', () => ({ env: { FRONTEND_URL: 'https://app.exemplo' } }));
vi.mock('../integrations/webpush/webPushClient.js', () => {
  class WebPushSubscriptionGoneError extends Error {}
  return {
    sendWebPushNotification: sendWebPushNotificationMock,
    WebPushSubscriptionGoneError,
  };
});
vi.mock('../repositories/pushSubscription.repository.js', () => ({
  listPushSubscriptionsByDesigner: listPushSubscriptionsByDesignerMock,
  deletePushSubscriptionByEndpoint: deletePushSubscriptionByEndpointMock,
}));
vi.mock('../repositories/solicitacao.repository.js', () => ({
  getSolicitacaoDetail: getSolicitacaoDetailMock,
}));

const { buildPushTitle, formatarDataHora, notificarDesignerPush, notificarEventoSolicitacao } =
  await import('./designerPush.service.js');
const { WebPushSubscriptionGoneError } = await import('../integrations/webpush/webPushClient.js');

const DISPOSITIVO_1 = { endpoint: 'https://push.exemplo/1', p256dh: 'p1', authKey: 'a1' };
const DISPOSITIVO_2 = { endpoint: 'https://push.exemplo/2', p256dh: 'p2', authKey: 'a2' };

describe('designerPush.service', () => {
  beforeEach(() => {
    sendWebPushNotificationMock.mockReset().mockResolvedValue(undefined);
    listPushSubscriptionsByDesignerMock.mockReset();
    deletePushSubscriptionByEndpointMock.mockReset().mockResolvedValue(undefined);
    getSolicitacaoDetailMock.mockReset();
  });

  describe('buildPushTitle / formatarDataHora', () => {
    it('padroniza o título como "DesignHub — EVENTO"', () => {
      expect(buildPushTitle('Arte aprovada')).toBe('DesignHub — ARTE APROVADA');
    });

    it('formata data/hora sem reinterpretar o fuso do servidor', () => {
      // Valores locais de America/Sao_Paulo gravados pelo RF012 — criar um
      // Date aqui deslocaria o horário exibido ao designer.
      expect(formatarDataHora('2026-10-27', '15:00:00')).toBe('27/10/2026 às 15:00');
      expect(formatarDataHora('2026-01-05', '09:30')).toBe('05/01/2026 às 09:30');
    });
  });

  describe('notificarDesignerPush (vários dispositivos)', () => {
    it('envia para TODOS os dispositivos inscritos do designer', async () => {
      listPushSubscriptionsByDesignerMock.mockResolvedValue([DISPOSITIVO_1, DISPOSITIVO_2]);

      const result = await notificarDesignerPush(
        {} as never,
        'designer-1',
        { title: 't', body: 'b' },
        'teste',
      );

      expect(sendWebPushNotificationMock).toHaveBeenCalledTimes(2);
      expect(result).toEqual({ enviados: 2, removidas: 0, total: 2 });
    });

    it('remove a assinatura expirada (410) e continua entregando nas demais', async () => {
      listPushSubscriptionsByDesignerMock.mockResolvedValue([DISPOSITIVO_1, DISPOSITIVO_2]);
      sendWebPushNotificationMock
        .mockRejectedValueOnce(new WebPushSubscriptionGoneError('expirada'))
        .mockResolvedValueOnce(undefined);

      const result = await notificarDesignerPush(
        {} as never,
        'designer-1',
        { title: 't', body: 'b' },
        'teste',
      );

      expect(deletePushSubscriptionByEndpointMock).toHaveBeenCalledWith(
        expect.anything(),
        DISPOSITIVO_1.endpoint,
      );
      expect(result).toEqual({ enviados: 1, removidas: 1, total: 2 });
    });

    it('nunca lança quando o envio falha por erro transitório', async () => {
      listPushSubscriptionsByDesignerMock.mockResolvedValue([DISPOSITIVO_1]);
      sendWebPushNotificationMock.mockRejectedValue(new Error('rede indisponível'));

      const result = await notificarDesignerPush(
        {} as never,
        'designer-1',
        { title: 't', body: 'b' },
        'teste',
      );

      expect(result).toEqual({ enviados: 0, removidas: 0, total: 1 });
    });

    it('nunca lança quando não há dispositivo inscrito', async () => {
      listPushSubscriptionsByDesignerMock.mockResolvedValue([]);

      const result = await notificarDesignerPush(
        {} as never,
        'designer-1',
        { title: 't', body: 'b' },
        'teste',
      );

      expect(sendWebPushNotificationMock).not.toHaveBeenCalled();
      expect(result).toEqual({ enviados: 0, removidas: 0, total: 0 });
    });

    it('nunca lança quando a busca de assinaturas falha', async () => {
      listPushSubscriptionsByDesignerMock.mockRejectedValue(new Error('banco fora'));

      await expect(
        notificarDesignerPush({} as never, 'designer-1', { title: 't', body: 'b' }, 'teste'),
      ).resolves.toEqual({ enviados: 0, removidas: 0, total: 0 });
    });
  });

  describe('notificarEventoSolicitacao', () => {
    it('identifica a arte pelo tema e aponta para a página da solicitação', async () => {
      getSolicitacaoDetailMock.mockResolvedValue({ idDesigner: 'designer-1', tema: 'Sinuca' });
      listPushSubscriptionsByDesignerMock.mockResolvedValue([DISPOSITIVO_1]);

      await notificarEventoSolicitacao({} as never, {
        idSolicitacao: 42,
        evento: 'Publicação registrada',
        body: (arte) => `A publicação manual de ${arte} foi registrada.`,
      });

      expect(sendWebPushNotificationMock).toHaveBeenCalledWith(DISPOSITIVO_1, {
        title: 'DesignHub — PUBLICAÇÃO REGISTRADA',
        body: 'A publicação manual de a arte "Sinuca" foi registrada.',
        url: 'https://app.exemplo/designer/solicitacoes/42',
      });
    });

    it('funciona sem tema definido, sem expor outro dado do cliente', async () => {
      getSolicitacaoDetailMock.mockResolvedValue({
        idDesigner: 'designer-1',
        tema: null,
        clienteNome: 'Fulano de Tal',
      });
      listPushSubscriptionsByDesignerMock.mockResolvedValue([DISPOSITIVO_1]);

      await notificarEventoSolicitacao({} as never, {
        idSolicitacao: 42,
        evento: 'Nova solicitação',
        body: (arte) => `${arte} entrou em produção.`,
      });

      const [, payload] = sendWebPushNotificationMock.mock.calls[0] as [unknown, { body: string }];
      expect(payload.body).toBe('a arte entrou em produção.');
      // RNF010: nome/WhatsApp/Instagram do cliente nunca entram na notificação.
      expect(payload.body).not.toContain('Fulano');
    });

    it('não envia nada quando a solicitação não pode ser lida (best-effort)', async () => {
      getSolicitacaoDetailMock.mockResolvedValue(null);

      await notificarEventoSolicitacao({} as never, {
        idSolicitacao: 42,
        evento: 'Nova solicitação',
        body: () => 'x',
      });

      expect(sendWebPushNotificationMock).not.toHaveBeenCalled();
    });

    it('nunca lança quando a leitura da solicitação falha', async () => {
      getSolicitacaoDetailMock.mockRejectedValue(new Error('banco fora'));

      await expect(
        notificarEventoSolicitacao({} as never, {
          idSolicitacao: 42,
          evento: 'Nova solicitação',
          body: () => 'x',
        }),
      ).resolves.toBeUndefined();
    });
  });
});
