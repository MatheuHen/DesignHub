import { Router } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { getSupabaseUserClient } from '../config/supabase.js';
import { toAppError, ValidationError } from '../lib/errors.js';
import { attachProfile, requireAuth, requireProfile } from '../middleware/auth.js';
import {
  uploadPublicacaoComprovante as uploadPublicacaoComprovanteMiddleware,
  uploadVersaoArte as uploadVersaoArteMiddleware,
} from '../middleware/upload.js';
import { agendamentoBodySchema } from '../schemas/agendamento.schemas.js';
import { reassignSolicitacaoSchema } from '../schemas/designer.schemas.js';
import {
  ajusteParamsSchema,
  listSolicitacoesQuerySchema,
  solicitacaoIdParamSchema,
  updateSolicitacaoSchema,
  uploadVersaoArteBodySchema,
  versaoArteParamsSchema,
} from '../schemas/solicitacao.schemas.js';
import {
  cancelAgendamento,
  createAgendamento,
  updateAgendamento,
} from '../services/agendamento.service.js';
import { gerarLinkAvaliacao, getLinkAvaliacaoHistorico } from '../services/avaliacao.service.js';
import { reassignSolicitacao } from '../services/designer.service.js';
import {
  getComprovanteDownloadUrl,
  getPublicacaoDetalhe,
  registrarPublicacaoManual,
  reenviarNotificacaoPublicacao,
  uploadComprovantePublicacao,
} from '../services/publicacao.service.js';
import {
  cancelSolicitacao,
  getAjusteReferenciaUrl,
  getAtendimentoReferenciaUrl,
  getSolicitacaoDetail,
  listSolicitacoes,
  updateSolicitacao,
} from '../services/solicitacao.service.js';
import {
  getVersaoArteDownloadUrl,
  uploadVersaoArte,
} from '../services/versaoArte.service.js';

export const solicitacaoRouter = Router();

solicitacaoRouter.use(requireAuth, attachProfile);

/**
 * RF007 + seção 12.3: o rate limit global (120 req/min por IP, `app.ts`) não
 * é proporcional ao risco de um endpoint que aceita até 15 MB por
 * requisição — sem limite dedicado, um designer autenticado poderia
 * consumir até ~1,8 GB/min de armazenamento/egress no plano gratuito do
 * Supabase (custo zero exigido pelo TFC, seção 2.1). Chave por
 * `request.auth.userId` (não por IP): o risco é por conta, não por rede de
 * origem, e várias sessões atrás do mesmo IP não devem competir pela mesma
 * cota.
 */
const uploadVersaoArteRateLimit = rateLimit({
  windowMs: 10 * 60_000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (request) => request.auth?.userId ?? ipKeyGenerator(request.ip ?? 'unknown'),
});

/** RF005/RN44: listagem/filtro das próprias solicitações do designer. */
solicitacaoRouter.get('/', requireProfile('designer'), async (request, response, next) => {
  try {
    const query = listSolicitacoesQuerySchema.parse(request.query);
    const client = getSupabaseUserClient(request.auth!.accessToken);
    const result = await listSolicitacoes(client, query);
    response.status(200).json(result);
  } catch (error) {
    next(toAppError(error));
  }
});

/**
 * RF016/RN47/RN49: leitura admin-only para localizar solicitações a
 * reatribuir. Reaproveita o mesmo service/repository já auditado da
 * listagem do designer — a RLS `solicitacao_select_owner_or_admin` já
 * permite `public.is_admin()` ler todas as linhas, então nenhuma query
 * nova foi criada, só uma rota que expõe esse caminho já seguro ao
 * administrador. Path de dois segmentos (`/admin/todas`) para não colidir
 * com `/:id` (rota de um segmento, validada como número por zod).
 */
solicitacaoRouter.get('/admin/todas', requireProfile('administrador'), async (request, response, next) => {
  try {
    const query = listSolicitacoesQuerySchema.parse(request.query);
    const client = getSupabaseUserClient(request.auth!.accessToken);
    const result = await listSolicitacoes(client, query);
    response.status(200).json(result);
  } catch (error) {
    next(toAppError(error));
  }
});

/**
 * RF005/RF016: detalhes com status, atendimento e histórico de transições.
 * Administrador também acessa (QUADRO 61: ação "Consultar" da listagem de
 * solicitações atribuídas) — sempre somente leitura, nunca escreve por
 * esta rota.
 */
