import type { Note } from './note.types.js';

// A Session is one continuous recording.
// Lifecycle: idle → recording → stopped → summarised

export type SessionStatus = 'idle' | 'recording' | 'stopped' | 'summarised';

export interface AiSummary {
  id:          string;
  sessionId:   string;
  overview:    string;
  decisions:   string[];
  actionItems: string[];
  insights:    string[];
  modelUsed:   string;
  generatedAt: string;
}

export interface TranscriptSegment {
  id:                 string;
  sessionId:          string;
  text:               string;
  capturedAt:         string;
  startOffsetSeconds: number;
  endOffsetSeconds:   number;
  confidence:         number;
}

export interface Session {
  id:                 string;
  userUuid:           string;
  title:              string;
  notes:              Note[];
  transcript:         string;
  transcriptSegments: TranscriptSegment[];
  durationSeconds:    number;
  aiSummary?:         AiSummary;
  status:             SessionStatus;
  createdAt:          string;
  updatedAt:          string;
}

// Lightweight projection used in the sidebar session list.
export interface SessionListItem {
  id:              string;
  userUuid:        string;
  title:           string;
  noteCount:       number;
  durationSeconds: number;
  status:          SessionStatus;
  hasAiSummary:    boolean;
  createdAt:       string;
  updatedAt:       string;
}

export interface CreateSessionPayload {
  id:       string;
  userUuid: string;
  title:    string;
}

export interface UpdateSessionPayload {
  title?:              string;
  notes?:              Note[];
  transcript?:         string;
  transcriptSegments?: TranscriptSegment[];
  durationSeconds?:    number;
  status?:             SessionStatus;
  aiSummary?:          AiSummary;
}
