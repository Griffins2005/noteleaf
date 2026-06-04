/**
 * @file nvidia.llm.service.ts
 * @description AI summarisation service using NVIDIA NIM — Nemotron 3 Super 120B.
 *
 * Calls the NVIDIA Build free-tier OpenAI-compatible endpoint to produce
 * structured JSON meeting summaries from classified notes and transcript text.
 *
 * Model: nvidia/nemotron-3-super-120b-a12b
 *   - Multi-token prediction (MTP) gives 2–3× speedup on structured JSON output.
 *   - Post-trained across 15 environments including structured generation tasks.
 *   - temperature=0 → deterministic, schema-adherent JSON every call.
 *
 * Endpoint: https://integrate.api.nvidia.com/v1 (OpenAI-compatible)
 * Auth:      Bearer nvapi-... (NVIDIA_API_KEY env var)
 * Free tier: ~40 RPM, no billing, no credits required.
 */

import OpenAI from 'openai';
import { v4 as uuidv4 } from 'uuid';
import type { AiSummary, SummarizeRequest, AskNotesRequest, AskNotesResponse, ChatCitation } from '@noteleaf/shared-types';
import { logger } from '../logger.js';

// ─── Constants ────────────────────────────────────────────────────────────────

const MODEL = 'nvidia/nemotron-3-super-120b-a12b';
const NVIDIA_BASE_URL = 'https://integrate.api.nvidia.com/v1';
const SUMMARIZE_MAX_TOKENS = 384;

// ─── Prompt ───────────────────────────────────────────────────────────────────

function buildPrompt(request: SummarizeRequest): { system: string; user: string } {
  const richNotes = request.notes.length >= 3;
  const transcriptExcerpt = richNotes ? '' : (request.transcriptExcerpt ?? '').slice(0, 800);
  const transcriptSegments = richNotes
    ? undefined
    : request.transcriptSegments?.slice(0, 12);

  const sessionLabel = request.sessionTitle
    ? `"${request.sessionTitle}"`
    : 'this session';

  const notesText = request.notes
    .slice(0, 24)
    .map((n) => `[${n.type.toUpperCase()}] ${n.content}`)
    .join('\n');

  const transcriptLines = transcriptSegments
    ?.map((segment) => {
      const start = Math.floor(segment.startOffsetSeconds);
      const end = Math.floor(segment.endOffsetSeconds);
      return `[${start}s-${end}s] ${segment.text}`;
    })
    .join('\n');

  const transcriptSection = transcriptExcerpt.trim()
    ? `\nTRANSCRIPT:\n${transcriptLines || transcriptExcerpt}`
    : '';

  const system =
    'You output ONLY a single JSON object. No markdown fences. No explanation. No prose before or after.\n' +
    'The first character of your reply MUST be { and the last MUST be }.';

  const user = `Summarise ${sessionLabel}.

NOTES:
${notesText}
${transcriptSection}

Return exactly this JSON shape (fill in values):
{"overview":"1-2 sentences","decisions":[],"actionItems":[],"insights":[]}

Rules:
- overview: what happened — not verbatim speech
- decisions: short "Decided: …" lines
- actionItems: verb-first real tasks only — empty array if none
- insights: one crisp observation each — empty array if none
- no invented facts, owners, or deadlines`;

  return { system, user };
}

// ─── Response parser ──────────────────────────────────────────────────────────

interface SummaryJsonShape {
  overview:    string;
  decisions:   string[];
  actionItems: string[];
  insights:    string[];
}

function isSummaryJsonShape(value: unknown): value is SummaryJsonShape {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj['overview'] === 'string' &&
    Array.isArray(obj['decisions']) &&
    Array.isArray(obj['actionItems']) &&
    Array.isArray(obj['insights'])
  );
}

function normalizeSummaryShape(raw: SummaryJsonShape): SummaryJsonShape {
  return {
    overview: raw.overview.trim(),
    decisions: raw.decisions.map((s) => String(s).trim()).filter(Boolean),
    actionItems: raw.actionItems.map((s) => String(s).trim()).filter(Boolean),
    insights: raw.insights.map((s) => String(s).trim()).filter(Boolean),
  };
}

/** Extract JSON from model output — handles fences, preamble, and chain-of-thought. */
function tryParseSummaryJson(rawText: string): SummaryJsonShape | null {
  const candidates: string[] = [];

  const trimmed = rawText.trim();
  candidates.push(trimmed);

  candidates.push(
    trimmed
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/, '')
      .trim(),
  );

  const first = trimmed.indexOf('{');
  const last = trimmed.lastIndexOf('}');
  if (first !== -1 && last > first) {
    candidates.push(trimmed.slice(first, last + 1));
  }

  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      const parsed = JSON.parse(candidate) as unknown;
      if (isSummaryJsonShape(parsed)) {
        return normalizeSummaryShape(parsed);
      }
    } catch {
      // try next candidate
    }
  }

  return null;
}