solicitacaoRouter.get(
  '/:id',
  requireProfile('designer', 'administrador'),
  async (request, response, next) => {
    try {
      const { id } = solicitacaoIdParamSchema.parse(request.params);
      const client = getSupabaseUserClient(request.auth!.accessToken);
      const isAdmin = request.profile!.perfil === 'administrador';
      const result = await getSolicitacaoDetail(client, id, request.auth!.userId, {
        allowAnyDesigner: isAdmin,
      });
      response.status(200).json(result);
    } catch (error) {
      next(toAppError(error));
    }
  },
);

/** RF005: edição dos campos descritivos pelo designer responsável. */
solicitacaoRouter.patch('/:id', requireProfile('designer'), async (request, response, next) => {
  try {
    const { id } = solicitacaoIdParamSchema.parse(request.params);
    const input = updateSolicitacaoSchema.parse(request.body);
    const client = getSupabaseUserClient(request.auth!.accessToken);
    await updateSolicitacao(client, id, request.auth!.userId, input);
    response.status(204).end();
  } catch (error) {
    next(toAppError(error));
  }
});

/**
 * Item 12/30 (rodada correções) + seção 12.3: dispara aviso a um serviço
 * externo (Meta) — limite dedicado por designer, mesmo padrão de
 * `linkAvaliacaoRateLimit`.
 */
const cancelarSolicitacaoRateLimit = rateLimit({
  windowMs: 10 * 60_000,
  limit: 15,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (request) => request.auth?.userId ?? ipKeyGenerator(request.ip ?? 'unknown'),
});

/** RF005/RF011 (item 12/30): designer cancela a própria solicitação em qualquer estado ativo. */
solicitacaoRouter.post(
  '/:id/cancelar',
  requireProfile('designer'),
  cancelarSolicitacaoRateLimit,
  async (request, response, next) => {
    try {
      const { id } = solicitacaoIdParamSchema.parse(request.params);
      const client = getSupabaseUserClient(request.auth!.accessToken);
      await cancelSolicitacao(client, id, request.auth!.userId);
      response.status(204).end();
    } catch (error) {
      next(toAppError(error));
    }
  },
);

/** RF007/RF008: upload de nova versão (PDF/JPG/PNG) pelo designer responsável. */
solicitacaoRouter.post(
  '/:id/versoes',
  requireProfile('designer'),
  uploadVersaoArteRateLimit,
  (request, response, next) => {
    uploadVersaoArteMiddleware(request, response, (error: unknown) => {
      if (error) {
        next(toAppError(error));
        return;
      }
      next();
    });
  },
  async (request, response, next) => {
    try {
      const { id } = solicitacaoIdParamSchema.parse(request.params);
      const { observacoes } = uploadVersaoArteBodySchema.parse(request.body);
      if (!request.file) {
        throw new ValidationError('Arquivo obrigatório (campo "arquivo").');
      }
      const client = getSupabaseUserClient(request.auth!.accessToken);
      const result = await uploadVersaoArte(client, id, request.auth!.userId, {
        buffer: request.file.buffer,
        observacoes,
      });
      response.status(201).json(result);
    } catch (error) {
      next(toAppError(error));
    }
  },
);

/**
 * RF009/RN19 + seção 12.3: gera o link de avaliação e tenta notificar o
 * cliente via WhatsApp. Limite dedicado por designer — dispara envio a um
 * serviço externo (Meta), não deve competir com o rate limit de upload.
 */
const linkAvaliacaoRateLimit = rateLimit({
  windowMs: 10 * 60_000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (request) => request.auth?.userId ?? ipKeyGenerator(request.ip ?? 'unknown'),
});

/** RF009/RN19: gera o link de avaliação da versão pendente e notifica o cliente via WhatsApp. */
solicitacaoRouter.post(
  '/:id/link-avaliacao',
  requireProfile('designer'),
  linkAvaliacaoRateLimit,
  async (request, response, next) => {
    try {
      const { id } = solicitacaoIdParamSchema.parse(request.params);
      const client = getSupabaseUserClient(request.auth!.accessToken);
      const result = await gerarLinkAvaliacao(client, id, request.auth!.userId);
      response.status(201).json(result);
    } catch (error) {
      next(toAppError(error));
    }
  },
);

/**
 * Item 7 (rodada final): histórico PERSISTIDO do link de avaliação da versão
 * pendente — "Último envio", canal, situação real e quantidade de tentativas.
 * Sobrevive a reload/nova sessão, diferente da resposta ephemeral do POST
 * acima. `null` quando a solicitação ainda não tem nenhuma versão enviada.
 */
