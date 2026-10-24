/**
 * Choose which notes and transcript lines Ask notes may see.
 * A meeting that fits is sent whole, in time order. A meeting past the
 * character budget keeps the passages that match the question, then fills
 * the remaining room from across the recording.
 */

import { takeAcross } from './meetingWindow.js';

export const CHAT_SOURCE_CHAR_BUDGET = 100_000;

const STOP = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'have', 'has', 'had',
  'was', 'were', 'are', 'been', 'being', 'what', 'who', 'when', 'where', 'why',
  'how', 'did', 'does', 'not', 'but', 'you', 'your', 'our', 'about', 'into',
  'meeting', 'session', 'please', 'tell',
]);

export interface ChatNoteSource {
  id: string;
  type: string;
  content: string;
  capturedAt: string;
}

export interface ChatSegmentSource {
  id: string;
  text: string;
  startOffsetSeconds: number;
  endOffsetSeconds: number;
}

export interface ChatContextSelection {
  notes: ChatNoteSource[];
  transcriptSegments: ChatSegmentSource[];
  /** True when the meeting was longer than the prompt and only part of it was sent. */
  retrieved: boolean;
}

interface SourceRef {
  kind: 'note' | 'segment';
  index: number;
  text: string;
  chars: number;
  score: number;
}

function termsOf(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9]{3,}/g) ?? []).filter((term) => !STOP.has(term));
}

function isBroadQuestion(question: string, queryTerms: string[]): boolean {
  if (queryTerms.length === 0) return true;
  return /\b(summar\w*|recap|overview|what happened|main points|key points|catch me up|whole meeting|entire meeting|everything)\b/i.test(question);
}

function typeBoost(type: string, question: string): number {
  const q = question.toLowerCase();
  if (type === 'action' && /\b(action|actions|todo|task|tasks|owner|deadline|responsible|follow-up|follow up|assigned|assignment)\b/.test(q)) return 3;
  if (type === 'decision' && /\b(decision|decisions|decide|decided|agreed|agreement|approved)\b/.test(q)) return 3;
  if (type === 'insight' && /\b(insight|insights|why|risk|risks|concern|concerns)\b/.test(q)) return 2;
  return 0;
}

function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  const clipped = (lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd();
  return `${clipped}…`;
}

function totalChars(items: SourceRef[]): number {
  return items.reduce((sum, item) => sum + item.chars, 0);
}

