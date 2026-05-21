/**
 * @file chat.route.ts
 * @description POST /api/chat/ask — "Ask my notes" session-scoped chatbot.
 *
 * The client sends all context (notes + transcript) in the request body so this
 * endpoint works for both cloud and local sessions — no DB lookup required.
 * The x-user-uuid header is logged for audit purposes only.
 */

import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { AskNotesRequest, AskNotesResponse } from '@noteleaf/shared-types';
import type { ApiResponse } from '@noteleaf/shared-types';
import { nvidiaLlmService } from '../services/nvidia.llm.service.js';
import { logger } from '../logger.js';

// ─── Validation ───────────────────────────────────────────────────────────────

const askSchema = z.object({
  question: z.string().min(1).max(500),
  notes: z.array(z.object({
    id:         z.string(),
    type:       z.string(),
    content:    z.string().min(1).max(2000),
    capturedAt: z.string(),
  })).max(200),
  transcriptSegments: z.array(z.object({
    id:                 z.string(),
    text:               z.string().min(1).max(2000),
    startOffsetSeconds: z.number().nonnegative(),
    endOffsetSeconds:   z.number().nonnegative(),
  })).max(500),
  history: z.array(z.object({
    role:    z.enum(['user', 'assistant']),
    content: z.string().max(2000),
  })).max(20).default([]),
});

// ─── Route ────────────────────────────────────────────────────────────────────

export async function chatRoute(fastify: FastifyInstance): Promise<void> {
  fastify.post<{ Body: AskNotesRequest }>(
    '/chat/ask',
    async (request: FastifyRequest<{ Body: AskNotesRequest }>, reply): Promise<ApiResponse<AskNotesResponse>> => {
      const uuid = request.headers['x-user-uuid'];

      const parsed = askSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: parsed.error.issues[0]?.message ?? 'Invalid request.',
          },
          timestamp: new Date().toISOString(),
        }) as unknown as ApiResponse<AskNotesResponse>;
      }

      const { question, notes, transcriptSegments, history } = parsed.data;

      if (notes.length === 0 && transcriptSegments.length === 0) {
        return reply.code(400).send({
          success: false,
          error: {
            code: 'NO_CONTEXT',
            message: 'No notes or transcript to chat with. Record a session first.',
          },
          timestamp: new Date().toISOString(),
        }) as unknown as ApiResponse<AskNotesResponse>;
      }

      logger.info(
        { uuid, noteCount: notes.length, segmentCount: transcriptSegments.length, question: question.slice(0, 80) },
        'Chat request received',
      );

      const result = await nvidiaLlmService.chatWithNotes({
        question,
        notes,
        transcriptSegments,
        history,
      });

      return {
        success:   true,
        data:      result,
        timestamp: new Date().toISOString(),
      };
    },
  );
}
