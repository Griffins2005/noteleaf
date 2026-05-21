/**
 * @file stream.route.ts
 * @description WebSocket route that proxies real-time audio to NVIDIA NIM ASR.
 *
 * Flow:
 *   1. Browser connects to ws://api/stt/stream
 *   2. Browser sends { type: 'session_start', sessionId, userUuid, languageCode }
 *   3. This route opens a NVIDIA NIM gRPC streaming session via nvidia.stt.service.ts
 *   4. Browser sends { type: 'audio_chunk', data: '<base64 PCM>' } continuously
 *   5. Route forwards audio chunks to NVIDIA NIM
 *   6. NVIDIA NIM emits partial and final transcripts over gRPC
 *   7. Route forwards those events back to the browser as typed messages
 *   8. Browser sends { type: 'session_end' } when recording stops
 *   9. Route closes the NVIDIA NIM session gracefully
 *
 * Security:
 *   - userUuid is validated as a UUID v4 before any session is opened.
 *   - Each WebSocket connection maps to exactly one NVIDIA NIM gRPC session.
 *   - The NVIDIA API key is never sent to or visible from the browser.
 *   - Rate limiting applies at the connection level via @fastify/rate-limit.
 */

import type { FastifyInstance } from 'fastify';
import type { WebSocket } from '@fastify/websocket';
import { z } from 'zod';
import type { ClientToServerWsMessage, ServerToClientWsMessage } from '@noteleaf/shared-types';
import { nvidiaSttService } from '../services/nvidia.stt.service.js';
import { logger } from '../logger.js';

// ─── Validation ───────────────────────────────────────────────────────────────

const sessionStartSchema = z.object({
  type: z.literal('session_start'),
  sessionId: z.string().uuid(),
  userUuid: z.string().uuid(),
  languageCode: z.string().min(2).max(10).default('en-US'),
});

// ─── Helper ───────────────────────────────────────────────────────────────────

function sendToClient(socket: WebSocket, message: ServerToClientWsMessage): void {
  if (socket.readyState === socket.OPEN) {
    socket.send(JSON.stringify(message));
  }
}

// ─── Route plugin ─────────────────────────────────────────────────────────────

export async function sttStreamRoute(fastify: FastifyInstance): Promise<void> {
  fastify.get(
    '/stt/stream',
    { websocket: true },
    (socket: WebSocket) => {
      logger.info('WebSocket client connected to STT proxy');

      // Set after the client sends 'session_start'.
      let sendAudioChunk: ((base64Audio: string) => void) | null = null;
      let closeSession: (() => Promise<void>) | null = null;
      let isSessionOpen = false;

      // ── Incoming message handler ────────────────────────────────────────

      socket.on('message', async (raw: Buffer) => {
        let message: ClientToServerWsMessage;

        try {
          message = JSON.parse(raw.toString()) as ClientToServerWsMessage;
        } catch {
          sendToClient(socket, {
            type: 'error',
            code: 'INVALID_MESSAGE',
            message: 'Message must be valid JSON.',
          });
          return;
        }

        switch (message.type) {

          // ── session_start ───────────────────────────────────────────────
          case 'session_start': {
            if (isSessionOpen) {
              sendToClient(socket, {
                type: 'error',
                code: 'SESSION_ALREADY_OPEN',
                message: 'A session is already open on this connection.',
              });
              return;
            }

            const parsed = sessionStartSchema.safeParse(message);
            if (!parsed.success) {
              sendToClient(socket, {
                type: 'error',
                code: 'INVALID_SESSION_CONFIG',
                message: 'Invalid session_start payload.',
              });
              return;
            }

            const { sessionId, userUuid, languageCode } = parsed.data;

            try {
              const controllers = await nvidiaSttService.startSession({
                clientSocket: socket,
                userUuid,
                sessionId,
                languageCode,
              });

              sendAudioChunk = controllers.sendAudioChunk;
              closeSession = controllers.closeSession;
              isSessionOpen = true;

              logger.info({ sessionId, userUuid }, 'STT proxy session started');
            } catch (err) {
              logger.error({ err }, 'Failed to start NVIDIA NIM session');
              sendToClient(socket, {
                type: 'error',
                code: 'SESSION_START_FAILED',
                message: 'Failed to open speech recognition session. Please try again.',
              });
            }

            break;
          }

          // ── audio_chunk ─────────────────────────────────────────────────
          case 'audio_chunk': {
            if (!isSessionOpen || !sendAudioChunk) {
              // Drop audio chunks silently if no session is open.
              // This can happen during the brief gap between connection and session_start.
              return;
            }

            sendAudioChunk(message.data);
            break;
          }

          // ── session_end ─────────────────────────────────────────────────
          case 'session_end': {
            if (!isSessionOpen || !closeSession) return;

            isSessionOpen = false;
            await closeSession();
            sendAudioChunk = null;
            closeSession = null;

            logger.info('STT proxy session ended by client');
            break;
          }
        }
      });

      // ── Connection close handler ────────────────────────────────────────

      socket.on('close', async () => {
        logger.info('WebSocket client disconnected from STT proxy');

        // If the client disconnects without sending session_end, clean up.
        if (isSessionOpen && closeSession) {
          isSessionOpen = false;
          await closeSession().catch((err: Error) => {
            logger.error({ err }, 'Error closing NVIDIA NIM session on disconnect');
          });
        }
      });

      socket.on('error', (err: Error) => {
        logger.error({ err }, 'WebSocket error on STT proxy connection');
      });
    },
  );
}
