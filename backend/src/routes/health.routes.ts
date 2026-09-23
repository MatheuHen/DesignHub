import { Router } from 'express';
import {
  geminiConfigStatus,
  instagramConfigStatus,
  supabaseConfigStatus,
  webPushConfigStatus,
  whatsappConfigStatus,
} from '../config/env.js';
import { getInstagramRedirectUri } from '../integrations/instagram/instagramOAuth.js';

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
      webPushVapidKeys: webPushConfigStatus.hasVapidKeys ? 'configured' : 'missing',
      geminiClassifier: geminiConfigStatus.hasApiKey ? 'configured' : 'missing',
      instagramOAuthClient: instagramConfigStatus.hasOAuthClient ? 'configured' : 'missing',
      instagramTokenEncryption: instagramConfigStatus.hasTokenEncryptionKey ? 'configured' : 'missing',
    },
    /**
     * Rodada correções (item 3.1/3.3): valor efetivo do `redirect_uri` enviado
     * à Meta neste ambiente. Não é segredo — o próprio usuário o vê na URL
     * durante o OAuth —, e é exatamente a string que precisa estar cadastrada
     * como "Valid OAuth Redirect URI" no App. Expor aqui permite conferir a
     * correspondência byte a byte sem adivinhar a variável de ambiente.
     */
    instagramOAuthRedirectUri: getInstagramRedirectUri(),
  });
});
