/**
 * Builds a recap from classified notes immediately — no LLM wait.
 * Shown as soon as recording stops; replaced when AI summary arrives.
 */

import { v4 as uuidv4 } from 'uuid';
import type { AiSummary, Note } from '@noteleaf/shared-types';
import {
  isWeakRecapLine,
  overviewFromTranscript,
  PLACEHOLDER_RECAP,
} from './speechQuality';

function trimOverview(text: string, maxLen = 220): string {
  const t = text.trim().replace(/\s+/g, ' ');
  if (t.length <= maxLen) return t;
  return t.slice(0, maxLen).replace(/\s+\S*$/, '') + '…';
}

function pickOverview(notes: Note[], transcript: string): string {
  const contentNotes = notes.filter((n) => n.content.trim() && n.type !== 'summary' && !isWeakRecapLine(n.content));
  const decisions = contentNotes.filter((n) => n.type === 'decision');
  const insights = contentNotes.filter((n) => n.type === 'insight');
  const actions = contentNotes.filter((n) => n.type === 'action');

  if (decisions[0]) return trimOverview(decisions[0].content);
  if (insights[0]) return trimOverview(insights[0].content);
  if (transcript.trim().length >= 40) return overviewFromTranscript(transcript);
  if (actions.length > 0) {
    return trimOverview(`Session covered ${actions.length} follow-up${actions.length === 1 ? '' : 's'}.`);
  }
  const anyNote = notes.find((n) => n.content.trim() && !isWeakRecapLine(n.content));
  if (anyNote) return trimOverview(anyNote.content);
  return PLACEHOLDER_RECAP;
}

export function buildInstantRecap(sessionId: string, notes: Note[], transcript = ''): AiSummary {
  const contentNotes = notes.filter((n) => n.content.trim() && n.type !== 'summary' && !isWeakRecapLine(n.content));
  const actions = contentNotes.filter((n) => n.type === 'action');
  const decisions = contentNotes.filter((n) => n.type === 'decision');
  const insights = contentNotes.filter((n) => n.type === 'insight');

  return {
    id: uuidv4(),
    sessionId,
    overview: pickOverview(notes, transcript),
    decisions: decisions.map((n) => n.content.trim()),
    actionItems: actions.map((n) => n.content.trim()),
    insights: insights.map((n) => n.content.trim()),
    modelUsed: 'instant',
    generatedAt: new Date().toISOString(),
  };
}
