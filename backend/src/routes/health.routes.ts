import { Router } from 'express';
import { supabaseConfigStatus, whatsappConfigStatus } from '../config/env.js';

export const healthRouter = Router();

healthRouter.get('/health', (_request, response) => {
  response.status(200).json({
    status: 'ok',
    service: 'designhub-api',
    dependencies: {
      supabasePublicClient: supabaseConfigStatus.hasPublicClient ? 'configured' : 'missing',
      supabaseAdminClient: supabaseConfigStatus.hasAdminClient ? 'configured' : 'missing',
      whatsappSendingClient: whatsappConfigStatus.hasSendingClient ? 'configured' : 'missing',
      whatsappWebhookSecurity: whatsappConfigStatus.hasWebhookSecurity ? 'configured' : 'missing',
    },
  });
});
