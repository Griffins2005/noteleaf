import { describe, it, expect } from 'vitest';
import type { Note, TranscriptSegment } from '@noteleaf/shared-types';
import {
  buildSummarizePayload,
  excerptTranscript,
  hasSummarizeContext,
  selectSegmentsForSummarize,
  SUMMARIZE_EXCERPT_CHARS,
  SUMMARIZE_SEGMENT_LIMIT,
} from '../sessionContext';

function note(overrides: Partial<Note> & Pick<Note, 'content'>): Note {
  return {
    id: 'n1',
    sessionId: 's1',
    type: 'summary',
    tags: [],
    capturedAt: new Date().toISOString(),
    sessionOffsetSeconds: 0,
    ...overrides,
  };
}

function segment(text: string, start: number): TranscriptSegment {
  return {
    id: `seg-${start}`,
    sessionId: 's1',
    text,
    capturedAt: new Date().toISOString(),
    startOffsetSeconds: start,
    endOffsetSeconds: start + 5,
    confidence: 1,
  };
}

describe('excerptTranscript', () => {
  it('returns short transcripts unchanged', () => {
    expect(excerptTranscript('hello there')).toBe('hello there');
  });

  it('keeps the opening, middle, and end when the transcript exceeds the cap', () => {
    const t = `START ${'word '.repeat(2000)}END-MARKER`;
    const excerpt = excerptTranscript(t, 400);
    expect(excerpt.startsWith('START')).toBe(true);
    expect(excerpt).toContain('END-MARKER');
    expect(excerpt.match(/…/g)?.length).toBe(2);
    expect(excerpt.length).toBeLessThanOrEqual(SUMMARIZE_EXCERPT_CHARS);
  });
});

describe('selectSegmentsForSummarize', () => {
  it('returns all segments when under the cap', () => {
    const segs = [segment('one', 0), segment('two', 5)];
    expect(selectSegmentsForSummarize(segs)).toHaveLength(2);
  });

  it('keeps the middle of a long meeting', () => {
    const segs = Array.from({ length: 80 }, (_, i) => segment(`seg-${i}`, i * 5));
    const selected = selectSegmentsForSummarize(segs, 10);
    expect(selected[0]?.text).toBe('seg-0');
    expect(selected.at(-1)?.text).toBe('seg-79');
    const middle = Number(selected[Math.floor(selected.length / 2)]?.text.replace('seg-', ''));
    expect(middle).toBeGreaterThan(30);
    expect(middle).toBeLessThan(50);
    expect(selected.length).toBeLessThanOrEqual(SUMMARIZE_SEGMENT_LIMIT);
  });
});

describe('buildSummarizePayload', () => {
  it('still sends transcript when there are many notes', () => {
    const notes = [
      note({ content: 'Need to follow up with Maya by Friday', type: 'action' }),
      note({ content: 'Decided: ship the navy theme', type: 'decision' }),
      note({ content: 'Retention dropped last quarter', type: 'insight' }),
      note({ content: 'Roadmap review ran long', type: 'summary' }),
    ];
    const payload = buildSummarizePayload(
      notes,
      'We decided to ship the navy theme and Maya will follow up Friday.',
      [segment('We decided to ship the navy theme', 0)],
    );

    expect(payload.notes).toHaveLength(4);
    expect(payload.notes[0]?.id).toBe('n1');
    expect(payload.transcriptExcerpt).toBe('');
    expect(payload.transcriptSegments?.[0]?.text).toContain('navy theme');
  });
});

describe('hasSummarizeContext', () => {
  it('is false for a failed listen with two fragments', () => {
    expect(
      hasSummarizeContext(
        [],
        '',
        [segment("If you're ready", 0), segment("It's", 5)],
      ),
    ).toBe(false);
  });
});
