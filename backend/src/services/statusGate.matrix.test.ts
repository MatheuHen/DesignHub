/**
 * RF011 (Fase 10, roadmap "testes de todos os caminhos"): matriz
 * exaustiva confirmando que cada ação sensível ao status de `solicitacao`
 * aceita exatamente os estados de origem documentados em
 * `lib/statusTransitions.ts` e rejeita todos os outros — "impedir saltos
 * ilegais" verificado nos 7 estados oficiais (RN39), não só nos casos de
 * exemplo já cobertos pelos testes específicos de cada fase.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConflictError } from '../lib/errors.js';
import { SOLICITACAO_STATUSES, type SolicitacaoStatus } from '../lib/statusTransitions.js';

const {
  getSupabaseAdminClientMock,
  getSolicitacaoCoreMock,
  getSolicitacaoDetailRepoMock,
  syncDesignerBloqueioMock,
  findClienteByIdMock,
  registerVersaoArteMock,
  generateAvaliacaoLinkTokenMock,
  createAgendamentoRpcMock,
  getActiveAgendamentoBySolicitacaoMock,
  registerPublicacaoSucessoMock,
} = vi.hoisted(() => ({
  getSupabaseAdminClientMock: vi.fn(() => ({ __kind: 'admin-client' })),
  getSolicitacaoCoreMock: vi.fn(),
  getSolicitacaoDetailRepoMock: vi.fn(),
  syncDesignerBloqueioMock: vi.fn(),
  findClienteByIdMock: vi.fn(),
  registerVersaoArteMock: vi.fn(),
  generateAvaliacaoLinkTokenMock: vi.fn(),
  createAgendamentoRpcMock: vi.fn(),
  getActiveAgendamentoBySolicitacaoMock: vi.fn(),
  registerPublicacaoSucessoMock: vi.fn(),
}));

vi.mock('../config/supabase.js', () => ({ getSupabaseAdminClient: getSupabaseAdminClientMock }));
vi.mock('../config/env.js', () => ({ env: { FRONTEND_URL: 'https://app.exemplo.com' } }));
vi.mock('../integrations/whatsapp/whatsappClient.js', () => ({ sendTextMessage: vi.fn() }));
vi.mock('../repositories/atendimento.repository.js', () => ({ findClienteById: findClienteByIdMock }));
vi.mock('../repositories/solicitacao.repository.js', () => ({
  getSolicitacaoCore: getSolicitacaoCoreMock,
  getSolicitacaoDetail: getSolicitacaoDetailRepoMock,
  syncDesignerBloqueio: syncDesignerBloqueioMock,
}));
vi.mock('../repositories/versaoArte.repository.js', () => ({
  uploadArquivoToStorage: vi.fn(),
  removeArquivoFromStorageBestEffort: vi.fn(),
  registerVersaoArte: registerVersaoArteMock,
  getVersaoArteByIdAndSolicitacao: vi.fn(),
  createVersaoArteDownloadUrl: vi.fn(),
}));
vi.mock('../repositories/avaliacao.repository.js', () => ({
  generateAvaliacaoLinkToken: generateAvaliacaoLinkTokenMock,
  getAvaliacaoLinkState: vi.fn(),
  getVersaoArtePreview: vi.fn(),
  submitAvaliacao: vi.fn(),
}));
vi.mock('../repositories/agendamento.repository.js', () => ({
  createAgendamentoRpc: createAgendamentoRpcMock,
  updateAgendamentoRpc: vi.fn(),
  cancelAgendamentoRpc: vi.fn(),
  getActiveAgendamentoBySolicitacao: getActiveAgendamentoBySolicitacaoMock,
  listAgendamentos: vi.fn(),
}));
vi.mock('../repositories/publicacao.repository.js', () => ({
  getVersaoArteAtualDaSolicitacao: vi.fn(),
  listAgendamentosVencidos: vi.fn(),
  registerPublicacaoSucesso: registerPublicacaoSucessoMock,
  registerPublicacaoFalha: vi.fn(),
}));
vi.mock('../integrations/instagram/instagramClient.js', () => ({ publishImage: vi.fn() }));

const { uploadVersaoArte } = await import('./versaoArte.service.js');
const { gerarLinkAvaliacao } = await import('./avaliacao.service.js');
const { createAgendamento } = await import('./agendamento.service.js');
const { registrarPublicacaoManual } = await import('./publicacao.service.js');

const PDF_BYTES = Buffer.from('%PDF-1.4 conteúdo de teste');
const UPLOAD_ALLOWED: ReadonlySet<SolicitacaoStatus> = new Set(['Em produção', 'Ajustes']);
const LINK_ALLOWED: ReadonlySet<SolicitacaoStatus> = new Set(['Enviado para avaliação']);
const AGENDAMENTO_ALLOWED: ReadonlySet<SolicitacaoStatus> = new Set(['Aprovado']);
const PUBLICACAO_MANUAL_ALLOWED: ReadonlySet<SolicitacaoStatus> = new Set(['Agendado']);

describe('uploadVersaoArte — matriz de status (RF007/RN26)', () => {
  beforeEach(() => {
    getSolicitacaoCoreMock.mockReset();
    syncDesignerBloqueioMock.mockReset().mockResolvedValue(false);
    registerVersaoArteMock.mockReset().mockResolvedValue({
      idVersao: 1,
      numeroVersao: 1,
      statusAnterior: 'Em produção',
    });
  });

  it.each(SOLICITACAO_STATUSES)('status atual = %s', async (status) => {
    getSolicitacaoCoreMock.mockResolvedValue({ idSolicitacao: 10, idDesigner: 'designer-1', status });

    const attempt = uploadVersaoArte({} as never, 10, 'designer-1', {
      buffer: PDF_BYTES,
      observacoes: undefined,
    });

    if (UPLOAD_ALLOWED.has(status)) {
      await expect(attempt).resolves.toMatchObject({ status: 'Enviado para avaliação' });
    } else {
      await expect(attempt).rejects.toBeInstanceOf(ConflictError);
      expect(registerVersaoArteMock).not.toHaveBeenCalled();
    }
  });
});

describe('gerarLinkAvaliacao — matriz de status (RF009/RN19)', () => {
  beforeEach(() => {
    getSolicitacaoDetailRepoMock.mockReset();
    findClienteByIdMock.mockReset().mockResolvedValue({ id: 1, whatsapp: '5511999999999' });
    generateAvaliacaoLinkTokenMock.mockReset().mockResolvedValue({ idVersao: 1, numeroVersao: 1 });
  });

  it.each(SOLICITACAO_STATUSES)('status atual = %s', async (status) => {
    getSolicitacaoDetailRepoMock.mockResolvedValue({
      idDesigner: 'designer-1',
      status,
      idCliente: 1,
    });

    const attempt = gerarLinkAvaliacao({} as never, 10, 'designer-1');

    if (LINK_ALLOWED.has(status)) {
      await expect(attempt).resolves.toMatchObject({ whatsappNotified: true });
    } else {
      await expect(attempt).rejects.toBeInstanceOf(ConflictError);
      expect(generateAvaliacaoLinkTokenMock).not.toHaveBeenCalled();
    }
  });
});

describe('createAgendamento — matriz de status (RF012/RN30)', () => {
  const sampleBody = { dataPublicacao: '2026-09-01', horario: '10:00', legenda: 'Legenda' };

  beforeEach(() => {
    getSolicitacaoDetailRepoMock.mockReset();
    createAgendamentoRpcMock.mockReset().mockResolvedValue({ idAgendamento: 1 });
  });

  it.each(SOLICITACAO_STATUSES)('status atual = %s', async (status) => {
    getSolicitacaoDetailRepoMock.mockResolvedValue({ idDesigner: 'designer-1', status });

    const attempt = createAgendamento({} as never, 10, 'designer-1', sampleBody);

    if (AGENDAMENTO_ALLOWED.has(status)) {
      await expect(attempt).resolves.toEqual({ idAgendamento: 1 });
    } else {
      await expect(attempt).rejects.toBeInstanceOf(ConflictError);
      expect(createAgendamentoRpcMock).not.toHaveBeenCalled();
    }
  });
});

describe('registrarPublicacaoManual — matriz de status (RF014)', () => {
  beforeEach(() => {
    getSolicitacaoDetailRepoMock.mockReset();
    getActiveAgendamentoBySolicitacaoMock.mockReset().mockResolvedValue({
      idAgendamento: 7,
      idSolicitacao: 10,
      idDesigner: 'designer-1',
      status: 'Agendado',
    });
    registerPublicacaoSucessoMock.mockReset().mockResolvedValue(undefined);
  });

  it.each(SOLICITACAO_STATUSES)('status atual = %s', async (status) => {
    getSolicitacaoDetailRepoMock.mockResolvedValue({ idDesigner: 'designer-1', status });

    const attempt = registrarPublicacaoManual({} as never, 10, 'designer-1');

    if (PUBLICACAO_MANUAL_ALLOWED.has(status)) {
      await expect(attempt).resolves.toBeUndefined();
    } else {
      await expect(attempt).rejects.toBeInstanceOf(ConflictError);
      expect(registerPublicacaoSucessoMock).not.toHaveBeenCalled();
    }
  });
});
