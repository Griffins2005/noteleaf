/**
 * @file summarize.route.ts
 * @description POST /api/ai/summarize — generates an AI summary for a session.
 *
 * This route:
 *   1. Validates the request payload (session ownership + content)
 *   2. Calls nvidiaLlmService.summariseSession() to generate a structured summary
 *   3. Persists the AiSummary to the database and updates the session status
 *   4. Returns the summary to the client
 *
 * The NVIDIA API key is kept server-side. The browser never sees it.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import type { SummarizeRequest, SummarizeResponse } from '@noteleaf/shared-types';
import { nvidiaLlmService } from '../services/nvidia.llm.service.js';
import { logger } from '../logger.js';

// ─── Validation ───────────────────────────────────────────────────────────────

const summarizeSchema = z.object({
  sessionId: z.string().uuid(),
  notes: z.array(
    z.object({
      type: z.enum(['action', 'decision', 'insight', 'summary']),
      content: z.string().min(1).max(2000),
      capturedAt: z.string(),
    }),
  ).min(1, 'At least one note is required to generate a summary.'),
  transcriptExcerpt: z.string().max(1500).default(''),
  transcriptSegments: z.array(
    z.object({
      text: z.string().min(1).max(2000),
      startOffsetSeconds: z.number().nonnegative(),
      endOffsetSeconds: z.number().nonnegative(),
    }),
  ).optional(),
  sessionTitle: z.string().max(200).optional(),
});

// ─── Helper ───────────────────────────────────────────────────────────────────

function requireUserUuid(request: FastifyRequest, reply: FastifyReply): string {
  const rawUuid = request.headers['x-user-uuid'];
  const uuid = typeof rawUuid === 'string' ? rawUuid : undefined;

  if (!uuid || !/^[0-9a-f-]{36}$/.test(uuid)) {
    void reply.code(401).send({
      success: false,
      error: { code: 'MISSING_USER_UUID', message: 'A valid x-user-uuid header is required.' },
      timestamp: new Date().toISOString(),
    });
    return '';
  }
  return uuid;
}

// ─── Route plugin ─────────────────────────────────────────────────────────────

export async function aiSummarizeRoute(fastify: FastifyInstance): Promise<void> {
  fastify.post<{ Body: SummarizeRequest }>(
    '/ai/summarize',
    async (request, reply): Promise<SummarizeResponse> => {
      const userUuid = requireUserUuid(request, reply);
      if (!userUuid) return reply as unknown as SummarizeResponse;

      const parsed = summarizeSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: parsed.error.issues[0]?.message ?? 'Invalid request body.',
          },
          timestamp: new Date().toISOString(),
        }) as unknown as SummarizeResponse;
      }

      const { sessionId, notes, transcriptExcerpt, transcriptSegments, sessionTitle } = parsed.data;

      // Verify the session belongs to this user before summarising.
      const session = await fastify.db.session.findFirst({
        where: { id: sessionId, userUuid },
      });

      if (!session) {
        return reply.code(404).send({
          success: false,
          error: { code: 'SESSION_NOT_FOUND', message: 'Session not found.' },
          timestamp: new Date().toISOString(),
        }) as unknown as SummarizeResponse;
      }

      const summary = await nvidiaLlmService.summariseSession({
        sessionId,
        notes,
        transcriptExcerpt,
        ...(transcriptSegments !== undefined && { transcriptSegments }),
        ...(sessionTitle !== undefined && { sessionTitle }),
      });

      // Persist the summary and update the session status atomically.
      await fastify.db.$transaction([
        // Upsert: if a summary already exists for this session, replace it.
        fastify.db.aiSummary.upsert({
          where: { sessionId },
          create: {
            id: summary.id,
            sessionId,
            overview: summary.overview,
            decisions: summary.decisions,
            actionItems: summary.actionItems,
            insights: summary.insights,
            modelUsed: summary.modelUsed,
          },
          update: {
            id: uuidv4(),  // New ID on regeneration
            overview: summary.overview,
            decisions: summary.decisions,
            actionItems: summary.actionItems,
            insights: summary.insights,
            modelUsed: summary.modelUsed,
          },
        }),
        // Mark the session as summarised.
        fastify.db.session.update({
          where: { id: sessionId },
          data: { status: 'SUMMARISED' },
        }),
      ]);

      logger.info(
        { sessionId, userUuid, summaryId: summary.id },
        'AI summary persisted to database',
      );

      return {
        success: true,
        data: summary,
        timestamp: new Date().toISOString(),
      };
    },
  );
}