solicitacaoRouter.get(
  '/:id/link-avaliacao',
  requireProfile('designer'),
  async (request, response, next) => {
    try {
      const { id } = solicitacaoIdParamSchema.parse(request.params);
      const client = getSupabaseUserClient(request.auth!.accessToken);
      const result = await getLinkAvaliacaoHistorico(client, id, request.auth!.userId);
      response.status(200).json(result);
    } catch (error) {
      next(toAppError(error));
    }
  },
);

/**
 * RF008 + seção 12.5: URL assinada de curta duração para download/visualização
 * de uma versão. Item 5.6: Administrador também autorizado (somente leitura,
 * qualquer solicitação), Designer continua restrito à própria.
 */
solicitacaoRouter.get(
  '/:id/versoes/:versaoId/download-url',
  requireProfile('designer', 'administrador'),
  async (request, response, next) => {
    try {
      const { id, versaoId } = versaoArteParamsSchema.parse(request.params);
      const client = getSupabaseUserClient(request.auth!.accessToken);
      const inline = request.query.inline === '1';
      const isAdmin = request.profile!.perfil === 'administrador';
      const result = await getVersaoArteDownloadUrl(client, id, versaoId, request.auth!.userId, inline, {
        allowAnyDesigner: isAdmin,
      });
      response.status(200).json(result);
    } catch (error) {
      next(toAppError(error));
    }
  },
);

/** RF010 + seção 12.5: URL assinada de curta duração para a referência opcional de um ajuste. */
solicitacaoRouter.get(
  '/:id/ajustes/:ajusteId/referencia-url',
  requireProfile('designer'),
  async (request, response, next) => {
    try {
      const { id, ajusteId } = ajusteParamsSchema.parse(request.params);
      const client = getSupabaseUserClient(request.auth!.accessToken);
      const inline = request.query.inline === '1';
      const result = await getAjusteReferenciaUrl(client, id, ajusteId, request.auth!.userId, inline);
      response.status(200).json(result);
    } catch (error) {
      next(toAppError(error));
    }
  },
);

/** RF004/item 5 + seção 12.5: URL assinada de curta duração da referência enviada pelo cliente no WhatsApp. */
solicitacaoRouter.get(
  '/:id/atendimento-referencia-url',
  requireProfile('designer'),
  async (request, response, next) => {
    try {
      const { id } = solicitacaoIdParamSchema.parse(request.params);
      const client = getSupabaseUserClient(request.auth!.accessToken);
      const inline = request.query.inline === '1';
      const result = await getAtendimentoReferenciaUrl(client, id, request.auth!.userId, inline);
      response.status(200).json(result);
    } catch (error) {
      next(toAppError(error));
    }
  },
);

/** RF012/RN27/RN30: agenda a publicação (só solicitação Aprovado). */
solicitacaoRouter.post(
  '/:id/agendamento',
  requireProfile('designer'),
  async (request, response, next) => {
    try {
      const { id } = solicitacaoIdParamSchema.parse(request.params);
      const body = agendamentoBodySchema.parse(request.body);
      const client = getSupabaseUserClient(request.auth!.accessToken);
      const result = await createAgendamento(client, id, request.auth!.userId, body);
      response.status(201).json(result);
    } catch (error) {
      next(toAppError(error));
    }
  },
);

/** RF012: edita o agendamento ativo da solicitação. */
solicitacaoRouter.patch(
  '/:id/agendamento',
  requireProfile('designer'),
  async (request, response, next) => {
    try {
      const { id } = solicitacaoIdParamSchema.parse(request.params);
      const body = agendamentoBodySchema.parse(request.body);
      const client = getSupabaseUserClient(request.auth!.accessToken);
      await updateAgendamento(client, id, request.auth!.userId, body);
      response.status(204).end();
    } catch (error) {
      next(toAppError(error));
    }
  },
);

/** RF013/RN31: cancela o agendamento ativo — só se faltarem >= 3h para o horário planejado. */
solicitacaoRouter.delete(
  '/:id/agendamento',
  requireProfile('designer'),
  async (request, response, next) => {
    try {
      const { id } = solicitacaoIdParamSchema.parse(request.params);
      const client = getSupabaseUserClient(request.auth!.accessToken);
      await cancelAgendamento(client, id, request.auth!.userId);
      response.status(204).end();
    } catch (error) {
      next(toAppError(error));
    }
  },
);

