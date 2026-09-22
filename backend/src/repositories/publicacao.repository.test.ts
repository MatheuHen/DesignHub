import { describe, expect, it, vi } from 'vitest';
import { ConflictError, NotFoundError } from '../lib/errors.js';
import {
  claimAgendamentosParaNotificar,
  claimAgendamentoParaPublicacao,
  claimNotificacaoPublicacao,
  getPublicacaoBySolicitacao,
  getVersaoArteAtualDaSolicitacao,
  listAgendamentosVencidos,
  registerPublicacaoFalha,
  registerPublicacaoSucesso,
  setInstagramMediaPendente,
  setPublicacaoComprovante,
} from './publicacao.repository.js';

function rpcClient(response: { data: unknown; error: { message: string; code?: string } | null }) {
  return { rpc: () => Promise.resolve(response) } as unknown as Parameters<typeof registerPublicacaoSucesso>[0];
}

describe('claimAgendamentoParaPublicacao (RF014/RN29 — idempotência do job)', () => {
  it('retorna true quando a RPC reserva o agendamento', async () => {
    const client = rpcClient({ data: true, error: null });
    await expect(claimAgendamentoParaPublicacao(client, 1)).resolves.toBe(true);
  });

  it('retorna false quando outra execução já reservou (sem lançar erro)', async () => {
    const client = rpcClient({ data: false, error: null });
    await expect(claimAgendamentoParaPublicacao(client, 1)).resolves.toBe(false);
  });

  it('propaga erro inesperado da RPC', async () => {
    const client = rpcClient({ data: null, error: { message: 'falha de conexão' } });
    await expect(claimAgendamentoParaPublicacao(client, 1)).rejects.toThrow('falha de conexão');
  });
});

