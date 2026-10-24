/**
 * @file api.types.ts
 * @description API request and response contract types.
 *
 * These types are the contract between apps/web and apps/api.
 * Any change here must be reflected in both the Fastify route handler
 * and the frontend service that calls it.
 *
 * Naming convention:
 *   - Request bodies: `[Action][Resource]Request`
 *   - Response bodies: `[Action][Resource]Response`
 *   - The API always returns `ApiResponse<T>` as the envelope.
 */

import type { Session, SessionListItem, AiSummary, TranscriptSegment, UpdateSessionPayload } from './session.types.js';
import type { Note, NoteType } from './note.types.js';

// ─── Response envelope ────────────────────────────────────────────────────────

/**
 * Standard API response wrapper.
 * Every endpoint returns this shape — consumers can always check `success`
 * before accessing `data` or `error`.
 */
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: ApiError;
  /** ISO 8601 timestamp of when the response was generated. */
  timestamp: string;
}

/**
 * Structured error payload returned when `success === false`.
 */
export interface ApiError {
  /** Machine-readable error code. e.g. 'SESSION_NOT_FOUND', 'RATE_LIMITED' */
  code: string;
  /** Human-readable error message. Safe to display to users. */
  message: string;
  /** Optional field-level validation errors (form validation failures). */
  fieldErrors?: Record<string, string>;
}

// ─── Sessions API ─────────────────────────────────────────────────────────────

/** GET /api/sessions — returns all sessions for a UUID */
export type GetSessionsResponse = ApiResponse<SessionListItem[]>;

/** GET /api/sessions/:id — returns a single full session */
export type GetSessionResponse = ApiResponse<Session>;

/** POST /api/sessions — creates a new session */
export interface CreateSessionRequest {
  /** Pre-generated UUID v4 from the client. */
  id: string;
  title: string;
}
export type CreateSessionResponse = ApiResponse<Session>;

/** PATCH /api/sessions/:id — partial update after recording stops */
export type UpdateSessionRequest = UpdateSessionPayload;
export type UpdateSessionResponse = ApiResponse<Session>;

/** DELETE /api/sessions/:id */
export type DeleteSessionResponse = ApiResponse<{ deleted: true }>;

// ─── Notes API ────────────────────────────────────────────────────────────────

/** POST /api/sessions/:id/notes — append notes to a session */
export interface AddNotesRequest {
  notes: Note[];
}
export type AddNotesResponse = ApiResponse<Note[]>;

// ─── AI summarize API ─────────────────────────────────────────────────────────

/** A category fix for a note that already exists. The note id does not change. */
export interface NoteTypeCorrection {
  id: string;
  type: NoteType;
}

/** Owner and deadline for a note that is a real task. Null means it was not said. */
export interface NoteCommitmentUpdate {
  id: string;
  owner: string | null;
  deadline: string | null;
}

/** POST /api/ai/summarize — generate an AI summary for a session */
export interface SummarizeRequest {
  sessionId: string;
  /** Notes in meeting order. id lets the recap correct a category in place. */
  notes: Array<Pick<Note, 'type' | 'content' | 'capturedAt'> & { id?: string }>;
  /** Full transcript when it fits. Empty when timed segments already carry it. */
  transcriptExcerpt: string;
  /** Timestamped transcript lines in meeting order. */
  transcriptSegments?: Pick<TranscriptSegment, 'text' | 'startOffsetSeconds' | 'endOffsetSeconds'>[];
  /** The session title, if set. Provides context for the summary overview. */
  sessionTitle?: string;
}

export interface SummarizeResult extends AiSummary {
  /** Categories corrected from the transcript. Empty when the live tags were kept. */
  noteCorrections: NoteTypeCorrection[];
  /** Tasks found on existing notes. Empty when none were named. */
  commitments: NoteCommitmentUpdate[];
}

export type SummarizeResponse = ApiResponse<SummarizeResult>;

// ─── STT WebSocket messages ───────────────────────────────────────────────────

/**
 * Messages sent FROM the client TO the Noteleaf API WebSocket proxy.
 * The proxy forwards audio chunks to NVIDIA NIM via gRPC.
 */
export type ClientToServerWsMessage =
  | {
      type: 'session_start';
      sessionId: string;
      userUuid: string;
      languageCode: string;
      /** Milliseconds of audio already finalized before this socket. Zero on the first connection. */
      audioOffsetMs?: number;
    }
  | { type: 'audio_chunk'; data: string }   // base64-encoded PCM audio
  | { type: 'session_end' };

/**
 * Messages sent FROM the Noteleaf API WebSocket proxy TO the client.
 * Derived from NVIDIA NIM gRPC StreamingRecognizeResponse events.
 */
export type ServerToClientWsMessage =
  | { type: 'session_ready' }
  | { type: 'partial_transcript'; text: string; audioStart: number }
  | {
      type: 'final_transcript';
      text: string;
      audioStart: number;
      audioEnd: number;
      confidence: number;
    }
  | { type: 'session_ended'; durationMs: number }
  | { type: 'error'; code: string; message: string };

// ─── Health check ─────────────────────────────────────────────────────────────

/** GET /api/health */
export interface HealthCheckResponse {
  status: 'ok' | 'degraded';
  version: string;
  services: {
    database: 'ok' | 'error';
    nvidia: 'ok' | 'error' | 'unknown';
  };
  uptime: number;
}
