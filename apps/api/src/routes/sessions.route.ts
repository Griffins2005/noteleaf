/**
 * @file sessions.route.ts
 * @description Fastify route handlers for Session CRUD operations.
 *
 * All routes require the `x-user-uuid` header for ownership scoping.
 * There is no traditional authentication — UUID possession IS the credential.
 * Rate limiting is applied via the global @fastify/rate-limit plugin.
 *
 * Routes:
 *   GET    /api/sessions          → List all sessions for a UUID (lightweight)
 *   GET    /api/sessions/:id      → Get one full session with notes + summary
 *   POST   /api/sessions          → Create a new session
 *   PATCH  /api/sessions/:id      → Update title, notes, transcript, status
 *   DELETE /api/sessions/:id      → Delete a session and its summary
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { Prisma, SessionStatus as PrismaSessionStatus } from '@prisma/client';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import type {
  CreateSessionRequest,
  UpdateSessionRequest,
  GetSessionsResponse,
  GetSessionResponse,
  CreateSessionResponse,
  UpdateSessionResponse,
  DeleteSessionResponse,
  SessionListItem,
  Session,
} from '@noteleaf/shared-types';
import { logger } from '../logger.js';

// ─── Validation schemas ───────────────────────────────────────────────────────

const uuidSchema = z.string().uuid();

const createSessionSchema = z.object({
  id: z.string().uuid(),
  title: z.string().max(200).default(''),
});

const updateSessionSchema = z.object({
  title: z.string().max(200).optional(),
  notes: z.array(z.unknown()).optional(),
  transcript: z.string().optional(),
  transcriptSegments: z.array(z.unknown()).optional(),
  durationSeconds: z.number().int().nonnegative().optional(),
  status: z.enum(['idle', 'recording', 'stopped', 'summarised']).optional(),
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Reads and validates the x-user-uuid header from a request.
 * Returns the UUID string or throws a 401 FastifyError.
 */
function requireUserUuid(request: FastifyRequest, reply: FastifyReply): string {
  const rawUuid = request.headers['x-user-uuid'];
  const uuid = typeof rawUuid === 'string' ? rawUuid : undefined;
  const result = uuidSchema.safeParse(uuid);

  if (!result.success) {
    void reply.code(401).send({
      success: false,
      error: {
        code: 'MISSING_USER_UUID',
        message: 'A valid x-user-uuid header is required.',
      },
      timestamp: new Date().toISOString(),
    });
    // Return empty string — reply is already sent, route handler should return
    return '';
  }

  return result.data;
}

/**
 * Maps a Prisma session record to the SessionListItem shape.
 */
