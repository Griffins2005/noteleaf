// Session store — in-memory only. Holds the session list and the active session's
// notes/transcript. React Query is the source of truth for persisted data; this
// store holds optimistic state during and immediately after recording.

import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import type { Note, SessionListItem, TranscriptSegment } from '@noteleaf/shared-types';

interface SessionState {
  sessions: SessionListItem[];
  activeSessionId: string | null;
  activeNotes: Note[];
  activeTranscript: string;
  activeTranscriptSegments: TranscriptSegment[];
  elapsedSeconds: number;
}


interface SessionActions {
  setSessions: (sessions: SessionListItem[]) => void;
  createSession: (userUuid: string) => string;
  setActiveSession: (
    sessionId: string,
    notes: Note[],
    transcript: string,
    transcriptSegments?: TranscriptSegment[],
    meta?: Partial<SessionListItem>,
  ) => void;
  appendNote: (note: Note) => void;
  appendTranscript: (text: string) => void;
  appendTranscriptSegment: (segment: TranscriptSegment) => void;
  setActiveSessionTitle: (title: string) => void;
  setElapsedSeconds: (seconds: number) => void;
  updateNote: (noteId: string, content: string, type: Note['type']) => void;
  clearActiveSessionNotes: () => void;
  removeSession: (sessionId: string) => void;
}


export const useSessionStore = create<SessionState & SessionActions>()((set) => ({
  sessions: [],
  activeSessionId: null,
  activeNotes: [],
  activeTranscript: '',
  activeTranscriptSegments: [],
  elapsedSeconds: 0,

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

  setActiveSession: (sessionId, notes, transcript, transcriptSegments = [], meta) =>
    set((state) => {
      const existing = state.sessions.find((s) => s.id === sessionId);
      const now = new Date().toISOString();
      const updatedListItem: SessionListItem = {
        id: sessionId,
        userUuid: meta?.userUuid ?? existing?.userUuid ?? '',
        title: meta?.title ?? existing?.title ?? '',
        noteCount: notes.length,
        durationSeconds: meta?.durationSeconds ?? existing?.durationSeconds ?? 0,
        status: meta?.status ?? existing?.status ?? 'idle',
        hasAiSummary: meta?.hasAiSummary ?? existing?.hasAiSummary ?? false,
        createdAt: meta?.createdAt ?? existing?.createdAt ?? now,
        updatedAt: meta?.updatedAt ?? now,
      };

      const sessions = existing
        ? state.sessions.map((s) => (s.id === sessionId ? { ...s, ...updatedListItem } : s))
        : [updatedListItem, ...state.sessions];

      return {
        activeSessionId: sessionId,
        activeNotes: notes,
        activeTranscript: transcript,
        activeTranscriptSegments: transcriptSegments,
        elapsedSeconds: 0,
        sessions,
      };
    }),

  appendNote: (note) =>
    set((state) => {
      const updatedNotes = [...state.activeNotes, note];
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
}));


export function selectActiveSessionListItem(
  state: SessionState,
): SessionListItem | undefined {
  return state.sessions.find((s) => s.id === state.activeSessionId);
}
