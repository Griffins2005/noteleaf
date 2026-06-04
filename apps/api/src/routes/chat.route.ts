/**
 * @file chat.route.ts
 * @description POST /api/chat/ask — "Ask my notes" session-scoped chatbot.
 *
 * Answers are grounded in notes + transcript sent by the client.
 * Each Q&A turn is appended to session.chat_messages in the database.
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import type { Prisma } from '@prisma/client';
import type { AskNotesRequest, AskNotesResponse, ChatMessage, ApiResponse } from '@noteleaf/shared-types';
import { nvidiaLlmService } from '../services/nvidia.llm.service.js';
import { logger } from '../logger.js';
import { requireAuth } from '../lib/auth.js';

// ─── Validation ───────────────────────────────────────────────────────────────

const askSchema = z.object({
  sessionId: z.string().uuid(),
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

function parseStoredMessages(raw: unknown): ChatMessage[] {
  if (!Array.isArray(raw)) return [];
  return raw as ChatMessage[];
}

// ─── Route ────────────────────────────────────────────────────────────────────

export async function chatRoute(fastify: FastifyInstance): Promise<void> {
  fastify.post<{ Body: AskNotesRequest }>(
    '/chat/ask',
    async (request, reply): Promise<ApiResponse<AskNotesResponse>> => {
      const userUuid = await requireAuth(request, reply);
      if (!userUuid) return reply as unknown as ApiResponse<AskNotesResponse>;

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

      const { sessionId, question, history } = parsed.data;
      const notes = parsed.data.notes.filter((n) => n.content.trim().length > 0);
      const transcriptSegments = parsed.data.transcriptSegments.filter(
        (s) => s.text.trim().length > 0,
      );

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

      const session = await fastify.db.session.findFirst({
        where: { id: sessionId, userUuid },
      });

      if (!session) {
        return reply.code(404).send({
          success: false,
          error: { code: 'SESSION_NOT_FOUND', message: 'Session not found.' },
          timestamp: new Date().toISOString(),
        }) as unknown as ApiResponse<AskNotesResponse>;
      }

      logger.info(
        { userUuid, sessionId, noteCount: notes.length, segmentCount: transcriptSegments.length, question: question.slice(0, 80) },
        'Chat request received',
      );

      try {
        const result = await nvidiaLlmService.chatWithNotes({
          sessionId,
          question,
          notes,
          transcriptSegments,
          history,
        });

        const now = new Date().toISOString();
        const userMsg: ChatMessage = {
          id: uuidv4(),
          role: 'user',
          content: question,
          timestamp: now,
        };
        const assistantMsg: ChatMessage = {
          id: uuidv4(),
          role: 'assistant',
          content: result.answer,
          citations: result.citations,
          timestamp: now,
        };

        const existing = parseStoredMessages(session.chatMessages);
        const chatMessages = [...existing, userMsg, assistantMsg];

        await fastify.db.session.update({
          where: { id: sessionId },
          data: { chatMessages: chatMessages as unknown as Prisma.InputJsonValue },
        });

        return {
          success:   true,
          data:      result,
          timestamp: new Date().toISOString(),
        };
      } catch (err) {
        logger.error({ err, userUuid, sessionId }, 'Chat request failed');
        return reply.code(502).send({
          success: false,
          error: {
            code: 'AI_UNAVAILABLE',
            message: err instanceof Error ? err.message : 'Could not generate an answer. Try again.',
          },
          timestamp: new Date().toISOString(),
        }) as unknown as ApiResponse<AskNotesResponse>;
      }
    },
  );
}
