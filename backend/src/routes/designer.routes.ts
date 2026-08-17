import { Router } from 'express';
import { getSupabaseUserClient } from '../config/supabase.js';
import { toAppError } from '../lib/errors.js';
import { attachProfile, requireAuth, requireProfile } from '../middleware/auth.js';
import {
  createDesignerSchema,
  designerIdParamSchema,
  listDesignersQuerySchema,
  setDesignerStatusSchema,
  updateDesignerSchema,
} from '../schemas/designer.schemas.js';
import {
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

designerRouter.delete('/:id', async (request, response, next) => {
  try {
    const { id } = designerIdParamSchema.parse(request.params);
    await removeDesigner(id);
    response.status(204).end();
  } catch (error) {
    next(toAppError(error));
  }
});
