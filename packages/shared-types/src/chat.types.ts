/**
 * @file chat.types.ts
 * @description Types for the "Ask my notes" chat feature.
 *
 * The chatbot is strictly session-scoped: every answer is grounded in
 * the notes and transcript from one recording and must cite exact sources.
 * No answer is allowed without at least one citation.
 */

import type { NoteType } from './note.types.js';

// ─── Citation ─────────────────────────────────────────────────────────────────

export interface ChatCitation {
  /** 1-based index matching the [N] marker in the answer text. */
  index: number;

  /** Whether the source is a classified note or a transcript segment. */
  type: 'note' | 'transcript';

  /** Note metadata — only present when type === 'note'. */
  noteId?:   string;
  noteType?: NoteType;

  /** Transcript metadata — only present when type === 'transcript'. */
  segmentId?: string;
  timeRange?: string;  // e.g. "00:05 – 00:12"

  /** The exact verbatim text from the source. */
  text: string;

  /** Capture time for display, ISO 8601. */
  capturedAt?: string;
}

// ─── Messages ─────────────────────────────────────────────────────────────────

export interface ChatMessage {
  id:         string;
  role:       'user' | 'assistant';
  content:    string;
  citations?: ChatCitation[];
  timestamp:  string;  // ISO 8601
}

// ─── API contract ─────────────────────────────────────────────────────────────

export interface AskNotesRequest {
  question: string;

  /** Notes from the current session, sent by the client. */
  notes: {
    id:          string;
    type:        string;
    content:     string;
    capturedAt:  string;
  }[];

  /** Transcript segments from the current session. */
  transcriptSegments: {
    id:                  string;
    text:                string;
    startOffsetSeconds:  number;
    endOffsetSeconds:    number;
  }[];

  /**
   * Prior turns in this conversation.
   * Sent by the client to provide multi-turn context.
   * Max last 6 turns are used to keep the prompt size bounded.
   */
  history: { role: 'user' | 'assistant'; content: string }[];
}

export interface AskNotesResponse {
  /** The answer text with [N] citation markers inline. */
  answer: string;
  citations: ChatCitation[];
}
