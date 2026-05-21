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
const MAX_TOKENS = 1024;

// ─── Prompt ───────────────────────────────────────────────────────────────────

function buildPrompt(request: SummarizeRequest): { system: string; user: string } {
  const sessionLabel = request.sessionTitle
    ? `a meeting titled "${request.sessionTitle}"`
    : 'an untitled meeting';

  const notesText = request.notes
    .map((n) => `[${n.type.toUpperCase()}] ${n.content}`)
    .join('\n');

  const transcriptLines = request.transcriptSegments
    ?.map((segment) => {
      const start = Math.floor(segment.startOffsetSeconds);
      const end = Math.floor(segment.endOffsetSeconds);
      return `[${start}s-${end}s] ${segment.text}`;
    })
    .join('\n');

  const transcriptSection = request.transcriptExcerpt
    ? `\nVERBATIM TRANSCRIPT EXCERPT:\n${transcriptLines || request.transcriptExcerpt}`
    : '';

  const system =
    'You are a meeting notes writer. Read raw auto-captured speech notes and ' +
    'return a structured JSON summary. Respond ONLY with valid JSON — ' +
    'no markdown fences, no explanation, no preamble.';

  const user = `Summarise ${sessionLabel}.

RAW NOTES:
${notesText}
${transcriptSection}

Return exactly this JSON schema:
{
  "overview": "1-2 sentences: meeting purpose and outcome",
  "decisions": ["each decision reached — empty array if none"],
  "actionItems": ["verb + task + owner if mentioned — empty array if none"],
  "insights": ["notable ideas or discussion themes — empty array if none"]
}

Rules:
- Return empty arrays [] for sections with nothing relevant.
- Do not invent information. Only use what is in the notes or transcript.
- Each item is one concise sentence.
- Action items must start with a verb (Schedule, Send, Review, etc).`;

  return { system, user };
}

// ─── Response parser ──────────────────────────────────────────────────────────

interface SummaryJsonShape {
  overview:    string;
  decisions:   string[];
  actionItems: string[];
  insights:    string[];
}

function parseResponse(rawText: string): SummaryJsonShape {
  const cleaned = rawText
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();

  const parsed = JSON.parse(cleaned) as unknown;

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    typeof (parsed as Record<string, unknown>)['overview']    !== 'string' ||
    !Array.isArray((parsed as Record<string, unknown>)['decisions'])   ||
    !Array.isArray((parsed as Record<string, unknown>)['actionItems']) ||
    !Array.isArray((parsed as Record<string, unknown>)['insights'])
  ) {
    throw new Error(
      `NVIDIA NIM response did not match expected schema. Raw: ${rawText.slice(0, 200)}`,
    );
  }

  return parsed as SummaryJsonShape;
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

    const completion = await this.client.chat.completions.create({
      model: MODEL,
      messages: [
        { role: 'system', content: system },
        { role: 'user',   content: user   },
      ],
      max_tokens:  MAX_TOKENS,
      temperature: 0,
    });

    const rawText = completion.choices[0]?.message?.content ?? '';

    if (!rawText) {
      throw new Error('NVIDIA NIM returned an empty response');
    }

    const parsed = parseResponse(rawText);

    const summary: AiSummary = {
      id:          uuidv4(),
      sessionId:   request.sessionId,
      overview:    parsed.overview,
      decisions:   parsed.decisions,
      actionItems: parsed.actionItems,
      insights:    parsed.insights,
      modelUsed:   MODEL,
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
    const segmentLines = request.transcriptSegments.map((s, i) =>
      `[${segmentOffset + i + 1}] TRANSCRIPT ${fmt(s.startOffsetSeconds)}: ${s.text}`,
    );

    const allSources = [...noteLines, ...segmentLines].join('\n');

    // ── Prompt — JSON-only output prevents chain-of-thought from leaking ─────
    // Nemotron reasons internally; asking for free-form text causes it to write
    // that reasoning out. A strict JSON schema forces it to produce only the
    // answer and a list of source indices.

    const system =
      'You are a meeting notes assistant. Answer using ONLY the numbered sources provided.\n\n' +
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
