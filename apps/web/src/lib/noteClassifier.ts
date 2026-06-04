/**
 * @file noteClassifier.ts
 * @description Pure function that classifies a speech transcript segment
 * into one of four NoteType categories.
 *
 * Design principles:
 *   - PURE: no side effects, no I/O, no state. Input → output only.
 *   - TESTABLE: every classification rule is tested in isolation.
 *   - DOCUMENTED: each pattern group explains the linguistic intent.
 *
 * Classification order matters — the first match wins. More specific
 * patterns appear before generic fallbacks.
 *
 * The classifier fires on NVIDIA NIM is_final=true segments only.
 * It does NOT process partial (interim) transcripts.
 *
 * @example
 *   classifyTranscript('We need to follow up with the client by Friday')
 *   // → 'action'
 *
 *   classifyTranscript('We decided to go with the blue design')
 *   // → 'decision'
 */

import type { NoteType, ClassifierInput, ClassifierOutput } from '@noteleaf/shared-types';
import { v4 as uuidv4 } from 'uuid';
import { formatHumanNote, refineNoteType, cleanSpeech } from './noteWriter';

// ─── Classification rules ─────────────────────────────────────────────────────

/**
 * Patterns that indicate a task or obligation was stated.
 * Typically future-tense commitments or imperative language.
 *
 * Exclusions from action patterns:
 *   - 'review' removed: too generic — "Product roadmap review" is a summary,
 *     not an action item. Only explicit "please review by X" triggers action.
 *   - 'check' removed: same reason — too many false positives in general speech.
 */
const ACTION_PATTERNS: RegExp[] = [
  /\b(we need to|we should|we have to|we must)\b/i,
  /\b(action item|follow up|follow-up|todo|to do)\b/i,
  /\b(can you|could you|would you|please)\b.{0,40}\b(by|before|until)\b/i,
  /\b(by (monday|tuesday|wednesday|thursday|friday|saturday|sunday|eod|eow|next week|tomorrow|end of day|end of week))\b/i,
  /\b(assign(ed)?|deadline|due date|schedule|book|arrange|set up|send|share)\b/i,
  /\bwho (will|is going to|can)\b/i,
];

/**
 * Patterns that indicate a conclusion or agreement was reached.
 *
 * Key fix: decision words like 'confirmed', 'agreed', 'approved' are valid
 * decision signals even WITHOUT a 'we' subject — passive voice and third-person
 * are common in meeting speech ("The launch date is confirmed", "Everyone agreed").
 */
