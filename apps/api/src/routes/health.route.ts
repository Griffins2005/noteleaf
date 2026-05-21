/**
 * @file health.route.ts
 * @description GET /api/health — service health check endpoint.
 *
 * Used by:
 *   - Load balancers (AWS ALB, GCP Load Balancer) to determine instance health.
 *   - Uptime monitoring services (Better Uptime, Pingdom).
 *   - CI/CD pipelines to verify deployment success before routing traffic.
 *
 * Returns 200 when all critical services are healthy.
 * Returns 503 when one or more critical services are degraded.
 *
 * The database check is a lightweight $queryRaw('SELECT 1') — fast and
 * non-destructive. NVIDIA NIM is marked 'unknown' since sessions are opened
 * on-demand via gRPC; there is no persistent connection to probe.
 */

import type { FastifyInstance } from 'fastify';
import type { HealthCheckResponse } from '@noteleaf/shared-types';
import { logger } from '../logger.js';

const API_VERSION = process.env['npm_package_version'] ?? '1.0.0';
const startTime = Date.now();

export async function healthRoute(fastify: FastifyInstance): Promise<void> {
  fastify.get('/health', async (_request, reply) => {
    let databaseStatus: 'ok' | 'error' = 'ok';

    try {
      // Lightweight connectivity check — no table scan, no locks.
      await fastify.db.$queryRaw`SELECT 1`;
    } catch (err) {
      logger.error({ err }, 'Health check: database unreachable');
      databaseStatus = 'error';
    }

    const isHealthy = databaseStatus === 'ok';

    const response: HealthCheckResponse = {
      status: isHealthy ? 'ok' : 'degraded',
      version: API_VERSION,
      services: {
        database: databaseStatus,
        // NVIDIA NIM is checked on-demand; no persistent connection to probe.
        nvidia: 'unknown',
      },
      uptime: Math.floor((Date.now() - startTime) / 1000),
    };

    return reply.code(isHealthy ? 200 : 503).send(response);
  });
}
