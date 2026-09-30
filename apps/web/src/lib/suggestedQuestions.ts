/**
 * Session-scoped suggested questions for Ask notes.
 * Only asks about what this recording actually contains.
 */

import type { Note, TranscriptSegment } from '@noteleaf/shared-types';
import { hasEnoughSessionContent, isMeaningfulSpeech, isPlaceholderRecap, isWeakRecapLine } from './speechQuality';

export interface SuggestedQuestionsInput {
  notes: Note[];
  transcriptSegments: TranscriptSegment[];
  askedQuestions: string[];
  isRecording?: boolean;
  sessionTitle?: string;
  max?: number;
}

const TOPIC_STOP = new Set([
  'about', 'after', 'also', 'because', 'could', 'going', 'have', 'just', 'like',
  'make', 'more', 'some', 'that', 'their', 'them', 'then', 'there', 'these',
  'they', 'this', 'those', 'very', 'want', 'were', 'what', 'when', 'where',
  'which', 'will', 'with', 'would', 'your', 'from', 'been', 'into',
  'than', 'onto', 'over', 'such', 'each', 'both', 'same', 'other',
]);

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

function similarity(a: string, b: string): number {
  const wordsA = new Set(a.split(' ').filter((w) => w.length > 3));
  const wordsB = new Set(b.split(' ').filter((w) => w.length > 3));
  if (wordsA.size === 0 || wordsB.size === 0) return 0;
  let overlap = 0;
  for (const w of wordsA) if (wordsB.has(w)) overlap++;
  return overlap / Math.max(wordsA.size, wordsB.size);
}

function isUsableTitle(title?: string): boolean {
  const t = title?.trim() ?? '';
  if (t.length < 8) return false;
  if (/^session\b/i.test(t)) return false;
  if (isPlaceholderRecap(t) || isWeakRecapLine(t)) return false;
  return true;
}

function topicFromText(text: string): string | null {
  if (!isMeaningfulSpeech(text) || isWeakRecapLine(text)) return null;
  const cleaned = text
    .replace(/^Decided:\s*/i, '')
    .replace(/["“”']/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  const tokens = cleaned
    .split(/\s+/)
    .map((w) => w.replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9]+$/g, ''))
    .filter(Boolean);

  let best: { phrase: string; score: number } | null = null;

  for (let i = 0; i < tokens.length; i++) {
    for (const n of [2, 3]) {
      const slice = tokens.slice(i, i + n);
      if (slice.length < n) continue;
      const lower = slice.map((w) => w.toLowerCase());
      if (lower.some((w) => w.length < 3)) continue;
      const content = lower.filter((w) => w.length >= 4 && !TOPIC_STOP.has(w));
      if (content.length < 2) continue;
      const score = content.length * 12 + content.reduce((s, w) => s + w.length, 0);
      const phrase = slice.join(' ');
      if (!best || score > best.score) best = { phrase, score };
    }
  }

  if (!best) return null;
  const original = cleaned.toLowerCase();
  const withArticle = `the ${best.phrase}`;
  const phrase = original.includes(withArticle.toLowerCase()) ? withArticle : best.phrase;
  return phrase.length > 40 ? phrase.slice(0, 40).replace(/\s+\S*$/, '') : phrase;
}

function sessionTopics(notes: Note[], segments: TranscriptSegment[]): string[] {
  const seen = new Set<string>();
  const topics: string[] = [];

  const pool = [
    ...notes.filter((n) => n.type !== 'summary').map((n) => n.content),
    ...notes.filter((n) => n.type === 'summary').map((n) => n.content),
    ...segments.map((s) => s.text),
  ];

  for (const text of pool) {
    const topic = topicFromText(text);
    if (!topic) continue;
    const key = topic.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    topics.push(topic);
    if (topics.length >= 2) break;
  }

  return topics;
}

function buildCandidates(input: SuggestedQuestionsInput): string[] {
  const { notes, transcriptSegments, isRecording, sessionTitle } = input;
  if (!hasEnoughSessionContent(notes, '', transcriptSegments)) return [];

  const actions = notes.filter((n) => n.type === 'action' && isMeaningfulSpeech(n.content) && !isWeakRecapLine(n.content));
  const decisions = notes.filter((n) => n.type === 'decision' && isMeaningfulSpeech(n.content) && !isWeakRecapLine(n.content));
  const candidates: string[] = [];

  if (isRecording) {
    candidates.push('What has been covered so far in this session?');
  }

  if (decisions.length > 0) {
    candidates.push('What did we decide in this session?');
  }
  if (actions.length > 0) {
    candidates.push('What follow-ups came out of this session?');
  }

  for (const topic of sessionTopics(notes, transcriptSegments)) {
    candidates.push(`What was said about ${topic}?`);
  }

  if (isUsableTitle(sessionTitle)) {
    candidates.push(`What should someone know from ${sessionTitle!.trim()}?`);
  } else {
    candidates.push('What should someone who missed this session know?');
  }

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
