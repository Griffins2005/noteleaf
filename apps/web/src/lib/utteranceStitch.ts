/** Merge Chrome/iOS speech finals that are one thought chopped into two. */

export const STITCH_GAP_SECONDS = 2.2;
export const STITCH_MAX_CHARS = 480;

export function shouldStitchUtterances(
  prevEndSeconds: number,
  nextStartSeconds: number,
  prevText: string,
  nextText: string,
): boolean {
  if (!prevText.trim() || !nextText.trim()) return false;
  if (nextStartSeconds - prevEndSeconds > STITCH_GAP_SECONDS) return false;
  if (prevText.length + nextText.length + 1 > STITCH_MAX_CHARS) return false;
  return true;
}

export function joinUtterances(a: string, b: string): string {
  return `${a.trim()} ${b.trim()}`.replace(/\s+/g, ' ').trim();
}

export function isSameUtterance(a: string, b: string): boolean {
  const x = a.trim().toLowerCase();
  const y = b.trim().toLowerCase();
  if (!x || !y) return false;
  if (x === y) return true;
  return x.includes(y) || y.includes(x);
}
