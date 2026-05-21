/**
 * @file useNoteClassifier.ts
 * @description Hook that receives final transcript segments from the STT
 * WebSocket and converts them into classified Note objects.
 *
 * This hook is the bridge between the real-time audio pipeline and the
 * note storage layer. It:
 *   1. Receives a final transcript string (immutable, from NVIDIA NIM).
 *   2. Filters out segments that are too short to be meaningful (< 15 chars).
 *   3. Calls buildNoteFromTranscript() to classify and tag the segment.
 *   4. Calls onNoteCreated() to persist the note to the session store.
 *
 * Debouncing strategy:
 *   NVIDIA NIM emits finals continuously. Short segments like "Mm-hmm" or
 *   "Right" are classified as 'summary' and included — they pad the transcript
 *   but do not mislead. The 15-char minimum filters most non-speech noise.
 *
 * This hook has NO side effects other than calling onNoteCreated.
 * It does not write to state, make network calls, or touch the DOM.
 *
 * Usage:
 *   const { processTranscriptSegment } = useNoteClassifier({
 *     sessionId,
 *     enableTagging: prefs.autoTagKeywords,
 *     onNoteCreated: (note) => dispatch({ type: 'ADD_NOTE', note }),
 *   });
 */

import { useCallback } from 'react';
import type { Note } from '@noteleaf/shared-types';
import { buildNoteFromTranscript } from '@/lib/noteClassifier';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UseNoteClassifierOptions {
  /** The session this classifier is running for. */
  sessionId: string;

  /**
   * Whether to extract keyword tags.
   * Controlled by the user's autoTagKeywords preference.
   */
  enableTagging: boolean;

  /**
   * Called when a new note has been classified and is ready for storage.
   * The caller (typically useRecordingState or a Zustand action) is
   * responsible for persisting the note.
   */
  onNoteCreated: (note: Note) => void;
}

export interface UseNoteClassifierReturn {
  /**
   * Process a finalized transcript segment.
   * Call this from useSTTWebSocket's onFinalTranscript callback.
   *
   * @param text - The immutable final transcript text from NVIDIA NIM.
   * @param sessionOffsetSeconds - Time from session start when this ended.
   * @param confidence - NVIDIA NIM confidence score (0.0–1.0).
   */
  processTranscriptSegment: (
    text: string,
    sessionOffsetSeconds: number,
    confidence: number,
    sessionIdOverride?: string,
  ) => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * Minimum character count for a transcript segment to be classified.
 * Segments shorter than this are filler words or noise and are discarded.
 */
const MIN_SEGMENT_LENGTH = 15;

/**
 * Minimum confidence score from NVIDIA NIM to accept a segment.
 * Segments below this threshold are likely mishearing and are discarded.
 */
const MIN_CONFIDENCE = 0.5;

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useNoteClassifier(options: UseNoteClassifierOptions): UseNoteClassifierReturn {
  const { sessionId, enableTagging, onNoteCreated } = options;

  const processTranscriptSegment = useCallback(
    (text: string, sessionOffsetSeconds: number, confidence: number, sessionIdOverride?: string): void => {
      // Quality gate: discard short, low-confidence, or empty segments.
      if (!text || text.trim().length < MIN_SEGMENT_LENGTH) return;
      if (confidence < MIN_CONFIDENCE) return;

      const targetSessionId = sessionIdOverride ?? sessionId;
      if (!targetSessionId) return;

      const note = buildNoteFromTranscript(
        { transcript: text.trim(), sessionId: targetSessionId, sessionOffsetSeconds },
        enableTagging,
      );

      onNoteCreated(note);
    },
    [sessionId, enableTagging, onNoteCreated],
  );

  return { processTranscriptSegment };
}
