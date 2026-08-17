import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { env } from './config/env.js';
import { errorHandler } from './middleware/error-handler.js';
import { agendamentoRouter } from './routes/agendamento.routes.js';
import { authRouter } from './routes/auth.routes.js';
import { avaliacaoRouter } from './routes/avaliacao.routes.js';
import { clienteRouter } from './routes/cliente.routes.js';
import { designerRouter } from './routes/designer.routes.js';
import { healthRouter } from './routes/health.routes.js';
import { internalPublicacaoRouter } from './routes/internalPublicacao.routes.js';
import { solicitacaoRouter } from './routes/solicitacao.routes.js';
import { whatsappRouter } from './routes/whatsapp.routes.js';

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.use(helmet());
  app.use(
    cors({
      origin: env.FRONTEND_URL,
      credentials: true,
    }),
  );
  app.use(
    express.json({
      // Todos os payloads JSON da API (incluindo o webhook público) são
      // objetos pequenos — uploads de arquivo (Fase 8) usam um mecanismo
      // fora do body JSON. Limite conservador reduz a superfície da rota
      // pública do webhook (seção 12.3).
      limit: '256kb',
      // Necessário para validar a assinatura HMAC do webhook Meta
      // (X-Hub-Signature-256), que precisa do corpo bruto, não do JSON
      // já parseado (seção 12.3).
      verify: (request: express.Request, _response, buffer) => {
        request.rawBody = Buffer.from(buffer);
      },
    }),
  );
  app.use(
    rateLimit({
      windowMs: 60_000,
      limit: 120,
      standardHeaders: true,
      legacyHeaders: false,
    }),
  );

  app.use('/api', healthRouter);
  app.use('/api/auth', authRouter);
  app.use('/api/designers', designerRouter);
  app.use('/api/clientes', clienteRouter);
  app.use('/api/solicitacoes', solicitacaoRouter);
  app.use('/api/agendamentos', agendamentoRouter);
  app.use('/api/avaliacao', avaliacaoRouter);
  app.use('/api/webhooks/whatsapp', whatsappRouter);
  app.use('/api/internal/publicacoes', internalPublicacaoRouter);

  app.use((_request, response) => {
    response.status(404).json({
      error: 'NOT_FOUND',
      message: 'Rota não encontrada.',
    });
  });

  app.use(errorHandler);

  return app;
}