/** RF014: fallback manual — o designer publicou fora do sistema e registra o resultado. */
solicitacaoRouter.post(
  '/:id/publicacao-manual',
  requireProfile('designer'),
  async (request, response, next) => {
    try {
      const { id } = solicitacaoIdParamSchema.parse(request.params);
      const client = getSupabaseUserClient(request.auth!.accessToken);
      await registrarPublicacaoManual(client, id, request.auth!.userId);
      response.status(204).end();
    } catch (error) {
      next(toAppError(error));
    }
  },
);

/** RF014/item 9.1: dados da publicação concluída (badge) — designer dono ou administrador. */
solicitacaoRouter.get(
  '/:id/publicacao',
  requireProfile('designer', 'administrador'),
  async (request, response, next) => {
    try {
      const { id } = solicitacaoIdParamSchema.parse(request.params);
      const client = getSupabaseUserClient(request.auth!.accessToken);
      const isAdmin = request.profile!.perfil === 'administrador';
      const result = await getPublicacaoDetalhe(client, id, request.auth!.userId, {
        allowAnyDesigner: isAdmin,
      });
      response.status(200).json(result);
    } catch (error) {
      next(toAppError(error));
    }
  },
);

/**
 * Item 9.3: comprovante/print opcional da publicação — só o designer dono,
 * só depois de já estar "Publicado" (validado no service).
 */
solicitacaoRouter.post(
  '/:id/publicacao/comprovante',
  requireProfile('designer'),
  uploadVersaoArteRateLimit,
  (request, response, next) => {
    uploadPublicacaoComprovanteMiddleware(request, response, (error: unknown) => {
      if (error) {
        next(toAppError(error));
        return;
      }
      next();
    });
  },
  async (request, response, next) => {
    try {
      const { id } = solicitacaoIdParamSchema.parse(request.params);
      if (!request.file) {
        throw new ValidationError('Arquivo obrigatório (campo "comprovante").');
      }
      const client = getSupabaseUserClient(request.auth!.accessToken);
      await uploadComprovantePublicacao(client, id, request.auth!.userId, request.file.buffer);
      response.status(204).end();
    } catch (error) {
      next(toAppError(error));
    }
  },
);

/**
 * Melhoria autorizada (item 10 — retry seguro): reenvia o aviso "arte
 * publicada" ao cliente quando a notificação automática falhou. Limite
 * dedicado por designer, mesmo padrão de `/link-avaliacao` — dispara envio a
 * um serviço externo (Meta).
 */
const reenviarNotificacaoPublicacaoRateLimit = rateLimit({
  windowMs: 10 * 60_000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (request) => request.auth?.userId ?? ipKeyGenerator(request.ip ?? 'unknown'),
});

solicitacaoRouter.post(
  '/:id/publicacao/reenviar-notificacao',
  requireProfile('designer'),
  reenviarNotificacaoPublicacaoRateLimit,
  async (request, response, next) => {
    try {
      const { id } = solicitacaoIdParamSchema.parse(request.params);
      const client = getSupabaseUserClient(request.auth!.accessToken);
      await reenviarNotificacaoPublicacao(client, id, request.auth!.userId);
      response.status(204).end();
    } catch (error) {
      next(toAppError(error));
    }
  },
);

/** Item 9.3: URL assinada de curta duração do comprovante — designer dono ou administrador. */
solicitacaoRouter.get(
  '/:id/publicacao/comprovante-url',
  requireProfile('designer', 'administrador'),
  async (request, response, next) => {
    try {
      const { id } = solicitacaoIdParamSchema.parse(request.params);
      const client = getSupabaseUserClient(request.auth!.accessToken);
      const isAdmin = request.profile!.perfil === 'administrador';
      const result = await getComprovanteDownloadUrl(client, id, request.auth!.userId, {
        allowAnyDesigner: isAdmin,
      });
      response.status(200).json(result);
    } catch (error) {
      next(toAppError(error));
    }
  },
);

/**
 * RF016/RN47: somente administrador reatribui solicitação a outro designer.
 */
solicitacaoRouter.patch(
  '/:id/reatribuir',
  requireProfile('administrador'),
  async (request, response, next) => {
    try {
      const { id: idSolicitacao } = solicitacaoIdParamSchema.parse(request.params);
      const input = reassignSolicitacaoSchema.parse(request.body);
      await reassignSolicitacao(request.auth!.userId, idSolicitacao, input);
      response.status(204).end();
    } catch (error) {
      next(toAppError(error));
    }
  },
);
