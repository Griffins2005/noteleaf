/**
 * Choose which notes and transcript lines a recap may see.
 * Under the cap, the meeting is sent in time order. Over the cap, lines are
 * taken from across the whole meeting so the middle is not discarded.
 */

export const SUMMARIZE_EXCERPT_CHARS = 100_000;
export const SUMMARIZE_SEGMENT_LIMIT = 500;
export const SUMMARIZE_NOTE_LIMIT = 500;

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

/** Whole transcript when it fits. Opening, middle, and end when it does not. */
export function excerptTranscript(transcript: string, max = SUMMARIZE_EXCERPT_CHARS): string {
  const t = transcript.trim().replace(/\s+/g, ' ');
  if (t.length <= max) return t;

  const marker = ' … ';
  const third = Math.max(1, Math.floor((max - marker.length * 2) / 3));
  const mid = Math.max(0, Math.floor(t.length / 2 - third / 2));
  return `${t.slice(0, third).trimEnd()}${marker}${t.slice(mid, mid + third).trim()}${marker}${t.slice(-third).trimStart()}`;
}
