import { describe, it, expect } from 'vitest';
import type { Note, TranscriptSegment } from '@noteleaf/shared-types';
import { getSuggestedQuestions } from '../suggestedQuestions';

function note(content: string, type: Note['type'] = 'summary', id = 'n1'): Note {
  return {
    id,
    sessionId: 's1',
    type,
    content,
    tags: [],
    capturedAt: new Date().toISOString(),
    sessionOffsetSeconds: 0,
  };
}

function segment(text: string, id = 'seg'): TranscriptSegment {
  return {
    id,
    sessionId: 's1',
    text,
    capturedAt: new Date().toISOString(),
    startOffsetSeconds: 0,
    endOffsetSeconds: 3,
    confidence: 1,
  };
}

describe('getSuggestedQuestions', () => {
  it('does not invent questions from two-word transcript junk', () => {
    const qs = getSuggestedQuestions({
      notes: [],
      transcriptSegments: [segment("If you're ready"), segment("It's")],
      askedQuestions: [],
    });
    expect(qs).toEqual([]);
    expect(qs.some((q) => q.includes("It's"))).toBe(false);
  });

  it('asks about this session’s decisions and follow-ups, not world knowledge', () => {
    const qs = getSuggestedQuestions({
      notes: [
        note('We decided to ship the navy theme for the dashboard', 'decision', 'n1'),
        note('Maya will send the deck by Friday', 'action', 'n2'),
      ],
      transcriptSegments: [
        segment('We decided to ship the navy theme for the dashboard this sprint'),
      ],
      askedQuestions: [],
      sessionTitle: 'Dashboard visual refresh',
    });
    expect(qs).toContain('What did we decide in this session?');
    expect(qs).toContain('What follow-ups came out of this session?');
    expect(qs.some((q) => /navy theme/i.test(q))).toBe(true);
    expect(qs.every((q) => !/^what is /i.test(q))).toBe(true);
    expect(qs.every((q) => !/It's/.test(q))).toBe(true);
    expect(qs.every((q) => !/main themes|key quotes|outcomes/i.test(q))).toBe(true);
  });

  it('stays on this session instead of suggesting generic knowledge chips', () => {
    const qs = getSuggestedQuestions({
      notes: [
        note('Carbon Watch should track school air quality this term', 'insight', 'n1'),
        note('Next step is a parent briefing on Friday', 'action', 'n2'),
      ],
      transcriptSegments: [
        segment('We talked about Carbon Watch and how quality education needs cleaner classrooms'),
      ],
      askedQuestions: [],
      sessionTitle: 'Carbon Watch briefing',
    });
    expect(qs.length).toBeGreaterThan(0);
    expect(qs.every((q) => !/^what is quality education/i.test(q))).toBe(true);
    expect(qs.some((q) => /this session|Carbon Watch|follow-ups/i.test(q))).toBe(true);
  });
});
