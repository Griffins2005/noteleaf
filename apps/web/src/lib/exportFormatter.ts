/**
 * @file exportFormatter.ts
 * @description Pure utility functions for exporting session data as text files.
 *
 * Design decisions:
 *   - All functions are pure: input → output, no side effects.
 *   - triggerDownload() is the only function with a DOM side effect.
 *     It is separated so the core formatters remain unit-testable.
 *   - Both .txt and .md formats are supported. Markdown is structured for
 *     pasting into Notion, Confluence, or GitHub.
 *
 * Usage:
 *   // Auto-download after session ends
 *   const { txt, filename } = exportFormatter.toTxt({ title, notes, transcript, durationSeconds });
 *   exportFormatter.triggerDownload(txt, filename);
 *
 *   // Save to a File System Access API folder handle
 *   const { txt, filename } = exportFormatter.toTxt({ ... });
 *   await exportFormatter.saveToFolder(folderHandle, txt, filename);
 */

import type { AiSummary, Note, TranscriptSegment } from '@noteleaf/shared-types';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ExportInput {
  title: string;
  notes: Note[];
  transcript: string;
  transcriptSegments?: TranscriptSegment[];
  aiSummary?: AiSummary;
  durationSeconds: number;
}

export interface ExportOutput {
  /** The formatted file content. */
  txt: string;
  /** Suggested filename, e.g. 'weekly-standup-2025-05-09.txt' */
  filename: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Formats elapsed seconds into a human-readable duration string.
 * e.g. 185 → '3m 5s'
 */
function formatDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${seconds}s`;
  return `${minutes}m ${seconds}s`;
}

function formatOffset(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;
  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}

/**
 * Formats a date for use in a filename.
 * e.g. new Date() → '2025-05-09'
 */
function formatDateForFilename(date: Date): string {
  return date.toISOString().split('T')[0] ?? 'unknown-date';
}

/**
 * Sanitises a session title for use in a filename.
 * Lowercases, replaces spaces and special characters with hyphens,
 * trims leading/trailing hyphens, truncates to 40 characters.
 */
function sanitiseTitleForFilename(title: string): string {
  return (title || 'untitled-session')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

/**
 * Maps a NoteType to a display label for plain-text export.
 */
const NOTE_TYPE_LABELS: Record<Note['type'], string> = {
  action:   'ACTION',
  decision: 'DECISION',
  insight:  'INSIGHT',
  summary:  'NOTE',
};

// ─── Formatters ───────────────────────────────────────────────────────────────

/**
 * Formats session data as a plain .txt file.
 * Optimised for readability in any text editor.
 */
function toTxt(input: ExportInput): ExportOutput {
  const { title, notes, transcript, transcriptSegments = [], aiSummary, durationSeconds } = input;
  const now = new Date();
  const displayTitle = title || 'Untitled Session';
  const lines: string[] = [];

  // Header
  lines.push(`NOTELEAF — ${displayTitle.toUpperCase()}`);
  lines.push('='.repeat(60));
  lines.push(`Date:     ${now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`);
  lines.push(`Time:     ${now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`);
  lines.push(`Duration: ${formatDuration(durationSeconds)}`);
  lines.push(`Notes:    ${notes.length}`);
  lines.push('');

  // AI-generated meeting summary, when available
  if (aiSummary) {
    lines.push('MEETING SUMMARY');
    lines.push('─'.repeat(40));
    lines.push(aiSummary.overview);
    lines.push('');

    if (aiSummary.decisions.length > 0) {
      lines.push('KEY DECISIONS');
      aiSummary.decisions.forEach((item) => lines.push(`  • ${item}`));
      lines.push('');
    }

    if (aiSummary.actionItems.length > 0) {
      lines.push('ACTION ITEMS FROM SUMMARY');
      aiSummary.actionItems.forEach((item) => lines.push(`  □ ${item}`));
      lines.push('');
    }

    if (aiSummary.insights.length > 0) {
      lines.push('SUMMARY INSIGHTS');
      aiSummary.insights.forEach((item) => lines.push(`  • ${item}`));
      lines.push('');
    }
  }

  // AI-ready structured sections by type
  const notesByType = {
    action:   notes.filter((n) => n.type === 'action'),
    decision: notes.filter((n) => n.type === 'decision'),
    insight:  notes.filter((n) => n.type === 'insight'),
    summary:  notes.filter((n) => n.type === 'summary'),
  };

  if (notesByType.action.length > 0) {
    lines.push('ACTION ITEMS');
    lines.push('─'.repeat(40));
    notesByType.action.forEach((n) => lines.push(`  • ${n.content}`));
    lines.push('');
  }

  if (notesByType.decision.length > 0) {
    lines.push('DECISIONS');
    lines.push('─'.repeat(40));
    notesByType.decision.forEach((n) => lines.push(`  • ${n.content}`));
    lines.push('');
  }

  if (notesByType.insight.length > 0) {
    lines.push('INSIGHTS');
    lines.push('─'.repeat(40));
    notesByType.insight.forEach((n) => lines.push(`  • ${n.content}`));
    lines.push('');
  }

  if (notesByType.summary.length > 0) {
    lines.push('NOTES');
    lines.push('─'.repeat(40));
    notesByType.summary.forEach((n) => lines.push(`  • ${n.content}`));
    lines.push('');
  }

  // All notes in chronological order
  lines.push('ALL NOTES (CHRONOLOGICAL)');
  lines.push('─'.repeat(40));
  notes.forEach((n) => {
    lines.push(`[${NOTE_TYPE_LABELS[n.type]}] ${n.capturedAt.slice(11, 16)}`);
    lines.push(`  ${n.content}`);
    if (n.tags.length > 0) {
      lines.push(`  tags: ${n.tags.map((t) => `#${t}`).join(' ')}`);
    }
    lines.push('');
  });

  // Verbatim timestamped transcript
  if (transcriptSegments.length > 0 || transcript) {
    lines.push('─'.repeat(60));
    lines.push('VERBATIM TRANSCRIPT WITH TIMESTAMPS');
    lines.push('─'.repeat(40));
    if (transcriptSegments.length > 0) {
      transcriptSegments.forEach((segment) => {
        lines.push(
          `[${formatOffset(segment.startOffsetSeconds)}–${formatOffset(segment.endOffsetSeconds)}] ${segment.text}`,
        );
      });
    } else {
      lines.push(transcript);
    }
    lines.push('');
  }

  lines.push('─'.repeat(60));
  lines.push(`Generated by Noteleaf on ${now.toISOString()}`);

  const filename = `${sanitiseTitleForFilename(title)}-${formatDateForFilename(now)}.txt`;

  return { txt: lines.join('\n'), filename };
}

/**
 * Formats session data as a Markdown .md file.
 * Structured for pasting into Notion, Confluence, GitHub, or Obsidian.
 */
function toMarkdown(input: ExportInput): ExportOutput {
  const { title, notes, transcript, transcriptSegments = [], aiSummary, durationSeconds } = input;
  const now = new Date();
  const displayTitle = title || 'Untitled Session';
  const lines: string[] = [];

  // Frontmatter
  lines.push('---');
  lines.push(`title: "${displayTitle}"`);
  lines.push(`date: ${now.toISOString()}`);
  lines.push(`duration: "${formatDuration(durationSeconds)}"`);
  lines.push(`notes: ${notes.length}`);
  lines.push(`source: noteleaf`);
  lines.push('---');
  lines.push('');

  // Title
  lines.push(`# ${displayTitle}`);
  lines.push('');
  lines.push(`*${now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })} · ${formatDuration(durationSeconds)} · ${notes.length} notes*`);
  lines.push('');

  if (aiSummary) {
    lines.push('## Meeting Summary');
    lines.push('');
    lines.push(aiSummary.overview);
    lines.push('');

    if (aiSummary.decisions.length > 0) {
      lines.push('### Key Decisions');
      lines.push('');
      aiSummary.decisions.forEach((item) => lines.push(`- ${item}`));
      lines.push('');
    }

    if (aiSummary.actionItems.length > 0) {
      lines.push('### Action Items');
      lines.push('');
      aiSummary.actionItems.forEach((item) => lines.push(`- [ ] ${item}`));
      lines.push('');
    }

    if (aiSummary.insights.length > 0) {
      lines.push('### Insights');
      lines.push('');
      aiSummary.insights.forEach((item) => lines.push(`- ${item}`));
      lines.push('');
    }
  }

  // Action items
  const actions = notes.filter((n) => n.type === 'action');
  if (actions.length > 0) {
    lines.push('## Action Items');
    lines.push('');
    actions.forEach((n) => lines.push(`- [ ] ${n.content}`));
    lines.push('');
  }

  // Decisions
  const decisions = notes.filter((n) => n.type === 'decision');
  if (decisions.length > 0) {
    lines.push('## Decisions');
    lines.push('');
    decisions.forEach((n) => lines.push(`- ${n.content}`));
    lines.push('');
  }

  // Insights
  const insights = notes.filter((n) => n.type === 'insight');
  if (insights.length > 0) {
    lines.push('## Insights');
    lines.push('');
    insights.forEach((n) => lines.push(`- ${n.content}`));
    lines.push('');
  }

  // Summary notes
  const summaries = notes.filter((n) => n.type === 'summary');
  if (summaries.length > 0) {
    lines.push('## Notes');
    lines.push('');
    summaries.forEach((n) => lines.push(`- ${n.content}`));
    lines.push('');
  }

  // Full transcript (collapsible in GitHub/Notion)
  if (transcriptSegments.length > 0 || transcript) {
    lines.push('## Verbatim Transcript');
    lines.push('');
    lines.push('<details>');
    lines.push('<summary>Expand timestamped transcript</summary>');
    lines.push('');
    if (transcriptSegments.length > 0) {
      transcriptSegments.forEach((segment) => {
        lines.push(
          `- \`${formatOffset(segment.startOffsetSeconds)}-${formatOffset(segment.endOffsetSeconds)}\` ${segment.text}`,
        );
      });
    } else {
      lines.push(transcript);
    }
    lines.push('');
    lines.push('</details>');
    lines.push('');
  }

  lines.push('---');
  lines.push(`*Generated by [Noteleaf](https://noteleaf.app)*`);

  const filename = `${sanitiseTitleForFilename(title)}-${formatDateForFilename(now)}.md`;

  return { txt: lines.join('\n'), filename };
}

/**
 * Plain-text recap for clipboard or email — overview, decisions, actions, insights.
 */
function toRecapPlainText(input: ExportInput): string {
  const { title, notes, aiSummary, durationSeconds } = input;
  const displayTitle = title || 'Untitled Session';
  const lines: string[] = [];

  lines.push(`Meeting recap: ${displayTitle}`);
  lines.push(`Duration: ${formatDuration(durationSeconds)}`);
  lines.push('');

  if (aiSummary?.overview) {
    lines.push('SUMMARY');
    lines.push(aiSummary.overview);
    lines.push('');
  }

  const actionItems = aiSummary?.actionItems.length
    ? aiSummary.actionItems
    : notes.filter((n) => n.type === 'action').map((n) => n.content);

  if (actionItems.length > 0) {
    lines.push('ACTION ITEMS');
    actionItems.forEach((item) => lines.push(`☐ ${item}`));
    lines.push('');
  }

  const decisions = aiSummary?.decisions.length
    ? aiSummary.decisions
    : notes.filter((n) => n.type === 'decision').map((n) => n.content);

  if (decisions.length > 0) {
    lines.push('DECISIONS');
    decisions.forEach((item) => lines.push(`• ${item}`));
    lines.push('');
  }

  const insights = aiSummary?.insights.length
    ? aiSummary.insights
    : notes.filter((n) => n.type === 'insight').map((n) => n.content);

  if (insights.length > 0) {
    lines.push('KEY TAKEAWAYS');
    insights.forEach((item) => lines.push(`• ${item}`));
    lines.push('');
  }

  lines.push('—');
  lines.push('Captured with Noteleaf (ambient AI notetaker — no meeting bot)');

  return lines.join('\n');
}

/** Markdown checklist of action items — paste into task tools. */
function toActionItemsChecklist(input: ExportInput): string {
  const { notes, aiSummary } = input;
  const items = aiSummary?.actionItems.length
    ? aiSummary.actionItems
    : notes.filter((n) => n.type === 'action').map((n) => n.content);

  if (items.length === 0) return 'No action items captured in this session.';
  return items.map((item) => `- [ ] ${item}`).join('\n');
}

/** Key takeaways only — for quick paste into Slack, docs, or chat. */
function toKeyTakeawaysPlainText(input: ExportInput): string {
  const { title, notes, aiSummary } = input;
  const displayTitle = title || 'Untitled Session';
  const takeaways = aiSummary?.insights.length
    ? aiSummary.insights
    : notes.filter((n) => n.type === 'insight').map((n) => n.content);

  if (takeaways.length === 0) {
    return `No key takeaways captured in "${displayTitle}".`;
  }

  const lines = [`Key takeaways — ${displayTitle}`, ''];
  takeaways.forEach((item) => lines.push(`• ${item}`));
  lines.push('', '—', 'Captured with Noteleaf');
  return lines.join('\n');
}

function toMailtoUrl(input: ExportInput, recipient = ''): string {
  const displayTitle = input.title || 'Untitled Session';
  const subject = encodeURIComponent(`Meeting recap: ${displayTitle}`);
  const body = encodeURIComponent(toRecapPlainText(input));
  const to = recipient ? encodeURIComponent(recipient) : '';
  return `mailto:${to}?subject=${subject}&body=${body}`;
}

async function copyToClipboard(text: string): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.clipboard) return false;
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

// ─── DOM / File System actions ────────────────────────────────────────────────

/**
 * Triggers a browser file download.
 * NOTE: This is the only function in this module with a DOM side effect.
 * It must not be called during SSR (Next.js server components).
 */
function triggerDownload(content: string, filename: string): void {
  if (typeof window === 'undefined') return;

  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();

  // Clean up the object URL to free memory
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * Saves content to a file in a user-selected folder using the
 * File System Access API.
 *
 * @throws If the folder handle is not writable or the write fails.
 */
async function saveToFolder(
  folderHandle: FileSystemDirectoryHandle,
  content: string,
  filename: string,
): Promise<void> {
  const fileHandle = await folderHandle.getFileHandle(filename, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(content);
  await writable.close();
}

// ─── Public API ───────────────────────────────────────────────────────────────

export const exportFormatter = {
  toTxt,
  toMarkdown,
  toRecapPlainText,
  toActionItemsChecklist,
  toKeyTakeawaysPlainText,
  toMailtoUrl,
  copyToClipboard,
  triggerDownload,
  saveToFolder,
};
