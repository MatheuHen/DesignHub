import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  getSupabaseAdminClientMock,
  claimAgendamentosParaNotificarMock,
  getSolicitacaoDetailMock,
  listPushSubscriptionsByDesignerMock,
  deletePushSubscriptionByEndpointMock,
  sendWebPushNotificationMock,
} = vi.hoisted(() => ({
  getSupabaseAdminClientMock: vi.fn(() => ({ __kind: 'admin-client' })),
  claimAgendamentosParaNotificarMock: vi.fn(),
  getSolicitacaoDetailMock: vi.fn(),
  listPushSubscriptionsByDesignerMock: vi.fn(),
  deletePushSubscriptionByEndpointMock: vi.fn(),
  sendWebPushNotificationMock: vi.fn(),
}));

vi.mock('../config/supabase.js', () => ({ getSupabaseAdminClient: getSupabaseAdminClientMock }));
vi.mock('../config/env.js', () => ({ env: { FRONTEND_URL: 'https://app.exemplo.com' } }));
vi.mock('../repositories/publicacao.repository.js', () => ({
  claimAgendamentosParaNotificar: claimAgendamentosParaNotificarMock,
}));
vi.mock('../repositories/solicitacao.repository.js', () => ({
  getSolicitacaoDetail: getSolicitacaoDetailMock,
}));
vi.mock('../repositories/pushSubscription.repository.js', () => ({
  listPushSubscriptionsByDesigner: listPushSubscriptionsByDesignerMock,
  deletePushSubscriptionByEndpoint: deletePushSubscriptionByEndpointMock,
}));
vi.mock('../integrations/webpush/webPushClient.js', () => {
  class WebPushSubscriptionGoneError extends Error {}
  return {
    sendWebPushNotification: sendWebPushNotificationMock,
    WebPushSubscriptionGoneError,
  };
});

const { notificarPublicacoesProximas } = await import('./publicacaoNotificacao.service.js');
const { WebPushSubscriptionGoneError } = await import('../integrations/webpush/webPushClient.js');

describe('notificarPublicacoesProximas (item 9)', () => {
  beforeEach(() => {
    claimAgendamentosParaNotificarMock.mockReset();
    getSolicitacaoDetailMock.mockReset();
    listPushSubscriptionsByDesignerMock.mockReset();
    deletePushSubscriptionByEndpointMock.mockReset().mockResolvedValue(undefined);
    sendWebPushNotificationMock.mockReset();
  });

  it('não faz nada quando não há agendamento na janela', async () => {
    claimAgendamentosParaNotificarMock.mockResolvedValue([]);

    await expect(notificarPublicacoesProximas()).resolves.toEqual({
      processados: 0,
      enviados: 0,
      semAssinatura: 0,
      falhas: 0,
    });
    expect(getSolicitacaoDetailMock).not.toHaveBeenCalled();
  });

  it('envia push para todas as assinaturas do designer responsável', async () => {
    claimAgendamentosParaNotificarMock.mockResolvedValue([
      { idAgendamento: 1, idSolicitacao: 10, dataPublicacao: '2026-09-26', horario: '12:00:00' },
    ]);
    getSolicitacaoDetailMock.mockResolvedValue({
      idDesigner: 'designer-1',
      clienteNome: 'Cliente Teste',
      tema: 'Post promocional',
    });
    listPushSubscriptionsByDesignerMock.mockResolvedValue([
      { idUsuario: 'designer-1', endpoint: 'https://push.example/1', p256dh: 'p', authKey: 'a' },
    ]);
    sendWebPushNotificationMock.mockResolvedValue(undefined);

    const result = await notificarPublicacoesProximas();

    expect(result).toEqual({ processados: 1, enviados: 1, semAssinatura: 0, falhas: 0 });
    expect(sendWebPushNotificationMock).toHaveBeenCalledOnce();
    const [subscriptionArg, payloadArg] = sendWebPushNotificationMock.mock.calls[0] as [unknown, { title: string; body: string }];
    expect(subscriptionArg).toEqual({ idUsuario: 'designer-1', endpoint: 'https://push.example/1', p256dh: 'p', authKey: 'a' });
    expect(payloadArg.title).toBe('Publicação em 2 horas');
    expect(payloadArg.body).toContain('Post promocional');
  });

  it('conta "semAssinatura" quando o designer não tem nenhum dispositivo registrado', async () => {
    claimAgendamentosParaNotificarMock.mockResolvedValue([
      { idAgendamento: 1, idSolicitacao: 10, dataPublicacao: '2026-09-26', horario: '12:00:00' },
    ]);
    getSolicitacaoDetailMock.mockResolvedValue({ idDesigner: 'designer-1', clienteNome: 'Cliente Teste', tema: null });
    listPushSubscriptionsByDesignerMock.mockResolvedValue([]);

    const result = await notificarPublicacoesProximas();

    expect(result).toEqual({ processados: 1, enviados: 0, semAssinatura: 1, falhas: 0 });
    expect(sendWebPushNotificationMock).not.toHaveBeenCalled();
  });

  it('remove assinatura expirada/revogada (410/404) sem contar como falha do agendamento', async () => {
    claimAgendamentosParaNotificarMock.mockResolvedValue([
      { idAgendamento: 1, idSolicitacao: 10, dataPublicacao: '2026-09-26', horario: '12:00:00' },
    ]);
    getSolicitacaoDetailMock.mockResolvedValue({ idDesigner: 'designer-1', clienteNome: 'Cliente Teste', tema: null });
    listPushSubscriptionsByDesignerMock.mockResolvedValue([
      { idUsuario: 'designer-1', endpoint: 'https://push.example/morta', p256dh: 'p', authKey: 'a' },
    ]);
    sendWebPushNotificationMock.mockRejectedValue(new WebPushSubscriptionGoneError('expirada'));

    const result = await notificarPublicacoesProximas();

    expect(result.falhas).toBe(1);
    expect(deletePushSubscriptionByEndpointMock).toHaveBeenCalledWith(expect.anything(), 'https://push.example/morta');
  });

  it('nunca lança: uma falha inesperada em um agendamento não interrompe os demais', async () => {
    claimAgendamentosParaNotificarMock.mockResolvedValue([
      { idAgendamento: 1, idSolicitacao: 10, dataPublicacao: '2026-09-26', horario: '12:00:00' },
      { idAgendamento: 2, idSolicitacao: 11, dataPublicacao: '2026-09-26', horario: '13:00:00' },
    ]);
    getSolicitacaoDetailMock
      .mockRejectedValueOnce(new Error('erro inesperado de banco'))
      .mockResolvedValueOnce({ idDesigner: 'designer-1', clienteNome: 'Cliente Teste', tema: null });
    listPushSubscriptionsByDesignerMock.mockResolvedValue([
      { idUsuario: 'designer-1', endpoint: 'https://push.example/1', p256dh: 'p', authKey: 'a' },
    ]);
    sendWebPushNotificationMock.mockResolvedValue(undefined);

    const result = await notificarPublicacoesProximas();

    expect(result).toEqual({ processados: 2, enviados: 1, semAssinatura: 0, falhas: 1 });
  });
});
