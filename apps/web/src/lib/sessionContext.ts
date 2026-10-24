/**
 * Sanitize session notes/segments before sending to the API.
 * Filters empty STT noise and aligns client payloads with server validation.
 */

import type { Note, TranscriptSegment } from '@noteleaf/shared-types';
import { hasEnoughSessionContent, isFillerSpeech } from './speechQuality';

export const SUMMARIZE_EXCERPT_CHARS = 100_000;
export const SUMMARIZE_SEGMENT_LIMIT = 500;
export const SUMMARIZE_NOTE_LIMIT = 500;

/** Under the cap, keep every item in order. Over it, sample across the whole list. */
export function takeAcross<T>(items: T[], max: number): T[] {
  if (max < 1) return [];
  if (items.length <= max) return items;

  const selected: T[] = [];
  const used = new Set<number>();
  const step = (items.length - 1) / Math.max(max - 1, 1);

  for (let i = 0; i < max; i++) {
    const index = Math.min(items.length - 1, Math.round(i * step));
    if (used.has(index)) continue;
    used.add(index);
    const item = items[index];
    if (item !== undefined) selected.push(item);
  }

  return selected;
}

export function notesForSummarize(notes: Note[]) {
  const cleaned = notes
    .filter((n) => n.content.trim().length > 0 && !isFillerSpeech(n.content))
    .sort((a, b) => a.sessionOffsetSeconds - b.sessionOffsetSeconds || a.capturedAt.localeCompare(b.capturedAt));

  return takeAcross(cleaned, SUMMARIZE_NOTE_LIMIT).map((n) => ({
    id: n.id,
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

/** Whole transcript when it fits. Opening, middle, and end when it does not. */
export function excerptTranscript(transcript: string, max = SUMMARIZE_EXCERPT_CHARS): string {
  const t = transcript.trim().replace(/\s+/g, ' ');
  if (t.length <= max) return t;

  const marker = ' … ';
  const third = Math.max(1, Math.floor((max - marker.length * 2) / 3));
  const mid = Math.max(0, Math.floor(t.length / 2 - third / 2));
  return `${t.slice(0, third).trimEnd()}${marker}${t.slice(mid, mid + third).trim()}${marker}${t.slice(-third).trimStart()}`;
}

/** Timed lines in meeting order. A very long meeting is sampled across its full length. */
export function selectSegmentsForSummarize(
  segments: TranscriptSegment[],
  max = SUMMARIZE_SEGMENT_LIMIT,
) {
  const cleaned = segmentsForSummarize(segments)
    .slice()
    .sort((a, b) => a.startOffsetSeconds - b.startOffsetSeconds);
  return takeAcross(cleaned, max);
}

/** Always send transcript with notes — auto-tagged notes alone starve the recap. */
export function buildSummarizePayload(
  notes: Note[],
  transcript: string,
  transcriptSegments: TranscriptSegment[],
) {
  const usableSegments = transcriptSegments.filter((s) => !isFillerSpeech(s.text));
  const transcriptSegmentsForRecap = selectSegmentsForSummarize(usableSegments);
  return {
    notes: notesForSummarize(notes),
    transcriptExcerpt: transcriptSegmentsForRecap.length > 0 ? '' : excerptTranscript(transcript),
    transcriptSegments: transcriptSegmentsForRecap,
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
  return hasEnoughSessionContent(notes, transcript, segments);
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
  const chatSegments = segmentsForChat(segments, options);
  return hasEnoughSessionContent(notes, options?.fullTranscript ?? '', chatSegments);
}
