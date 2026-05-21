/**
 * @file session.store.ts
 * @description Zustand store for session and note state.
 *
 * This is the single source of truth for all session data in the frontend.
 * It is consumed by the session feature components and recording hooks.
 *
 * State shape:
 *   - sessions: SessionListItem[] — all sessions for the current user (sidebar list)
 *   - activeSessionId: string | null — which session is currently open
 *   - activeSessionNotes: Note[] — notes for the open session
 *   - activeSessionTranscript: string — accumulated raw transcript
 *
 * Persistence:
 *   - In cloud mode: actions call the sessions API. State is source-of-truth.
 *   - In local mode: state is persisted to localStorage via a middleware layer.
 *     (localStorage sync is handled by the storage feature, not this store.)
 *
 * Why Zustand over Redux:
 *   This store has straightforward update patterns with no complex derived state
 *   that would benefit from Redux's selector memoisation. Zustand gives us
 *   < 50 lines of boilerplate for the same functionality.
 *
 * Why not React Query for this:
 *   Session notes are mutated frequently (every ~3 seconds during recording).
 *   React Query is optimised for server-state that changes infrequently.
 *   The recording hot path needs synchronous state updates — Zustand delivers.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { v4 as uuidv4 } from 'uuid';
import type { Note, Session, SessionListItem, TranscriptSegment } from '@noteleaf/shared-types';
import { idbStorage, deleteSessionData } from '@/lib/localDb';

// ─── State shape ──────────────────────────────────────────────────────────────

interface SessionState {
  /** Lightweight list of all sessions — drives the sidebar. */
  sessions: SessionListItem[];

  /** The ID of the session currently being viewed or recorded. */
  activeSessionId: string | null;

  /** Full notes for the active session. Mutated during recording. */
  activeNotes: Note[];

  /** Accumulating raw transcript for the active session. */
  activeTranscript: string;

  /** Timestamped transcript segments for the active session. */
  activeTranscriptSegments: TranscriptSegment[];

  /** Recording elapsed time in seconds. Driven by a timer in useRecordingState. */
  elapsedSeconds: number;
}

// ─── Actions ──────────────────────────────────────────────────────────────────

interface SessionActions {
  /**
   * Replace the full sessions list (called after fetching from API or localStorage).
   */
  setSessions: (sessions: SessionListItem[]) => void;

  /**
   * Create a new empty session and set it as active.
   * Returns the new session ID so the caller can POST it to the API.
   */
  createSession: (userUuid: string) => string;

  /**
   * Load a session's notes and transcript as the active session.
   * Called when the user clicks a session in the sidebar.
   */
  setActiveSession: (
    sessionId: string,
    notes: Note[],
    transcript: string,
    transcriptSegments?: TranscriptSegment[],
  ) => void;

  /**
   * Append a new note to the active session.
   * Called by useNoteClassifier on each final transcript segment.
   */
  appendNote: (note: Note) => void;

  /**
   * Append a transcript segment to the active session's raw transcript.
   * Called from the STT WebSocket's onFinalTranscript callback.
   */
  appendTranscript: (text: string) => void;

  /** Append a timestamped transcript segment to the active session. */
  appendTranscriptSegment: (segment: TranscriptSegment) => void;

  /**
   * Update the title of the active session.
   */
  setActiveSessionTitle: (title: string) => void;

  /**
   * Set the elapsed recording time.
   */
  setElapsedSeconds: (seconds: number) => void;

  /**
   * Update an existing note's content and/or type.
   * Preserves the original content in `originalContent` the first time
   * the note is edited so corrections can be used as a training signal.
   */
  updateNote: (noteId: string, content: string, type: Note['type']) => void;

  /**
   * Clear all notes from the active session.
   */
  clearActiveSessionNotes: () => void;

