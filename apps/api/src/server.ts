// Fastify server entry point.
// buildApp() is a factory so tests can spin up the app without binding a port.
// Plugin order matters: security headers → CORS → rate-limit → WebSocket → DB → routes.

import Fastify, { type FastifyError } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import websocket from '@fastify/websocket';
import { logger } from './logger.js';
import prismaPlugin from './prisma.plugin.js';
import { sessionsRoute } from './routes/sessions.route.js';
import { sttStreamRoute } from './routes/stream.route.js';
import { aiSummarizeRoute } from './routes/summarize.route.js';
import { healthRoute } from './routes/health.route.js';
import { identityRoute } from './routes/identity.route.js';
import { chatRoute } from './routes/chat.route.js';
import { authRoute } from './routes/auth.route.js';

/** Creates and configures the Fastify app. Does not start listening. */
export async function buildApp(opts: { disableRateLimit?: boolean } = {}): Promise<ReturnType<typeof Fastify>> {
  const app = Fastify({
    // Use our structured Pino logger throughout Fastify internals.
    loggerInstance: logger as Parameters<typeof Fastify>[0]['loggerInstance'],

    // Expose request IDs for distributed tracing.
    genReqId: () => crypto.randomUUID(),
    requestIdHeader: 'x-request-id',
    requestIdLogLabel: 'requestId',
  });

  // Security headers

  await app.register(helmet, {
    // Content Security Policy is relaxed here — the frontend enforces its own.
    contentSecurityPolicy: false,
  });

  // CORS

  const allowedOrigins = (process.env['ALLOWED_ORIGINS'] ?? 'http://localhost:3003')
    .split(',')
    .map((o) => o.trim());

  await app.register(cors, {
    origin: allowedOrigins,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-request-id'],
    credentials: false,
  });

  // Rate limiting

  if (!opts.disableRateLimit) {
    await app.register(rateLimit, {
      max: Number(process.env['RATE_LIMIT_MAX'] ?? 100),
      timeWindow: Number(process.env['RATE_LIMIT_WINDOW_MS'] ?? 60_000),
      errorResponseBuilder: () => ({
        success: false,
        error: {
          code: 'RATE_LIMITED',
          message: 'Too many requests. Please wait a moment before trying again.',
        },
        timestamp: new Date().toISOString(),
      }),
    });
  }

  // WebSocket

  await app.register(websocket);

  // Database

  await app.register(prismaPlugin);

  // Routes (all under /api prefix)

  await app.register(
    async (apiScope) => {
      await apiScope.register(healthRoute);
      await apiScope.register(authRoute);
      await apiScope.register(sessionsRoute);
      await apiScope.register(aiSummarizeRoute);
      await apiScope.register(sttStreamRoute);
      await apiScope.register(identityRoute);
      await apiScope.register(chatRoute);
    },
    { prefix: '/api' },
  );

  // 404 handler

  app.setNotFoundHandler((_request, reply) => {
    void reply.code(404).send({
      success: false,
      error: { code: 'NOT_FOUND', message: 'The requested endpoint does not exist.' },
      timestamp: new Date().toISOString(),
    });
  });

  // Global error handler

  app.setErrorHandler((error: FastifyError, _request, reply) => {
    logger.error({ err: error }, 'Unhandled route error');

    const isDevelopment = process.env['NODE_ENV'] !== 'production';

    void reply.code(error.statusCode ?? 500).send({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: isDevelopment ? error.message : 'An unexpected error occurred.',
      },
      timestamp: new Date().toISOString(),
    });
  });

  return app;
}


const port = Number(process.env['PORT'] ?? 3001);
const host = '0.0.0.0';

const app = await buildApp();

try {
  await app.listen({ port, host });
  logger.info({ port, host }, `Noteleaf API listening`);
} catch (err) {
  logger.error({ err }, 'Failed to start server');
  process.exit(1);
}
