/**
 * Drop STT filler so recaps, titles, and Ask notes don't treat noise as a meeting.
 */

const FILLER_UTTERANCE =
  /^(um+|uh+|er+|ah+|hmm+|mm-?h+m+|yeah|yep|yup|yes|nope|ok(ay)?|right|sure|thanks?( you)?( so much)?|thank you(\s+\w+){0,4}|bye|goodbye|cheers|of course|you'?re welcome|is muted|you'?re muted|muted|hello|hi|hey|have a good (one|day|night)|good (morning|afternoon|evening)|\?+|…+)$/i;

export const MIN_NOTE_WORDS = 6;
export const MIN_SESSION_WORDS = 24;

export const PLACEHOLDER_RECAP =
  'Not enough speech was captured to write a recap.';

export function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function isPlaceholderRecap(text: string): boolean {
  const t = text.trim().toLowerCase();
  return (
    t.startsWith('session recap from captured') ||
    t.startsWith('live speech was captured') ||
    t === PLACEHOLDER_RECAP.toLowerCase()
  );
}

/** Thanks, mute, punctuation — not meeting content even if already stored as a note. */
export function isFillerSpeech(text: string): boolean {
  const t = text.trim().replace(/\s+/g, ' ');
  if (!t) return true;
  if (/^[?.;,!\-\s]+$/.test(t)) return true;
  if (FILLER_UTTERANCE.test(t)) return true;
  const words = t.split(/\s+/).filter(Boolean);
  if ((t.match(/\bi think\b/gi)?.length ?? 0) >= 2 && words.length < 16) return true;
  return false;
}

/** Too short or repetitive to become a new note from live speech. */
export function isNoiseUtterance(text: string): boolean {
  if (isFillerSpeech(text)) return true;
  const t = text.trim().replace(/\s+/g, ' ');
  const words = t.split(/\s+/).filter(Boolean);
  const unique = new Set(
    words.map((w) => w.toLowerCase().replace(/[^a-z0-9]/g, '')).filter(Boolean),
  );
  if (words.length < MIN_NOTE_WORDS && t.length < 40) return true;
  if (words.length >= MIN_NOTE_WORDS && unique.size <= 2) return true;
  return false;
}

export function isMeaningfulSpeech(text: string): boolean {
  return !isNoiseUtterance(text);
}

/** Agreement / encouragement — not a recap overview or insight. */
export function isWeakRecapLine(text: string): boolean {
  const t = text.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!t) return true;
  if (isPlaceholderRecap(t)) return true;
  return (
    /\b(good|great|nice) suggestion\b/.test(t) ||
    /\bvery doable\b/.test(t) ||
    /^(i think so\s*)+$/.test(t) ||
    /^i think that'?s (a )?(good|great)/.test(t) ||
    /\bhave a good (one|day)\b/.test(t)
  );
}

export function overviewFromTranscript(transcript: string, maxLen = 220): string {
  const t = transcript.trim().replace(/\s+/g, ' ');
  if (t.length < 40) return PLACEHOLDER_RECAP;
  const cut = t.length <= maxLen ? t : `${t.slice(0, maxLen).replace(/\s+\S*$/, '')}…`;
  return cut.charAt(0).toUpperCase() + cut.slice(1);
}

/** True when there is enough real speech to summarise or ask about. */
export function hasEnoughSessionContent(
  notes: { content: string }[],
  transcript: string,
  segments: { text: string }[],
): boolean {
  const usableNotes = notes.filter((n) => !isFillerSpeech(n.content));
  const usableSegs = segments.filter((s) => !isFillerSpeech(s.text));
  if (usableNotes.length >= 3) return true;
  const blob = [
    transcript,
    ...usableSegs.map((s) => s.text),
    ...usableNotes.map((n) => n.content),
  ].join(' ');
  return wordCount(blob) >= MIN_SESSION_WORDS;
}