function fitAcross(items: SourceRef[], budget: number): SourceRef[] {
  if (items.length === 0 || budget <= 0) return [];
  if (totalChars(items) <= budget) return items;

  let best: SourceRef[] = [];
  let lo = 1;
  let hi = items.length;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const slice = takeAcross(items, mid);
    if (totalChars(slice) <= budget) {
      best = slice;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  if (best.length > 0) return best;
  const only = items[0];
  if (!only) return [];
  const text = clip(only.text, budget);
  return [{ ...only, text, chars: text.length }];
}

function splitBudget(noteChars: number, segmentChars: number, budget: number): [number, number] {
  const total = noteChars + segmentChars;
  if (budget <= 0 || total <= 0) return [0, 0];
  if (noteChars === 0) return [0, budget];
  if (segmentChars === 0) return [budget, 0];
  const noteBudget = Math.min(budget, Math.max(1, Math.round(budget * (noteChars / total))));
  return [noteBudget, budget - noteBudget];
}

function textOf(ref: SourceRef, budgetLeft: number): SourceRef | null {
  if (budgetLeft <= 0) return null;
  if (ref.chars <= budgetLeft) return ref;
  if (budgetLeft < 40) return null;
  const text = clip(ref.text, budgetLeft);
  return { ...ref, text, chars: text.length };
}

export function selectChatContext(
  notes: ChatNoteSource[],
  segments: ChatSegmentSource[],
  question: string,
  budget = CHAT_SOURCE_CHAR_BUDGET,
): ChatContextSelection {
  const orderedNotes = [...notes].sort((a, b) => a.capturedAt.localeCompare(b.capturedAt));
  const orderedSegments = [...segments].sort((a, b) => a.startOffsetSeconds - b.startOffsetSeconds);
  const noteChars = orderedNotes.reduce((sum, note) => sum + note.content.length, 0);
  const segmentChars = orderedSegments.reduce((sum, segment) => sum + segment.text.length, 0);

  if (noteChars + segmentChars <= budget) {
    return { notes: orderedNotes, transcriptSegments: orderedSegments, retrieved: false };
  }

  const queryTerms = termsOf(question);
  const noteRefs: SourceRef[] = orderedNotes.map((note, index) => ({
    kind: 'note',
    index,
    text: note.content,
    chars: note.content.length,
    score: typeBoost(note.type, question) + queryTerms.reduce((sum, term) => sum + (note.content.toLowerCase().includes(term) ? 2 : 0), 0),
  }));
  const segmentRefs: SourceRef[] = orderedSegments.map((segment, index) => ({
    kind: 'segment',
    index,
    text: segment.text,
    chars: segment.text.length,
    score: queryTerms.reduce((sum, term) => sum + (segment.text.toLowerCase().includes(term) ? 2 : 0), 0),
  }));

  const pickedNotes = new Map<number, SourceRef>();
  const pickedSegments = new Map<number, SourceRef>();

  const addNote = (ref: SourceRef) => {
    const note = orderedNotes[ref.index];
    if (!note) return;
    pickedNotes.set(ref.index, ref);
  };
  const addSegment = (ref: SourceRef) => {
    const segment = orderedSegments[ref.index];
    if (!segment) return;
    pickedSegments.set(ref.index, ref);
  };

  const broad = isBroadQuestion(question, queryTerms)
    || [...noteRefs, ...segmentRefs].every((ref) => ref.score === 0);

  let used = 0;
  if (!broad) {
    const hits = [...noteRefs, ...segmentRefs]
      .filter((ref) => ref.score > 0)
      .sort((a, b) => b.score - a.score || a.index - b.index);
    const hitBudget = Math.floor(budget * 0.75);

    const place = (ref: SourceRef, list: 'note' | 'segment', limit: number): boolean => {
      const fitted = textOf(ref, limit - used);
      if (!fitted) return false;
      if (list === 'note') addNote(fitted);
      else addSegment(fitted);
      used += fitted.chars;
      return true;
    };

    for (const hit of hits) {
      if (used >= hitBudget && pickedNotes.size + pickedSegments.size > 0) break;
      const already = hit.kind === 'note' ? pickedNotes.has(hit.index) : pickedSegments.has(hit.index);
      if (already) continue;
      const source = hit.kind === 'note' ? noteRefs : segmentRefs;
      if (!place(hit, hit.kind, used === 0 ? budget : hitBudget)) continue;
      for (const delta of [-1, 1]) {
        const neighbor = source[hit.index + delta];
        if (!neighbor) continue;
        const neighborKept = neighbor.kind === 'note'
          ? pickedNotes.has(neighbor.index)
          : pickedSegments.has(neighbor.index);
        if (neighborKept) continue;
        place(neighbor, neighbor.kind, budget);
      }
    }
  }

  const noteRemain = noteRefs.filter((ref) => !pickedNotes.has(ref.index));
  const segmentRemain = segmentRefs.filter((ref) => !pickedSegments.has(ref.index));
  const [noteBudget, segmentBudget] = splitBudget(
    totalChars(noteRemain),
    totalChars(segmentRemain),
    budget - used,
  );
  for (const ref of fitAcross(noteRemain, noteBudget)) addNote(ref);
  for (const ref of fitAcross(segmentRemain, segmentBudget)) addSegment(ref);

  const selectedNotes = orderedNotes.flatMap((note, index) => {
    const ref = pickedNotes.get(index);
    if (!ref) return [];
    return [{ ...note, content: ref.text }];
  });
  const selectedSegments = orderedSegments.flatMap((segment, index) => {
    const ref = pickedSegments.get(index);
    if (!ref) return [];
    return [{ ...segment, text: ref.text }];
  });

  return {
    notes: selectedNotes,
    transcriptSegments: selectedSegments,
    retrieved: true,
  };
}
