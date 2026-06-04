/**
 * Session-scoped suggested questions for Ask notes.
 * Filters out questions already asked and rotates through session content.
 */

import type { Note, TranscriptSegment } from '@noteleaf/shared-types';

export interface SuggestedQuestionsInput {
  notes: Note[];
  transcriptSegments: TranscriptSegment[];
  askedQuestions: string[];
  isRecording?: boolean;
  max?: number;
}

function normalizeQuestion(q: string): string {
  return q.toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim();
}

function isAlreadyAsked(candidate: string, asked: string[]): boolean {
  const norm = normalizeQuestion(candidate);
  if (!norm) return true;
  return asked.some((a) => {
    const askedNorm = normalizeQuestion(a);
    if (!askedNorm) return false;
    if (askedNorm === norm) return true;
    if (askedNorm.includes(norm) || norm.includes(askedNorm)) return true;
    return similarity(askedNorm, norm) > 0.72;
  });
}

/** Simple word-overlap similarity for deduping paraphrased questions. */
function similarity(a: string, b: string): number {
  const wordsA = new Set(a.split(' ').filter((w) => w.length > 3));
  const wordsB = new Set(b.split(' ').filter((w) => w.length > 3));
  if (wordsA.size === 0 || wordsB.size === 0) return 0;
  let overlap = 0;
  for (const w of wordsA) if (wordsB.has(w)) overlap++;
  return overlap / Math.max(wordsA.size, wordsB.size);
}

function snippet(s: string, maxWords = 6): string {
  const words = s
    .replace(/^(we need to|we should|we have to|can you|could you|please|let's|try)\s+/i, '')
    .trim()
    .split(/\s+/);
  const phrase = words.slice(0, maxWords).join(' ');
  return phrase.length > 42 ? phrase.slice(0, 42) + '…' : phrase;
}

function hasAssigneeHint(text: string): boolean {
  return /\b(you|we|they|team|owner|assign|responsible|@|\b[A-Z][a-z]+\b)\b/i.test(text)
    && /\b(need to|should|must|will|follow up|send|schedule|review)\b/i.test(text);
}

function buildCandidates(input: SuggestedQuestionsInput): string[] {
  const { notes, transcriptSegments, isRecording } = input;
  const candidates: string[] = [];

  if (isRecording) {
    candidates.push('What has been discussed so far?');
    candidates.push('Any decisions or themes mentioned yet?');
  }

  const actions   = notes.filter((n) => n.type === 'action');
  const decisions = notes.filter((n) => n.type === 'decision');
  const insights  = notes.filter((n) => n.type === 'insight');
  const summaries = notes.filter((n) => n.type === 'summary');

  for (const note of actions) {
    if (hasAssigneeHint(note.content)) {
      candidates.push(`Who should handle: "${snippet(note.content)}"?`);
    } else {
      candidates.push(`What was meant by: "${snippet(note.content)}"?`);
    }
  }

  for (const note of decisions) {
    candidates.push(`What was decided about "${snippet(note.content, 5)}"?`);
  }

  for (const note of insights) {
    candidates.push(`Explain this insight: "${snippet(note.content, 5)}"`);
  }

  for (const note of summaries.slice(0, 3)) {
    candidates.push(`Summarise the point about "${snippet(note.content, 5)}"`);
  }

  if (transcriptSegments.length >= 2) {
    candidates.push('What topics were covered and in what order?');
    candidates.push('What were the main themes in this session?');
    const last = transcriptSegments.at(-1);
    if (last?.text) {
      candidates.push(`What was said about "${snippet(last.text, 5)}"?`);
    }
  }

  if (actions.length > 1) {
    candidates.push(`List all ${actions.length} action-related points from this session.`);
  }
  if (decisions.length > 1) {
    candidates.push(`Summarise all ${decisions.length} decisions captured.`);
  }

  const generic = isRecording
    ? [
        'Were any deadlines or timelines mentioned?',
        'What open questions came up?',
        'Summarise the last few minutes.',
      ]
    : [
        'What were the main outcomes of this session?',
        'What action items were captured?',
        'What key quotes stand out from the transcript?',
        'Were any deadlines or timelines mentioned?',
        'What should someone who missed this meeting know?',
      ];

  candidates.push(...generic);

  return candidates;
}

export function getSuggestedQuestions(input: SuggestedQuestionsInput): string[] {
  const max = input.max ?? 3;
  const asked = input.askedQuestions;
  const seen = new Set<string>();
  const result: string[] = [];

  for (const candidate of buildCandidates(input)) {
    const norm = normalizeQuestion(candidate);
    if (seen.has(norm)) continue;
    if (isAlreadyAsked(candidate, asked)) continue;
    seen.add(norm);
    result.push(candidate);
    if (result.length >= max) break;
  }

  return result;
}

export function hasMoreToExplore(input: SuggestedQuestionsInput): boolean {
  return getSuggestedQuestions({ ...input, max: 1 }).length > 0;
}