function toSessionListItem(record: {
  id: string;
  userUuid: string;
  title: string;
  notes: unknown;
  durationSeconds: number;
  status: string;
  aiSummary: { id: string } | null;
  createdAt: Date;
  updatedAt: Date;
}): SessionListItem {
  const notes = Array.isArray(record.notes) ? record.notes : [];
  return {
    id: record.id,
    userUuid: record.userUuid,
    title: record.title,
    noteCount: notes.length,
    durationSeconds: record.durationSeconds,
    status: record.status.toLowerCase() as SessionListItem['status'],
    hasAiSummary: record.aiSummary !== null,
    isCloudOnly: false,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

// ─── Route plugin ─────────────────────────────────────────────────────────────

export async function sessionsRoute(fastify: FastifyInstance): Promise<void> {

  // ── GET /api/sessions ────────────────────────────────────────────────────

  fastify.get('/sessions', async (request, reply): Promise<GetSessionsResponse> => {
    const userUuid = requireUserUuid(request, reply);
    if (!userUuid) return reply as unknown as GetSessionsResponse;

    const records = await fastify.db.session.findMany({
      where: { userUuid },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        userUuid: true,
        title: true,
        notes: true,
        durationSeconds: true,
        status: true,
        aiSummary: { select: { id: true } },
        createdAt: true,
        updatedAt: true,
      },
    });

    const sessions: SessionListItem[] = records.map(toSessionListItem);

    logger.debug({ userUuid, count: sessions.length }, 'Sessions listed');

    return { success: true, data: sessions, timestamp: new Date().toISOString() };
  });

  // ── GET /api/sessions/:id ────────────────────────────────────────────────

  fastify.get<{ Params: { id: string } }>(
    '/sessions/:id',
    async (request, reply): Promise<GetSessionResponse> => {
      const userUuid = requireUserUuid(request, reply);
      if (!userUuid) return reply as unknown as GetSessionResponse;

      const { id } = request.params;

      if (!uuidSchema.safeParse(id).success) {
        return reply.code(400).send({
          success: false,
          error: { code: 'INVALID_SESSION_ID', message: 'Session ID must be a valid UUID.' },
          timestamp: new Date().toISOString(),
        }) as unknown as GetSessionResponse;
      }

      const record = await fastify.db.session.findFirst({
        where: { id, userUuid },
        include: { aiSummary: true },
      });

      if (!record) {
        return reply.code(404).send({
          success: false,
          error: { code: 'SESSION_NOT_FOUND', message: 'Session not found.' },
          timestamp: new Date().toISOString(),
        }) as unknown as GetSessionResponse;
      }

      const session: Session = {
        id: record.id,
        userUuid: record.userUuid,
        title: record.title,
        notes: Array.isArray(record.notes) ? (record.notes as unknown as Session['notes']) : [],
        transcript: record.transcript,
        transcriptSegments: Array.isArray(record.transcriptSegments)
          ? (record.transcriptSegments as unknown as Session['transcriptSegments'])
          : [],
        durationSeconds: record.durationSeconds,
        status: record.status.toLowerCase() as Session['status'],
        createdAt: record.createdAt.toISOString(),
        updatedAt: record.updatedAt.toISOString(),
        ...(record.aiSummary && {
          aiSummary: {
            id: record.aiSummary.id,
            sessionId: record.aiSummary.sessionId,
            overview: record.aiSummary.overview,
            decisions: record.aiSummary.decisions as unknown as string[],
            actionItems: record.aiSummary.actionItems as unknown as string[],
            insights: record.aiSummary.insights as unknown as string[],
            modelUsed: record.aiSummary.modelUsed,
            generatedAt: record.aiSummary.createdAt.toISOString(),
          },
        }),
      };

      return { success: true, data: session, timestamp: new Date().toISOString() };
    },
  );

  // ── POST /api/sessions ───────────────────────────────────────────────────

  fastify.post<{ Body: CreateSessionRequest }>(
    '/sessions',
    async (request, reply): Promise<CreateSessionResponse> => {
      const userUuid = requireUserUuid(request, reply);
      if (!userUuid) return reply as unknown as CreateSessionResponse;

      const parsed = createSessionSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid request body.',
            fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string>,
          },
          timestamp: new Date().toISOString(),
        }) as unknown as CreateSessionResponse;
      }

      const { id, title } = parsed.data;

      const record = await fastify.db.session.create({
        data: {
          id,
          userUuid,
          title,
          notes: [],
          transcript: '',
          transcriptSegments: [],
          durationSeconds: 0,
          status: 'IDLE',
        },
        include: { aiSummary: true },
      });

      logger.info({ sessionId: id, userUuid }, 'Session created');

      const session: Session = {
        id: record.id,
        userUuid: record.userUuid,
        title: record.title,
        notes: [],
        transcript: '',
        transcriptSegments: [],
        durationSeconds: 0,
        status: 'idle',
        createdAt: record.createdAt.toISOString(),
        updatedAt: record.updatedAt.toISOString(),
      };

      return reply.code(201).send({
        success: true,
        data: session,
        timestamp: new Date().toISOString(),
      }) as unknown as CreateSessionResponse;
    },
  );

  // ── PATCH /api/sessions/:id ──────────────────────────────────────────────

  fastify.patch<{ Params: { id: string }; Body: UpdateSessionRequest }>(
    '/sessions/:id',
    async (request, reply): Promise<UpdateSessionResponse> => {
      const userUuid = requireUserUuid(request, reply);
      if (!userUuid) return reply as unknown as UpdateSessionResponse;

      const { id } = request.params;
      const parsed = updateSessionSchema.safeParse(request.body);

      if (!parsed.success) {
        return reply.code(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Invalid update payload.' },
          timestamp: new Date().toISOString(),
        }) as unknown as UpdateSessionResponse;
      }

      // Verify ownership before updating.
      const existing = await fastify.db.session.findFirst({ where: { id, userUuid } });
      if (!existing) {
        return reply.code(404).send({
          success: false,
          error: { code: 'SESSION_NOT_FOUND', message: 'Session not found.' },
          timestamp: new Date().toISOString(),
        }) as unknown as UpdateSessionResponse;
      }

      const { title, notes, transcript, transcriptSegments, durationSeconds, status } = parsed.data;
      const data: Prisma.SessionUpdateInput = {};
      if (title !== undefined) data.title = title;
      if (notes !== undefined) data.notes = notes as Prisma.InputJsonValue;
      if (transcript !== undefined) data.transcript = transcript;
      if (transcriptSegments !== undefined) {
        data.transcriptSegments = transcriptSegments as Prisma.InputJsonValue;
      }
      if (durationSeconds !== undefined) data.durationSeconds = durationSeconds;
      if (status !== undefined) data.status = status.toUpperCase() as PrismaSessionStatus;

      const updated = await fastify.db.session.update({
        where: { id },
        data,
        include: { aiSummary: true },
      });

      logger.info({ sessionId: id, userUuid }, 'Session updated');

      const session: Session = {
        id: updated.id,
        userUuid: updated.userUuid,
        title: updated.title,
        notes: Array.isArray(updated.notes) ? (updated.notes as unknown as Session['notes']) : [],
        transcript: updated.transcript,
        transcriptSegments: Array.isArray(updated.transcriptSegments)
          ? (updated.transcriptSegments as unknown as Session['transcriptSegments'])
          : [],
        durationSeconds: updated.durationSeconds,
        status: updated.status.toLowerCase() as Session['status'],
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
      };

      return { success: true, data: session, timestamp: new Date().toISOString() };
    },
  );

  // ── DELETE /api/sessions/:id ─────────────────────────────────────────────

  fastify.delete<{ Params: { id: string } }>(
    '/sessions/:id',
    async (request, reply): Promise<DeleteSessionResponse> => {
      const userUuid = requireUserUuid(request, reply);
      if (!userUuid) return reply as unknown as DeleteSessionResponse;

      const { id } = request.params;

      const existing = await fastify.db.session.findFirst({ where: { id, userUuid } });
      if (!existing) {
        return reply.code(404).send({
          success: false,
          error: { code: 'SESSION_NOT_FOUND', message: 'Session not found.' },
          timestamp: new Date().toISOString(),
        }) as unknown as DeleteSessionResponse;
      }

      // AiSummary is cascade-deleted via Prisma schema.
      await fastify.db.session.delete({ where: { id } });

      logger.info({ sessionId: id, userUuid }, 'Session deleted');

      return {
        success: true,
        data: { deleted: true },
        timestamp: new Date().toISOString(),
      };
    },
  );
}
