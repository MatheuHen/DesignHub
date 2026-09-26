import { Router } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { getSupabaseUserClient } from '../config/supabase.js';
import { toAppError } from '../lib/errors.js';
import { attachProfile, requireAuth, requireProfile } from '../middleware/auth.js';
import {
  changeDesignerPasswordSchema,
  createDesignerSchema,
  designerIdParamSchema,
  listDesignersQuerySchema,
  setDesignerStatusSchema,
  updateDesignerSchema,
} from '../schemas/designer.schemas.js';
import {
  changeDesignerPassword,
  changeDesignerStatus,
  createDesigner,
  getDesigner,
  listDesigners,
  listPendenciasDesigner,
  removeDesigner,
  updateDesigner,
} from '../services/designer.service.js';

export const designerRouter = Router();

/** RF001/RF015: toda a área de gestão de designers é exclusiva do Administrador. */
designerRouter.use(requireAuth, attachProfile, requireProfile('administrador'));

designerRouter.get('/', async (request, response, next) => {
  try {
    const query = listDesignersQuerySchema.parse(request.query);
    const client = getSupabaseUserClient(request.auth!.accessToken);
    const result = await listDesigners(client, query);
    response.status(200).json(result);
  } catch (error) {
    next(toAppError(error));
  }
});

designerRouter.get('/:id', async (request, response, next) => {
  try {
    const { id } = designerIdParamSchema.parse(request.params);
    const client = getSupabaseUserClient(request.auth!.accessToken);
    const designer = await getDesigner(client, id);
    response.status(200).json(designer);
  } catch (error) {
    next(toAppError(error));
  }
});

/**
 * Auditoria (seção 12.3): sem limite dedicado, um token de administrador
 * comprometido poderia automatizar criação em massa de contas
 * (`auth.admin.createUser`) ou girar senhas de todos os designers rapidamente
 * (`/:id/senha` abaixo) — mesmo padrão de limite por usuário já usado no
 * restante do backend.
 */
const designerAdminRateLimit = rateLimit({
  windowMs: 10 * 60_000,
  limit: 15,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (request) => request.auth?.userId ?? ipKeyGenerator(request.ip ?? 'unknown'),
});

designerRouter.post('/', designerAdminRateLimit, async (request, response, next) => {
  try {
    const input = createDesignerSchema.parse(request.body);
    const designer = await createDesigner(input);
    response.status(201).json(designer);
  } catch (error) {
    next(toAppError(error));
  }
});

designerRouter.patch('/:id', designerAdminRateLimit, async (request, response, next) => {
  try {
    const { id } = designerIdParamSchema.parse(request.params);
    const input = updateDesignerSchema.parse(request.body);
    await updateDesigner(id, input);
    response.status(204).end();
  } catch (error) {
    next(toAppError(error));
  }
});

/**
 * Item 4 (rodada final): pendências (estados não terminais) de um designer —
 * usada tanto para o Admin decidir a estratégia de inativação quanto para
 * revisar depois um designer que ficou "inativo mesmo assim" com pendências.
 */
designerRouter.get('/:id/pendencias', async (request, response, next) => {
  try {
    const { id } = designerIdParamSchema.parse(request.params);
    const pendencias = await listPendenciasDesigner(id);
    response.status(200).json({ items: pendencias });
  } catch (error) {
    next(toAppError(error));
  }
});

designerRouter.patch('/:id/status', designerAdminRateLimit, async (request, response, next) => {
  try {
    const { id } = designerIdParamSchema.parse(request.params);
    const input = setDesignerStatusSchema.parse(request.body);
    const result = await changeDesignerStatus(request.auth!.userId, id, input);
    if (result.pendencias) {
      response.status(409).json({
        error: 'DESIGNER_PENDENCIAS',
        message:
          'Este designer possui solicitações pendentes. Escolha uma estratégia (cancelar, reatribuir ou inativar mesmo assim) para continuar.',
        pendencias: result.pendencias,
      });
      return;
    }
    response.status(204).end();
  } catch (error) {
    next(toAppError(error));
  }
});

/** RF001/item 2.1 (correções 13/09/2026): Admin altera a senha do designer. */
designerRouter.patch('/:id/senha', designerAdminRateLimit, async (request, response, next) => {
  try {
    const { id } = designerIdParamSchema.parse(request.params);
    const input = changeDesignerPasswordSchema.parse(request.body);
    await changeDesignerPassword(request.auth!.userId, id, input.novaSenha);
    response.status(204).end();
  } catch (error) {
    next(toAppError(error));
  }
});

/**
 * RF001 (rodada correções): o botão "Excluir" da interface passou a executar
 * inativação lógica (PATCH /:id/status) para preservar histórico sem exigir
 * reatribuição prévia. Este DELETE físico não é mais chamado pelo frontend —
 * mantido porque RF001 exige "exclusão" como capacidade distinta de
 * "inativação" (ainda respeita impedimentos históricos via ConflictError),
 * disponível como operação administrativa de baixo nível, não exposta na
 * operação comum. Item 17 (auditoria de segurança): limite de taxa dedicado
 * aplicado por ser uma operação irreversível de alto impacto.
 */
designerRouter.delete('/:id', designerAdminRateLimit, async (request, response, next) => {
  try {
    const { id } = designerIdParamSchema.parse(request.params);
    await removeDesigner(request.auth!.userId, id);
    response.status(204).end();
  } catch (error) {
    next(toAppError(error));
  }
});