/** Deterministic recap from classified notes when the LLM returns prose. */
function buildFallbackSummary(request: SummarizeRequest): SummaryJsonShape {
  const contentNotes = request.notes.filter((n) => n.content.trim() && n.type !== 'summary');
  const decisions = contentNotes.filter((n) => n.type === 'decision').map((n) => n.content.trim());
  const actionItems = contentNotes.filter((n) => n.type === 'action').map((n) => n.content.trim());
  const insights = contentNotes.filter((n) => n.type === 'insight').map((n) => n.content.trim());

  let overview: string;
  if (decisions[0]) {
    overview = decisions[0]!;
  } else if (insights[0]) {
    overview = insights[0]!;
  } else if (actionItems[0]) {
    overview = `Session with ${actionItems.length} follow-up${actionItems.length === 1 ? '' : 's'}.`;
  } else if (contentNotes[0]) {
    overview = contentNotes[0]!.content.trim();
  } else {
    overview = 'Session recap from captured notes.';
  }

  return normalizeSummaryShape({
    overview,
    decisions,
    actionItems,
    insights,
  });
}

function parseResponse(rawText: string, request: SummarizeRequest): { shape: SummaryJsonShape; fromFallback: boolean } {
  const parsed = tryParseSummaryJson(rawText);
  if (parsed) return { shape: parsed, fromFallback: false };

  logger.warn(
    { sessionId: request.sessionId, raw: rawText.slice(0, 200) },
    'NVIDIA NIM returned non-JSON summary; using note-based fallback',
  );

  return { shape: buildFallbackSummary(request), fromFallback: true };
}

// ─── Service ──────────────────────────────────────────────────────────────────

export class NvidiaLlmService {
  private readonly client: OpenAI;

  constructor() {
    const apiKey = process.env['NVIDIA_API_KEY'];
    if (!apiKey) {
      throw new Error(
        'NVIDIA_API_KEY is required for AI summarisation. ' +
        'Get your free key at https://build.nvidia.com — sign in and click "Get API Key".',
      );
    }

    this.client = new OpenAI({
      apiKey,
      baseURL: NVIDIA_BASE_URL,
    });
  }

  async summariseSession(request: SummarizeRequest): Promise<AiSummary> {
    logger.info(
      { sessionId: request.sessionId, noteCount: request.notes.length, model: MODEL },
      'Generating AI summary via NVIDIA NIM',
    );

    const { system, user } = buildPrompt(request);

    let completion;
    try {
      completion = await this.client.chat.completions.create({
        model: MODEL,
        messages: [
          { role: 'system', content: system },
          { role: 'user',   content: user   },
        ],
        max_tokens: SUMMARIZE_MAX_TOKENS,
        temperature: 0,
        response_format: { type: 'json_object' },
      });
    } catch (err) {
      logger.warn({ err, sessionId: request.sessionId }, 'JSON mode unavailable; retrying without response_format');
      completion = await this.client.chat.completions.create({
        model: MODEL,
        messages: [
          { role: 'system', content: system },
          { role: 'user',   content: user   },
        ],
        max_tokens: SUMMARIZE_MAX_TOKENS,
        temperature: 0,
      });
    }

    const rawText = completion.choices[0]?.message?.content ?? '';

    if (!rawText) {
      logger.warn({ sessionId: request.sessionId }, 'NVIDIA NIM returned empty summary; using note-based fallback');
      const parsed = buildFallbackSummary(request);
      return {
        id:          uuidv4(),
        sessionId:   request.sessionId,
        overview:    parsed.overview,
        decisions:   parsed.decisions,
        actionItems: parsed.actionItems,
        insights:    parsed.insights,
        modelUsed:   'fallback',
        generatedAt: new Date().toISOString(),
      };
    }

    const { shape: parsed, fromFallback } = parseResponse(rawText, request);

    const summary: AiSummary = {
      id:          uuidv4(),
      sessionId:   request.sessionId,
      overview:    parsed.overview,
      decisions:   parsed.decisions,
      actionItems: parsed.actionItems,
      insights:    parsed.insights,
      modelUsed:   fromFallback ? 'fallback' : MODEL,
      generatedAt: new Date().toISOString(),
    };

    logger.info(
      {
        sessionId:     request.sessionId,
        summaryId:     summary.id,
        decisionCount: summary.decisions.length,
        actionCount:   summary.actionItems.length,
        insightCount:  summary.insights.length,
      },
      'AI summary generated successfully',
    );

    return summary;
  }

  // ── Chat ───────────────────────────────────────────────────────────────────