  /**
   * Remove a session from the list.
   */
  removeSession: (sessionId: string) => void;
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useSessionStore = create<SessionState & SessionActions>()(
  persist(
    (set, get) => ({
  // ── Initial state ──────────────────────────────────────────────────────

  sessions: [],
  activeSessionId: null,
  activeNotes: [],
  activeTranscript: '',
  activeTranscriptSegments: [],
  elapsedSeconds: 0,

  // ── Actions ────────────────────────────────────────────────────────────

  setSessions: (sessions) => set({ sessions }),

  createSession: (userUuid) => {
    const newId = uuidv4();
    const now = new Date().toISOString();

    const newListItem: SessionListItem = {
      id: newId,
      userUuid,
      title: '',
      noteCount: 0,
      durationSeconds: 0,
      status: 'idle',
      hasAiSummary: false,
      isCloudOnly: false,
      createdAt: now,
      updatedAt: now,
    };

    set((state) => ({
      sessions: [newListItem, ...state.sessions],
      activeSessionId: newId,
      activeNotes: [],
      activeTranscript: '',
      activeTranscriptSegments: [],
      elapsedSeconds: 0,
    }));

    return newId;
  },

  setActiveSession: (sessionId, notes, transcript, transcriptSegments = []) =>
    set({
      activeSessionId: sessionId,
      activeNotes: notes,
      activeTranscript: transcript,
      activeTranscriptSegments: transcriptSegments,
      elapsedSeconds: 0,
    }),

  appendNote: (note) =>
    set((state) => {
      const updatedNotes = [...state.activeNotes, note];

      // Keep the sidebar noteCount in sync without a full refetch.
      const updatedSessions = state.sessions.map((s) =>
        s.id === state.activeSessionId ? { ...s, noteCount: updatedNotes.length } : s,
      );

      return { activeNotes: updatedNotes, sessions: updatedSessions };
    }),

  appendTranscript: (text) =>
    set((state) => ({
      activeTranscript: state.activeTranscript
        ? `${state.activeTranscript} ${text}`
        : text,
    })),

  appendTranscriptSegment: (segment) =>
    set((state) => ({
      activeTranscriptSegments: [...state.activeTranscriptSegments, segment],
    })),

  setActiveSessionTitle: (title) =>
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === state.activeSessionId ? { ...s, title } : s,
      ),
    })),

  setElapsedSeconds: (seconds) => set({ elapsedSeconds: seconds }),

  updateNote: (noteId, content, type) =>
    set((state) => ({
      activeNotes: state.activeNotes.map((n) => {
        if (n.id !== noteId) return n;
        return {
          ...n,
          content,
          type,
          isUserEdited: true,
          originalContent: n.originalContent ?? n.content,
        };
      }),
    })),

  clearActiveSessionNotes: () =>
    set((state) => ({
      activeNotes: [],
      activeTranscript: '',
      activeTranscriptSegments: [],
      sessions: state.sessions.map((s) =>
        s.id === state.activeSessionId ? { ...s, noteCount: 0 } : s,
      ),
    })),

  removeSession: (sessionId) =>
    set((state) => {
      // Also wipe the per-session IndexedDB record (local mode).
      void deleteSessionData(sessionId).catch(() => {});

      const filtered = state.sessions.filter((s) => s.id !== sessionId);
      const isActive = state.activeSessionId === sessionId;
      return {
        sessions: filtered,
        ...(isActive && {
          activeSessionId: filtered[0]?.id ?? null,
          activeNotes: [],
          activeTranscript: '',
          activeTranscriptSegments: [],
        }),
      };
    }),
  }),
  {
    name: 'nl-sessions',
    storage: createJSONStorage(() => idbStorage),
    // Only persist the lightweight sessions list. Full session data
    // (notes, transcript, segments) lives in the 'session-data' IDB store.
    partialize: (state) => ({ sessions: state.sessions }),
  },
));

// ─── Selectors ────────────────────────────────────────────────────────────────

/** Returns the active session's list item from the sidebar data. */
export function selectActiveSessionListItem(
  state: SessionState,
): SessionListItem | undefined {
  return state.sessions.find((s) => s.id === state.activeSessionId);
}
