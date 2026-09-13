import { Router } from 'express';
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

designerRouter.post('/', async (request, response, next) => {
  try {
    const input = createDesignerSchema.parse(request.body);
    const designer = await createDesigner(input);
    response.status(201).json(designer);
  } catch (error) {
    next(toAppError(error));
  }
});

designerRouter.patch('/:id', async (request, response, next) => {
  try {
    const { id } = designerIdParamSchema.parse(request.params);
    const input = updateDesignerSchema.parse(request.body);
    await updateDesigner(id, input);
    response.status(204).end();
  } catch (error) {
    next(toAppError(error));
  }
});

designerRouter.patch('/:id/status', async (request, response, next) => {
  try {
    const { id } = designerIdParamSchema.parse(request.params);
    const input = setDesignerStatusSchema.parse(request.body);
    await changeDesignerStatus(id, input.status);
    response.status(204).end();
  } catch (error) {
    next(toAppError(error));
  }
});

/** RF001/item 2.1 (correções 13/09/2026): Admin altera a senha do designer. */
designerRouter.patch('/:id/senha', async (request, response, next) => {
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
 * RF001/item 2.4 (correções 13/09/2026): exclusão física reintroduzida de
 * forma ADITIVA — Ativo/Inativo continua disponível; Excluir é oferecido
 * além disso e respeita impedimentos históricos (ConflictError quando o
 * designer tem cliente/solicitação vinculados).
 */
designerRouter.delete('/:id', async (request, response, next) => {
  try {
    const { id } = designerIdParamSchema.parse(request.params);
    await removeDesigner(request.auth!.userId, id);
    response.status(204).end();
  } catch (error) {
    next(toAppError(error));
  }
});