  async chatWithNotes(request: AskNotesRequest): Promise<AskNotesResponse> {
    // ── Build numbered source list ────────────────────────────────────────────

    const fmt = (sec: number) => {
      const m = Math.floor(sec / 60);
      const ss = Math.floor(sec % 60);
      return `${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
    };

    const noteLines = request.notes.map((n, i) => {
      const time = new Date(n.capturedAt).toLocaleTimeString('en-US', {
        hour: 'numeric', minute: '2-digit',
      });
      return `[${i + 1}] ${n.type.toUpperCase()}: ${n.content} (${time})`;
    });

    const segmentOffset = request.notes.length;
    const segmentLines = request.transcriptSegments.map((s, i) => {
      const label = s.id === '__live__'
        ? 'LIVE (in progress)'
        : `TRANSCRIPT ${fmt(s.startOffsetSeconds)}`;
      return `[${segmentOffset + i + 1}] ${label}: ${s.text}`;
    });

    const allSources = [...noteLines, ...segmentLines].join('\n');

    // ── Prompt — JSON-only output prevents chain-of-thought from leaking ─────
    // Nemotron reasons internally; asking for free-form text causes it to write
    // that reasoning out. A strict JSON schema forces it to produce only the
    // answer and a list of source indices.

    const system =
      'You are a meeting notes assistant. Answer using ONLY the numbered sources provided.\n\n' +
      'Important context:\n' +
      '- Sources may be rhetorical speech, monologue, jokes, or storytelling — not literal meeting tasks.\n' +
      '- Notes tagged ACTION are auto-classified from speech and may be figurative advice, not real assignments.\n' +
      '- Do NOT invent owners, responsibilities, or deadlines unless explicitly stated in the sources.\n' +
      '- For "who is responsible" questions about rhetorical advice, say the speaker is addressing the audience; do not name a person unless named in sources.\n\n' +
      'Respond with ONLY this JSON object — no other text:\n' +
      '{"answer":"1-3 sentence answer.","used":[1,3]}\n\n' +
      'If the answer is not in the sources: {"answer":"Not mentioned in this session.","used":[]}\n\n' +
      'No preamble. No explanation. No thinking. JSON only.';

    const historyMessages = request.history
      .slice(-4)
      .map((h) => ({ role: h.role as 'user' | 'assistant', content: h.content }));

    const userContent = `SOURCES:\n${allSources}\n\nQUESTION: ${request.question}`;

    logger.info(
      { noteCount: request.notes.length, segmentCount: request.transcriptSegments.length },
      'Chat: calling NVIDIA NIM',
    );

    const completion = await this.client.chat.completions.create({
      model: MODEL,
      messages: [
        { role: 'system', content: system },
        ...historyMessages,
        { role: 'user', content: userContent },
      ],
      max_tokens: 400,   // enough for JSON + longer answer without cutting off
      temperature: 0,    // deterministic — no chain-of-thought variation
    });

    const raw = (completion.choices[0]?.message?.content ?? '').trim();

    // ── Parse JSON response ───────────────────────────────────────────────────

    let answerText = '';
    let usedIndexes: number[] = [];

    const tryParse = (s: string): { answer?: string; used?: number[] } | null => {
      try { return JSON.parse(s) as { answer?: string; used?: number[] }; }
      catch { return null; }
    };

    // Attempt 1: parse after stripping markdown fences
    const stripped = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    let parsed = tryParse(stripped);

    // Attempt 2: find the first { ... } block anywhere in the response
    // (handles model preamble / chain-of-thought before the JSON)
    if (!parsed) {
      const first = raw.indexOf('{');
      const last  = raw.lastIndexOf('}');
      if (first !== -1 && last > first) {
        parsed = tryParse(raw.slice(first, last + 1));
      }
    }

    // Attempt 3: pull just the "answer" string value with a regex
    if (!parsed) {
      const extracted = raw.match(/"answer"\s*:\s*"((?:[^"\\]|\\.)*)"/)?.[1];
      if (extracted) answerText = extracted.replace(/\\"/g, '"');
      logger.warn({ raw: raw.slice(0, 400) }, 'Chat: JSON parse failed, used regex fallback');
    }

    if (parsed) {
      answerText  = (typeof parsed.answer === 'string' && parsed.answer.trim())
        ? parsed.answer.trim()
        : answerText;
      usedIndexes = Array.isArray(parsed.used)
        ? parsed.used.filter((n) => typeof n === 'number')
        : [];
    }

    if (!answerText) {
      answerText = 'I was unable to generate an answer. Please try again.';
    }

    // ── Map used indexes to citation objects ──────────────────────────────────

    const citations: ChatCitation[] = [];

    for (const idx of usedIndexes) {
      if (idx < 1) continue;

      if (idx <= request.notes.length) {
        const note = request.notes[idx - 1];
        if (note) {
          const noteType = note.type as ChatCitation['noteType'];
          citations.push({
            index: idx,
            type: 'note',
            noteId: note.id,
            ...(noteType && { noteType }),
            text: note.content,          // use the actual note text, not a model paraphrase
            capturedAt: note.capturedAt,
          });
        }
      } else {
        const segIdx = idx - request.notes.length - 1;
        const seg = request.transcriptSegments[segIdx];
        if (seg) {
          citations.push({
            index: idx,
            type: 'transcript',
            segmentId: seg.id,
            timeRange: `${fmt(seg.startOffsetSeconds)}–${fmt(seg.endOffsetSeconds)}`,
            text: seg.text,    // actual segment text, not a model paraphrase
          });
        }
      }
    }

    logger.info(
      { citationCount: citations.length },
      'Chat: answer generated',
    );

    return { answer: answerText, citations };
  }
}

/** Singleton — constructed once, shared across all route handlers. */
export const nvidiaLlmService = new NvidiaLlmService();