describe('registerPublicacaoSucesso (RF014)', () => {
  it('mapeia P0002 (agendamento não encontrado) para NotFoundError', async () => {
    const client = rpcClient({ data: null, error: { message: 'não encontrado', code: 'P0002' } });
    await expect(
      registerPublicacaoSucesso(client, { idAgendamento: 1, tipo: 'automatica', atorId: null }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('mapeia P0001 (agendamento não ativo) para ConflictError', async () => {
    const client = rpcClient({ data: null, error: { message: 'não ativo', code: 'P0001' } });
    await expect(
      registerPublicacaoSucesso(client, { idAgendamento: 1, tipo: 'manual', atorId: 'designer-1' }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('resolve sem erro quando a RPC tem sucesso', async () => {
    const client = rpcClient({ data: null, error: null });
    await expect(
      registerPublicacaoSucesso(client, { idAgendamento: 1, tipo: 'automatica', atorId: null }),
    ).resolves.toBeUndefined();
  });
});

describe('registerPublicacaoFalha (RF014 — nunca marca como publicado)', () => {
  it('mapeia P0001 (agendamento não ativo) para ConflictError', async () => {
    const client = rpcClient({ data: null, error: { message: 'não ativo', code: 'P0001' } });
    await expect(registerPublicacaoFalha(client, { idAgendamento: 1 })).rejects.toBeInstanceOf(
      ConflictError,
    );
  });

  it('resolve sem erro quando a RPC tem sucesso', async () => {
    const client = rpcClient({ data: null, error: null });
    await expect(registerPublicacaoFalha(client, { idAgendamento: 1 })).resolves.toBeUndefined();
  });
});

describe('listAgendamentosVencidos (RF014/RN32)', () => {
  it('retorna os agendamentos vencidos mapeados', async () => {
    const client = {
      from: () => ({
        select: () => ({
          eq: () => ({
            lte: () =>
              Promise.resolve({
                data: [
                  {
                    id_agendamento: 1,
                    id_solicitacao: 10,
                    legenda: 'Legenda',
                    instagram_media_id_pendente: null,
                    instagram_permalink_pendente: null,
                  },
                ],
                error: null,
              }),
          }),
        }),
      }),
    } as unknown as Parameters<typeof listAgendamentosVencidos>[0];

    await expect(listAgendamentosVencidos(client)).resolves.toEqual([
      {
        idAgendamento: 1,
        idSolicitacao: 10,
        legenda: 'Legenda',
        instagramMediaIdPendente: null,
        instagramPermalinkPendente: null,
      },
    ]);
  });
});

describe('claimAgendamentosParaNotificar (item 9 — idempotência do aviso de push)', () => {
  it('reivindica (UPDATE...RETURNING) e mapeia os agendamentos dentro da janela', async () => {
    const select = vi.fn().mockResolvedValue({
      data: [{ id_agendamento: 1, id_solicitacao: 10, data_publicacao: '2026-09-26', horario: '12:00:00' }],
      error: null,
    });
    const lte = vi.fn(() => ({ select }));
    const gte = vi.fn(() => ({ lte }));
    const eqNotificado = vi.fn(() => ({ gte }));
    const eqStatus = vi.fn(() => ({ eq: eqNotificado }));
    const update = vi.fn(() => ({ eq: eqStatus }));
    const client = { from: () => ({ update }) } as unknown as Parameters<typeof claimAgendamentosParaNotificar>[0];

    await expect(claimAgendamentosParaNotificar(client, '2026-09-26T14:00:00.000Z', '2026-09-26T14:10:00.000Z')).resolves.toEqual(
      [{ idAgendamento: 1, idSolicitacao: 10, dataPublicacao: '2026-09-26', horario: '12:00:00' }],
    );
    expect(update).toHaveBeenCalledWith({ notificado_2h: true });
    expect(eqStatus).toHaveBeenCalledWith('status', 'Agendado');
    expect(eqNotificado).toHaveBeenCalledWith('notificado_2h', false);
  });

  function chainedClient(response: { data: unknown; error: { message: string } | null }) {
    const select = vi.fn().mockResolvedValue(response);
    const lte = vi.fn(() => ({ select }));
    const gte = vi.fn(() => ({ lte }));
    const eqNotificado = vi.fn(() => ({ gte }));
    const eqStatus = vi.fn(() => ({ eq: eqNotificado }));
    const update = vi.fn(() => ({ eq: eqStatus }));
    return { from: () => ({ update }) } as unknown as Parameters<typeof claimAgendamentosParaNotificar>[0];
  }

  it('retorna lista vazia quando nada está na janela', async () => {
    const client = chainedClient({ data: [], error: null });
    await expect(claimAgendamentosParaNotificar(client, 'a', 'b')).resolves.toEqual([]);
  });

  it('propaga erro do banco', async () => {
    const client = chainedClient({ data: null, error: { message: 'falhou' } });
    await expect(claimAgendamentosParaNotificar(client, 'a', 'b')).rejects.toThrow(/falhou/);
  });
});

describe('claimNotificacaoPublicacao (item 14 — idempotência do aviso "ARTE PUBLICADA!")', () => {
  it('sem force: aplica .is(...null) e retorna true quando reivindica (linha ainda não notificada)', async () => {
    const select = vi.fn().mockResolvedValue({ data: [{ id_publicacao: 1 }], error: null });
    const is = vi.fn(() => ({ select }));
    const eq = vi.fn(() => ({ is }));
    const update = vi.fn(() => ({ eq }));
    const client = { from: () => ({ update }) } as unknown as Parameters<typeof claimNotificacaoPublicacao>[0];

    await expect(claimNotificacaoPublicacao(client, 1)).resolves.toBe(true);
    expect(is).toHaveBeenCalledWith('notificado_arte_publicada_em', null);
  });

  it('sem force: retorna false quando já havia sido reivindicada (nenhuma linha atualizada)', async () => {
    const select = vi.fn().mockResolvedValue({ data: [], error: null });
    const client = {
      from: () => ({ update: () => ({ eq: () => ({ is: () => ({ select }) }) }) }),
    } as unknown as Parameters<typeof claimNotificacaoPublicacao>[0];

    await expect(claimNotificacaoPublicacao(client, 1)).resolves.toBe(false);
  });

  it('com force: NÃO aplica o filtro .is(...null) — sempre reivindica (reenvio manual explícito)', async () => {
    const select = vi.fn().mockResolvedValue({ data: [{ id_publicacao: 1 }], error: null });
    const is = vi.fn();
    const eq = vi.fn(() => ({ select }));
    const update = vi.fn(() => ({ eq }));
    const client = { from: () => ({ update }) } as unknown as Parameters<typeof claimNotificacaoPublicacao>[0];

    await expect(claimNotificacaoPublicacao(client, 1, { force: true })).resolves.toBe(true);
    expect(is).not.toHaveBeenCalled();
  });

  it('propaga erro do banco', async () => {
    const client = {
      from: () => ({ update: () => ({ eq: () => ({ is: () => ({ select: () => Promise.resolve({ data: null, error: { message: 'falhou' } }) }) }) }) }),
    } as unknown as Parameters<typeof claimNotificacaoPublicacao>[0];

    await expect(claimNotificacaoPublicacao(client, 1)).rejects.toThrow(/falhou/);
  });
});

describe('setInstagramMediaPendente (auditoria — achado HIGH, janela de publicação duplicada)', () => {
  it('resolve sem erro quando a RPC tem sucesso', async () => {
    const client = rpcClient({ data: null, error: null });
    await expect(
      setInstagramMediaPendente(client, 1, 'ig-media-1', 'https://www.instagram.com/p/abc/'),
    ).resolves.toBeUndefined();
  });

  it('propaga erro inesperado da RPC', async () => {
    const client = rpcClient({ data: null, error: { message: 'falha de conexão' } });
    await expect(setInstagramMediaPendente(client, 1, 'ig-media-1', null)).rejects.toThrow('falha de conexão');
  });
});

describe('getVersaoArteAtualDaSolicitacao (RF014)', () => {
  it('retorna null quando não há versão', async () => {
    const client = {
      from: () => ({
        select: () => ({
          eq: () => ({
            order: () => ({
              limit: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }),
            }),
          }),
        }),
      }),
    } as unknown as Parameters<typeof getVersaoArteAtualDaSolicitacao>[0];

    await expect(getVersaoArteAtualDaSolicitacao(client, 10)).resolves.toBeNull();
  });

  it('retorna a versão mais recente quando existe', async () => {
    const client = {
      from: () => ({
        select: () => ({
          eq: () => ({
            order: () => ({
              limit: () => ({
                maybeSingle: () =>
                  Promise.resolve({
                    data: { id_versao: 2, numero_versao: 3, formato: 'PNG', arquivo_url: 'solicitacoes/10/versoes/x.png' },
                    error: null,
                  }),
              }),
            }),
          }),
        }),
      }),
    } as unknown as Parameters<typeof getVersaoArteAtualDaSolicitacao>[0];

    await expect(getVersaoArteAtualDaSolicitacao(client, 10)).resolves.toEqual({
      idVersao: 2,
      numeroVersao: 3,
      formato: 'PNG',
      arquivoUrl: 'solicitacoes/10/versoes/x.png',
    });
  });
});

describe('getPublicacaoBySolicitacao (RF014/item 9.1/9.3)', () => {
  it('retorna null quando não há publicação', async () => {
    const client = {
      from: () => ({
        select: () => ({
          eq: () => ({
            order: () => ({
              limit: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }),
            }),
          }),
        }),
      }),
    } as unknown as Parameters<typeof getPublicacaoBySolicitacao>[0];

    await expect(getPublicacaoBySolicitacao(client, 10)).resolves.toBeNull();
  });

  it('mapeia a publicação mais recente, incluindo permalink/comprovante nulos', async () => {
    const client = {
      from: () => ({
        select: () => ({
          eq: () => ({
            order: () => ({
              limit: () => ({
                maybeSingle: () =>
                  Promise.resolve({
                    data: {
                      id_publicacao: 1,
                      data_publicada: '2026-09-01T12:00:00Z',
                      tipo: 'automatica',
                      permalink: 'https://www.instagram.com/p/abc123/',
                      comprovante_url: null,
                      versao_arte: { numero_versao: 3 },
                    },
                    error: null,
                  }),
              }),
            }),
          }),
        }),
      }),
    } as unknown as Parameters<typeof getPublicacaoBySolicitacao>[0];

    await expect(getPublicacaoBySolicitacao(client, 10)).resolves.toEqual({
      idPublicacao: 1,
      dataPublicada: '2026-09-01T12:00:00Z',
      tipo: 'automatica',
      permalink: 'https://www.instagram.com/p/abc123/',
      comprovanteUrl: null,
      numeroVersao: 3,
    });
  });
});

describe('setPublicacaoComprovante (item 9.3)', () => {
  it('resolve sem erro quando a atualização é bem-sucedida', async () => {
    const client = {
      from: () => ({ update: () => ({ eq: () => Promise.resolve({ error: null }) }) }),
    } as unknown as Parameters<typeof setPublicacaoComprovante>[0];

    await expect(setPublicacaoComprovante(client, 1, 'solicitacoes/10/publicacao/x.png')).resolves.toBeUndefined();
  });

  it('lança erro quando a atualização falha', async () => {
    const client = {
      from: () => ({ update: () => ({ eq: () => Promise.resolve({ error: { message: 'boom' } }) }) }),
    } as unknown as Parameters<typeof setPublicacaoComprovante>[0];

    await expect(setPublicacaoComprovante(client, 1, 'solicitacoes/10/publicacao/x.png')).rejects.toThrow('boom');
  });
});
