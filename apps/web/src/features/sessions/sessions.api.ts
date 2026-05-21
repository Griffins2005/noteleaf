/**
 * @file sessions.api.ts
 * @description Service layer for all session-related API calls.
 *
 * Each function maps to one API endpoint. Functions are pure — they make
 * a network call and return typed data. No side effects, no state mutations.
 *
 * State mutations (updating the Zustand store) are the caller's responsibility,
 * typically done inside a React Query mutation's onSuccess callback.
 *
 * Usage with React Query:
 *   const { mutate: createSession } = useMutation({
 *     mutationFn: (payload) => sessionsApi.create(payload),
 *     onSuccess: (session) => sessionStore.setActiveSession(session.id, [], ''),
 *   });
 */

import { http } from '@/lib/http.client';
import type {
  Session,
  SessionListItem,
  CreateSessionRequest,
  UpdateSessionPayload,
  Note,
} from '@noteleaf/shared-types';

// ─── API service ──────────────────────────────────────────────────────────────

export const sessionsApi = {
  /**
   * Fetch all sessions for the current user (lightweight list view).
   * Used to populate the sidebar.
   */
  list: (): Promise<SessionListItem[]> =>
    http.get<SessionListItem[]>('/api/sessions'),

  /**
   * Fetch a single session with all notes and AI summary.
   * Called when the user clicks a session in the sidebar.
   */
  get: (sessionId: string): Promise<Session> =>
    http.get<Session>(`/api/sessions/${sessionId}`),

  /**
   * Create a new session on the server.
   * The client pre-generates the UUID so it can be stored locally
   * before the server confirms creation.
   */
  create: (payload: CreateSessionRequest): Promise<Session> =>
    http.post<Session>('/api/sessions', payload),

  /**
   * Partial update — called after recording stops to persist
   * notes, transcript, duration, and status.
   */
  update: (sessionId: string, payload: UpdateSessionPayload): Promise<Session> =>
    http.patch<Session>(`/api/sessions/${sessionId}`, payload),

  /**
   * Delete a session and its associated AI summary.
   */
  delete: (sessionId: string): Promise<{ deleted: true }> =>
    http.delete<{ deleted: true }>(`/api/sessions/${sessionId}`),

  /**
   * Append notes to a session.
   * Can be called incrementally during recording for near-real-time persistence.
   */
  addNotes: (sessionId: string, notes: Note[]): Promise<Note[]> =>
    http.post<Note[]>(`/api/sessions/${sessionId}/notes`, { notes }),
};
