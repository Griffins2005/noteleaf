/**
 * Transforms raw speech-to-text into concise, human-style meeting notes.
 *
 * Human notes tend to be:
 *   - Short — one idea per note, not verbatim ramble
 *   - Verb-first for tasks ("Follow up with client by Friday")
 *   - Prefixed for decisions ("Decided: go with option B")
 *   - Stripped of fillers (um, like, you know)
 *   - Not literal transcripts of rhetorical monologues
 */

import type { NoteType } from '@noteleaf/shared-types';

const FILLER_PATTERN =
  /\b(um+|uh+|er+|ah+|hmm+|like|you know|i mean|sort of|kind of|basically|literally|okay so|so yeah|you see)\b/gi;

const RHETORICAL_PATTERN =
  /\b(try saying|try something|imagine if|ladies and gentlemen|the kind of|when someone asks|focus group|makanga|university|watch their face)\b/i;

const CONCRETE_TASK_PATTERN =
  /\b(by (monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|eod|eow|next week|end of (?:the )?week)|deadline|assigned to|@\w+)\b/i;

const NAMED_ASSIGNEE_PATTERN = /\b[A-Z][a-z]+\s+will\b/;

function capitalizeFirst(text: string): string {
  const t = text.trim();
  if (!t) return t;
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function truncateAtClause(text: string, maxLen = 140): string {
  const t = text.trim();
  if (t.length <= maxLen) return t;

  const cut = t.slice(0, maxLen);
  const punct = Math.max(cut.lastIndexOf('.'), cut.lastIndexOf('!'), cut.lastIndexOf('?'), cut.lastIndexOf(';'));
  if (punct > maxLen * 0.45) return cut.slice(0, punct + 1).trim();

  const space = cut.lastIndexOf(' ');
  return `${(space > 0 ? cut.slice(0, space) : cut).trim()}…`;
}

/** Remove disfluencies and collapse whitespace. */
export function cleanSpeech(text: string): string {
  const stripped = text.replace(FILLER_PATTERN, ' ');
  return stripped
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .join(', ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Long persuasive speech without a concrete assignee/deadline — not a task. */
export function isRhetoricalSpeech(text: string): boolean {
  const words = text.split(/\s+/).filter(Boolean).length;
  if (words < 18) return false;
  if (CONCRETE_TASK_PATTERN.test(text) || NAMED_ASSIGNEE_PATTERN.test(text)) return false;
  if (RHETORICAL_PATTERN.test(text)) return true;
  return words > 32;
}

function formatActionNote(text: string): string {
  let t = text
    .replace(/^(so|well|okay|alright|right|yeah|look|listen)[,\s]+/i, '')
    .replace(/^(i think|we think)\s+(we|i)\s+(need to|should|have to|must)\s+/i, '')
    .replace(/^(we|i)\s+(need to|should|have to|must)\s+/i, '')
    .replace(/^please\s+/i, '');

  const byMatch = t.match(/^(.+?)\s+(by\s+.+)$/i);
  if (byMatch) {
    return truncateAtClause(`${capitalizeFirst(byMatch[1]!.trim())} ${byMatch[2]!.trim()}`);
  }

  return truncateAtClause(capitalizeFirst(t));
}

function formatDecisionNote(text: string): string {
  let t = text
    .replace(/^we (decided|agreed|confirmed|resolved|concluded|settled on|finalized|chose|picked|selected) (to |on |that )?/i, '')
    .replace(/^(everyone|the team|they) (agreed|decided|confirmed) (that |on )?/i, '')
    .replace(/^(it was |it's |its )?(confirmed|agreed|approved|finalized|resolved) (that )?/i, '')
    .replace(/^going with\s+/i, 'Go with ')
    .replace(/^we('ll| will) go with\s+/i, 'Go with ');

  const body = capitalizeFirst(t.trim());
  return truncateAtClause(body.startsWith('Decided:') ? body : `Decided: ${body.charAt(0).toLowerCase()}${body.slice(1)}`);
}

function formatInsightNote(text: string): string {
  const t = text
    .replace(/^(it is |it's |its )?(important(ly)?|worth noting|key point|note that|keep in mind)\s+(that )?/i, '')
    .replace(/^(i|we) (realized|realised|discovered|found) (that )?/i, '');

  return truncateAtClause(capitalizeFirst(t.trim()));
}

function formatSummaryNote(text: string): string {
  const words = text.split(/\s+/).filter(Boolean);

  if (words.length > 30) {
    const sentence = text.match(/^[^.!?]+[.!?]/)?.[0]?.trim();
    if (sentence && sentence.length >= 20) {
      return truncateAtClause(sentence, 120);
    }
    return truncateAtClause(text, 110);
  }

  return truncateAtClause(capitalizeFirst(text));
}

/** Rewrite STT text into a note a person would actually keep. */
export function formatHumanNote(raw: string, type: NoteType): string {
  const cleaned = cleanSpeech(raw);
  if (!cleaned) return capitalizeFirst(raw.trim());

  switch (type) {
    case 'action':
      return formatActionNote(cleaned);
    case 'decision':
      return formatDecisionNote(cleaned);
    case 'insight':
      return formatInsightNote(cleaned);
    default:
      return formatSummaryNote(cleaned);
  }
}

/** Adjust type when speech looks rhetorical but matched action heuristics. */
export function refineNoteType(raw: string, type: NoteType): NoteType {
  if (type !== 'action') return type;
  if (isRhetoricalSpeech(raw)) return 'summary';
  if (!CONCRETE_TASK_PATTERN.test(raw) && !NAMED_ASSIGNEE_PATTERN.test(raw) && raw.split(/\s+/).length > 28) return 'summary';
  return type;
}
