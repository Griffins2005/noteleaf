/**
 * Sanitize session notes/segments before sending to the API.
 * Filters empty STT noise and aligns client payloads with server validation.
 */

import type { Note, TranscriptSegment } from '@noteleaf/shared-types';

export const SUMMARIZE_EXCERPT_CHARS = 4000;
export const SUMMARIZE_SEGMENT_LIMIT = 40;
export const SUMMARIZE_NOTE_LIMIT = 40;

export function notesForSummarize(notes: Note[]) {
  const cleaned = notes.filter((n) => n.content.trim().length > 0);
  const selected =
    cleaned.length <= SUMMARIZE_NOTE_LIMIT
      ? cleaned
      : [...cleaned.slice(0, 8), ...cleaned.slice(-(SUMMARIZE_NOTE_LIMIT - 8))];

  return selected.map((n) => ({
    type: n.type,
    content: n.content.trim(),
    capturedAt: n.capturedAt,
  }));
}

export function segmentsForSummarize(segments: TranscriptSegment[]) {
  return segments
    .filter((s) => s.text.trim().length > 0)
    .map((s) => ({
      text: s.text.trim(),
      startOffsetSeconds: s.startOffsetSeconds,
      endOffsetSeconds: s.endOffsetSeconds,
    }));
}

/** Keep opening context and the latest discussion when the transcript is long. */
export function excerptTranscript(transcript: string, max = SUMMARIZE_EXCERPT_CHARS): string {
  const t = transcript.trim().replace(/\s+/g, ' ');
  if (t.length <= max) return t;
  const ellipsis = ' … ';
  const budget = max - ellipsis.length;
  const head = Math.floor(budget * 0.4);
  const tail = budget - head;
  return `${t.slice(0, head).trimEnd()}${ellipsis}${t.slice(-tail).trimStart()}`;
}

/** First few segments for setup, last segments for what was actually decided. */
export function selectSegmentsForSummarize(
  segments: TranscriptSegment[],
  max = SUMMARIZE_SEGMENT_LIMIT,
) {
  const cleaned = segmentsForSummarize(segments);
  if (cleaned.length <= max) return cleaned;
  const headCount = Math.min(8, max);
  const tailCount = max - headCount;
  const tailStart = Math.max(headCount, cleaned.length - tailCount);
  return [...cleaned.slice(0, headCount), ...cleaned.slice(tailStart)];
}

/** Always send transcript with notes — auto-tagged notes alone starve the recap. */
export function buildSummarizePayload(
  notes: Note[],
  transcript: string,
  transcriptSegments: TranscriptSegment[],
) {
  return {
    notes: notesForSummarize(notes),
    transcriptExcerpt: excerptTranscript(transcript),
    transcriptSegments: selectSegmentsForSummarize(transcriptSegments),
  };
}

export function notesForChat(notes: Note[]) {
  return notes
    .filter((n) => n.id && n.capturedAt && n.content.trim().length > 0)
    .map((n) => ({
      id: n.id,
      type: n.type,
      content: n.content.trim(),
      capturedAt: n.capturedAt,
    }));
}

export function segmentsForChat(
  segments: TranscriptSegment[],
  options?: {
    /** Partial utterance still being spoken — not yet a finalized segment. */
    liveTranscript?: string;
    /** Full rolling transcript — fallback before first finalized segment. */
    fullTranscript?: string;
    isRecording?: boolean;
  },
) {
  const base = segments
    .filter((s) => s.id && s.text.trim().length > 0)
    .map((s) => ({
      id: s.id,
      text: s.text.trim(),
      startOffsetSeconds: s.startOffsetSeconds,
      endOffsetSeconds: s.endOffsetSeconds,
    }));

  const live = options?.liveTranscript?.trim();
  const full = options?.fullTranscript?.trim();

  if (base.length === 0 && full) {
    base.push({
      id: '__transcript__',
      text: full,
      startOffsetSeconds: 0,
      endOffsetSeconds: 0,
    });
  }

  if (options?.isRecording && live) {
    const lastEnd = base.at(-1)?.endOffsetSeconds ?? 0;
    const alreadyCaptured = base.some(
      (s) => s.text === live || s.text.endsWith(live),
    );
    if (!alreadyCaptured) {
      base.push({
        id: '__live__',
        text: `[In progress] ${live}`,
        startOffsetSeconds: lastEnd,
        endOffsetSeconds: lastEnd,
      });
    }
  }

  return base;
}

export function hasSummarizeContext(
  notes: Note[],
  transcript: string,
  segments: TranscriptSegment[],
): boolean {
  return (
    notesForSummarize(notes).length > 0 ||
    segmentsForSummarize(segments).length > 0 ||
    transcript.trim().length > 0
  );
}

export function hasChatContext(
  notes: Note[],
  segments: TranscriptSegment[],
  options?: {
    liveTranscript?: string;
    fullTranscript?: string;
    isRecording?: boolean;
  },
): boolean {
  return (
    notesForChat(notes).length > 0 ||
    segmentsForChat(segments, options).length > 0
  );
}