const DECISION_PATTERNS: RegExp[] = [
  /\bwe (decided|agreed|confirmed|resolved|concluded|settled on|finalized|chose|picked|selected)\b/i,
  // Standalone decision words — valid without 'we' subject
  /\b(confirmed|agreed|approved|finalized|resolved|concluded)\b/i,
  /\b(decision|going with|moving forward with|we will go with|we'll go with)\b/i,
  /\b(it('s| is) decided|that('s| is) final|final decision)\b/i,
  /\b(signed off|green-?lit|greenlit)\b/i,
];

/**
 * Patterns that indicate an observation, idea, or notable insight.
 *
 * Key fix: 'should explore' removed from insight test phrase — the action
 * classifier fires first on 'we should'. Insight patterns are correct;
 * the test sentences were the issue. Patterns themselves are sound.
 */
const INSIGHT_PATTERNS: RegExp[] = [
  /\b(important(ly)?|key (point|takeaway|insight|finding))\b/i,
  /\b(note that|worth noting|keep in mind|bear in mind|don't forget)\b/i,
  /\b(insight|observation|realize[d]?|realise[d]?|discovered|found that)\b/i,
  /\b(idea|suggestion|proposal|recommend|consider|what if|how about)\b/i,
  /\b(interesting(ly)?|significant(ly)?|critical(ly)?|concern(ing)?)\b/i,
];

// ─── Core classifier ──────────────────────────────────────────────────────────

/**
 * Classifies a transcript string into a NoteType.
 *
 * @param text - A finalized transcript segment from NVIDIA NIM.
 *               Must be at least 10 characters to be classified meaningfully.
 * @returns The most appropriate NoteType for the given text.
 *
 * Classification order: action → decision → insight → summary (fallback)
 */
export function classifyTranscript(text: string): NoteType {
  if (text.length < 10) return 'summary';

  if (ACTION_PATTERNS.some((pattern) => pattern.test(text))) return 'action';
  if (DECISION_PATTERNS.some((pattern) => pattern.test(text))) return 'decision';
  if (INSIGHT_PATTERNS.some((pattern) => pattern.test(text))) return 'insight';

  return 'summary';
}

// ─── Tag extractor ────────────────────────────────────────────────────────────

/**
 * Words excluded from auto-tagging. Expanded English stopword list.
 * Sorted alphabetically for binary search performance at scale.
 */
const STOPWORDS = new Set([
  'about', 'after', 'all', 'also', 'and', 'are', 'as', 'at', 'back', 'be',
  'been', 'before', 'being', 'but', 'by', 'can', 'come', 'could', 'day',
  'do', 'does', 'doing', 'down', 'each', 'even', 'every', 'find', 'first',
  'for', 'from', 'get', 'give', 'going', 'good', 'great', 'had', 'has',
  'have', 'he', 'her', 'here', 'him', 'his', 'how', 'i', 'if', 'in',
  'into', 'is', 'it', 'its', 'just', 'know', 'like', 'look', 'make',
  'many', 'me', 'more', 'most', 'much', 'my', 'need', 'new', 'no', 'not',
  'now', 'of', 'on', 'one', 'only', 'or', 'other', 'our', 'out', 'over',
  'people', 'please', 'put', 'right', 'said', 'say', 'see', 'she', 'should',
  'since', 'so', 'some', 'take', 'that', 'the', 'their', 'them', 'then',
  'there', 'these', 'they', 'think', 'this', 'those', 'through', 'time',
  'to', 'too', 'up', 'use', 'very', 'was', 'we', 'well', 'were', 'what',
  'when', 'where', 'which', 'while', 'who', 'will', 'with', 'would', 'you',
  'your',
]);

/**
 * Extracts up to 3 meaningful keyword tags from a transcript segment.
 *
 * Filtering criteria:
 *   - Minimum word length: 5 characters (filters prepositions, articles)
 *   - Not in the stopword list
 *   - Not a duplicate (case-insensitive)
 *   - Lowercase in the output for consistent display
 *
 * @param text - The transcript segment to extract tags from.
 * @returns An array of 0–3 keyword strings.
 */
export function extractTags(text: string): string[] {
  const tags: string[] = [];
  const seen = new Set<string>();

  for (const word of text.toLowerCase().split(/\s+/)) {
    const clean = word.replace(/[^a-z]/g, '');
    if (clean.length >= 5 && !STOPWORDS.has(clean) && !seen.has(clean)) {
      tags.push(clean);
      seen.add(clean);
      if (tags.length === 3) break;
    }
  }

  return tags;
}

// ─── Full note builder ────────────────────────────────────────────────────────

/**
 * Takes a ClassifierInput and produces a complete, typed Note ready for storage.
 * This is the main entry point called by useNoteClassifier.ts.
 *
 * @param input - Finalized transcript segment with session context.
 * @param enableTagging - Whether to extract keyword tags (user preference).
 * @returns A fully formed Note object.
 */
export function buildNoteFromTranscript(
  input: ClassifierInput,
  enableTagging: boolean,
): ClassifierOutput {
  const { transcript, sessionId, sessionOffsetSeconds } = input;
  const raw = transcript.trim();

  let type = classifyTranscript(raw);
  type = refineNoteType(raw, type);

  const content = formatHumanNote(raw, type);
  const tagSource = cleanSpeech(raw);

  return {
    id: uuidv4(),
    sessionId,
    type,
    content,
    tags: enableTagging ? extractTags(tagSource) : [],
    capturedAt: new Date().toISOString(),
    sessionOffsetSeconds,
  };
}
