import { Router } from 'express';
import { getSupabaseUserClient } from '../config/supabase.js';
import { toAppError } from '../lib/errors.js';
import { attachProfile, requireAuth, requireProfile } from '../middleware/auth.js';
import {
  clienteIdParamSchema,
  createClienteSchema,
  listClientesQuerySchema,
  updateClienteSchema,
} from '../schemas/cliente.schemas.js';
import { iniciarAtendimento } from '../services/atendimento.service.js';
import {
  createCliente,
  getCliente,
  listClientes,
  removeCliente,
  updateCliente,
} from '../services/cliente.service.js';
import {
  gerarAutorizacaoInstagramUrl,
  getInstagramStatus,
  removerInstagramConexao,
} from '../services/clienteInstagram.service.js';

export const clienteRouter = Router();

/** RF003: cadastro/gestão de clientes é responsabilidade do Designer. */
clienteRouter.use(requireAuth, attachProfile, requireProfile('designer'));

clienteRouter.get('/', async (request, response, next) => {
  try {
    const query = listClientesQuerySchema.parse(request.query);
    const client = getSupabaseUserClient(request.auth!.accessToken);
    const result = await listClientes(client, query);
    response.status(200).json(result);
  } catch (error) {
    next(toAppError(error));
  }
});

clienteRouter.get('/:id', async (request, response, next) => {
  try {
    const { id } = clienteIdParamSchema.parse(request.params);
    const client = getSupabaseUserClient(request.auth!.accessToken);
    const cliente = await getCliente(client, id);
    response.status(200).json(cliente);
  } catch (error) {
    next(toAppError(error));
  }
});

clienteRouter.post('/', async (request, response, next) => {
  try {
    const input = createClienteSchema.parse(request.body);
    const cliente = await createCliente(request.auth!.userId, input);
    response.status(201).json(cliente);
  } catch (error) {
    next(toAppError(error));
  }
});

clienteRouter.patch('/:id', async (request, response, next) => {
  try {
    const { id } = clienteIdParamSchema.parse(request.params);
    const input = updateClienteSchema.parse(request.body);
    const client = getSupabaseUserClient(request.auth!.accessToken);
    await updateCliente(client, id, input);
    response.status(204).end();
  } catch (error) {
    next(toAppError(error));
  }
});

/** RF004/RN02/RN03: designer inicia o atendimento estruturado no WhatsApp. */
clienteRouter.post('/:id/atendimentos', async (request, response, next) => {
  try {
    const { id } = clienteIdParamSchema.parse(request.params);
    const client = getSupabaseUserClient(request.auth!.accessToken);
    const result = await iniciarAtendimento(client, request.auth!.userId, id);
    response.status(201).json(result);
  } catch (error) {
    next(toAppError(error));
  }
});

/** RF014/ADR 0005: designer inicia a conexão do Instagram deste cliente específico. */
clienteRouter.post('/:id/instagram/authorize-url', async (request, response, next) => {
  try {
    const { id } = clienteIdParamSchema.parse(request.params);
    const client = getSupabaseUserClient(request.auth!.accessToken);
    const result = await gerarAutorizacaoInstagramUrl(client, id, request.auth!.userId);
    response.status(200).json(result);
  } catch (error) {
    next(toAppError(error));
  }
});

/** RF014: status de conexão do Instagram deste cliente — nunca o token. */
clienteRouter.get('/:id/instagram/status', async (request, response, next) => {
  try {
    const { id } = clienteIdParamSchema.parse(request.params);
    const client = getSupabaseUserClient(request.auth!.accessToken);
    const result = await getInstagramStatus(client, id);
    response.status(200).json(result);
  } catch (error) {
    next(toAppError(error));
  }
});

/** RF014: designer desconecta o Instagram deste cliente. */
clienteRouter.delete('/:id/instagram/conexao', async (request, response, next) => {
  try {
    const { id } = clienteIdParamSchema.parse(request.params);
    const client = getSupabaseUserClient(request.auth!.accessToken);
    await removerInstagramConexao(client, id);
    response.status(204).end();
  } catch (error) {
    next(toAppError(error));
  }
});

clienteRouter.delete('/:id', async (request, response, next) => {
  try {
    const { id } = clienteIdParamSchema.parse(request.params);
    const client = getSupabaseUserClient(request.auth!.accessToken);
    await removeCliente(client, id);
    response.status(204).end();
  } catch (error) {
    next(toAppError(error));
  }
});
