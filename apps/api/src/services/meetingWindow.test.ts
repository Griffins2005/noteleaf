import { describe, expect, it } from 'vitest';
import { excerptTranscript, takeAcross } from './meetingWindow.js';

describe('takeAcross', () => {
  it('keeps a short meeting in order', () => {
    expect(takeAcross(['a', 'b', 'c'], 10)).toEqual(['a', 'b', 'c']);
  });

  it('samples the opening, middle, and end', () => {
    const items = Array.from({ length: 80 }, (_, i) => i);
    const selected = takeAcross(items, 10);
    expect(selected[0]).toBe(0);
    expect(selected.at(-1)).toBe(79);
    const middle = selected[Math.floor(selected.length / 2)] ?? -1;
    expect(middle).toBeGreaterThan(30);
    expect(middle).toBeLessThan(50);
  });
});

describe('excerptTranscript', () => {
  it('returns a transcript that fits', () => {
    expect(excerptTranscript('hello there', 100)).toBe('hello there');
  });

  it('keeps the opening, middle, and end past the cap', () => {
    const transcript = `START ${'word '.repeat(2000)}END-MARKER`;
    const excerpt = excerptTranscript(transcript, 400);
    expect(excerpt.startsWith('START')).toBe(true);
    expect(excerpt).toContain('END-MARKER');
    expect(excerpt.match(/…/g)?.length).toBe(2);
  });
});
