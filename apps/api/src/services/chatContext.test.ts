import { describe, expect, it } from 'vitest';
import { selectChatContext, type ChatNoteSource, type ChatSegmentSource } from './chatContext.js';

function note(content: string, type = 'summary', at = '2026-10-23T18:00:00.000Z'): ChatNoteSource {
  return { id: content.slice(0, 12), type, content, capturedAt: at };
}

function segment(text: string, start: number): ChatSegmentSource {
  return { id: `seg-${start}`, text, startOffsetSeconds: start, endOffsetSeconds: start + 5 };
}

describe('selectChatContext', () => {
  it('sends a meeting that fits, in time order', () => {
    const notes = [
      note('later note', 'summary', '2026-10-23T18:05:00.000Z'),
      note('earlier note', 'summary', '2026-10-23T18:01:00.000Z'),
    ];
    const segments = [segment('second line', 20), segment('first line', 0)];
    const selected = selectChatContext(notes, segments, 'what did we decide', 10_000);

    expect(selected.retrieved).toBe(false);
    expect(selected.notes.map((n) => n.content)).toEqual(['earlier note', 'later note']);
    expect(selected.transcriptSegments.map((s) => s.text)).toEqual(['first line', 'second line']);
  });

  it('keeps the passage that matches a specific question', () => {
    const filler = Array.from({ length: 40 }, (_, i) => segment('the weather is sunny on the hill', i * 5));
    const meeting = [
      ...filler.slice(0, 20),
      segment('we will ship the navy theme on thursday', 100),
      ...filler.slice(20),
    ];
    const selected = selectChatContext([], meeting, 'when do we ship the navy theme', 500);
    const texts = selected.transcriptSegments.map((s) => s.text);

    expect(selected.retrieved).toBe(true);
    expect(texts.some((text) => text.includes('navy theme'))).toBe(true);
    expect(texts.length).toBeLessThan(meeting.length);
    const navyAt = texts.findIndex((text) => text.includes('navy theme'));
    expect(navyAt).toBeGreaterThan(-1);
  });

  it('keeps an action note when the question asks who owns the work', () => {
    const filler = Array.from({ length: 30 }, (_, i) => segment('the weather is sunny on the hill', i * 5));
    const selected = selectChatContext(
      [note('Maya will send the deck by Friday', 'action')],
      filler,
      'who is responsible for the follow-up',
      500,
    );

    expect(selected.notes.map((n) => n.content)).toContain('Maya will send the deck by Friday');
    expect(selected.transcriptSegments.length).toBeLessThan(filler.length);
  });

  it('samples the opening and the end of a long meeting for a broad question', () => {
    const segments = Array.from({ length: 40 }, (_, i) => segment(`line-${i} xxxxxxxx`, i));
    const selected = selectChatContext([], segments, 'what happened in the meeting', 220);
    const texts = selected.transcriptSegments.map((s) => s.text);

    expect(selected.retrieved).toBe(true);
    expect(texts[0]).toContain('line-0');
    expect(texts.at(-1)).toContain('line-39');
    expect(texts.length).toBeLessThan(segments.length);
  });

  it('returns matching lines in time order', () => {
    const segments = [
      segment('alpha talk about the budget review', 0),
      ...Array.from({ length: 25 }, (_, i) => segment('unrelated hillside weather report', 10 + i)),
      segment('beta talk about the budget review', 80),
    ];
    const selected = selectChatContext([], segments, 'budget review', 400);
    const texts = selected.transcriptSegments.map((s) => s.text);
    const alpha = texts.indexOf('alpha talk about the budget review');
    const beta = texts.indexOf('beta talk about the budget review');

    expect(alpha).toBeGreaterThan(-1);
    expect(beta).toBeGreaterThan(alpha);
  });
});
