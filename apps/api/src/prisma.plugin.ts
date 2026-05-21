/**
 * @file prisma.plugin.ts
 * @description Fastify plugin that initialises and decorates the Prisma client.
 *
 * After registration, the Prisma client is available on every Fastify instance
 * and request via `fastify.db` or `request.server.db`.
 *
 * Logging strategy:
 *   We use emit:'stdout' for Prisma logs rather than emit:'event' + $on().
 *   This lets Prisma write structured logs directly without requiring $on()
 *   type casting workarounds that changed between Prisma versions.
 *   In production, only errors are logged. In development, queries are included.
 */

import fp from 'fastify-plugin';
import { PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { logger } from './logger.js';

const isDevelopment = process.env['NODE_ENV'] !== 'production';

/**
 * Single shared Prisma client instance.
 * Module-level to survive plugin re-registration in tests.
 */
const prisma = new PrismaClient({
  log: isDevelopment
    ? [
        { emit: 'stdout', level: 'query' },
        { emit: 'stdout', level: 'warn' },
        { emit: 'stdout', level: 'error' },
      ]
    : [
        { emit: 'stdout', level: 'warn' },
        { emit: 'stdout', level: 'error' },
      ],
});

async function prismaPlugin(fastify: FastifyInstance): Promise<void> {
  await prisma.$connect();
  logger.info('Database connection established');

  fastify.decorate('db', prisma);

  fastify.addHook('onClose', async () => {
    await prisma.$disconnect();
    logger.info('Database connection closed');
  });
}

export default fp(prismaPlugin, { name: 'prisma' });

declare module 'fastify' {
  interface FastifyInstance {
    db: PrismaClient;
  }
}
