/**
 * Builds a recap from classified notes immediately — no LLM wait.
 * Shown as soon as recording stops; replaced when AI summary arrives.
 */

import { v4 as uuidv4 } from 'uuid';
import type { AiSummary, Note } from '@noteleaf/shared-types';

function trimOverview(text: string, maxLen = 220): string {
  const t = text.trim().replace(/\s+/g, ' ');
  if (t.length <= maxLen) return t;
  return t.slice(0, maxLen).replace(/\s+\S*$/, '') + '…';
}

export function buildInstantRecap(sessionId: string, notes: Note[]): AiSummary {
  const contentNotes = notes.filter((n) => n.content.trim() && n.type !== 'summary');
  const actions = contentNotes.filter((n) => n.type === 'action');
  const decisions = contentNotes.filter((n) => n.type === 'decision');
  const insights = contentNotes.filter((n) => n.type === 'insight');

  let overview: string;
  if (contentNotes.length === 0) {
    overview = 'Live speech was captured. An AI-enhanced recap is on the way.';
  } else if (decisions.length > 0) {
    overview = trimOverview(decisions[0]!.content);
  } else if (insights.length > 0) {
    overview = trimOverview(insights[0]!.content);
  } else if (actions.length > 0) {
    overview = trimOverview(`Session covered ${actions.length} follow-up${actions.length === 1 ? '' : 's'}.`);
  } else if (contentNotes.length === 1) {
    overview = trimOverview(contentNotes[0]!.content);
  } else {
    overview = trimOverview(contentNotes[0]!.content);
  }

  return {
    id: uuidv4(),
    sessionId,
    overview,
    decisions: decisions.map((n) => n.content.trim()),
    actionItems: actions.map((n) => n.content.trim()),
    insights: insights.map((n) => n.content.trim()),
    modelUsed: 'instant',
    generatedAt: new Date().toISOString(),
  };
}
