'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { http, HttpError } from '@/lib/http.client';
import { notesForChat, segmentsForChat } from '@/lib/sessionContext';
import { getSuggestedQuestions, hasMoreToExplore } from '@/lib/suggestedQuestions';
import { cn } from '@/lib/cn';
import type { ChatMessage, ChatCitation, AskNotesResponse, Note, TranscriptSegment } from '@noteleaf/shared-types';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ChatPanelProps {
  sessionId: string | null;
  notes: Note[];
  transcriptSegments: TranscriptSegment[];
  fullTranscript?: string;
  liveTranscript?: string;
  isRecording?: boolean;
  sessionTitle: string;
  initialMessages?: ChatMessage[];
  onMessagesPersisted?: (messages: ChatMessage[]) => void;
}

// ─── Citations list — compact footnote rows ───────────────────────────────────

const TYPE_DOT_COLOR: Record<string, string> = {
  action:     'bg-[var(--nl-color-note-action-bar)]',
  decision:   'bg-[var(--nl-color-note-decision-bar)]',
  insight:    'bg-[var(--nl-color-note-insight-bar)]',
  summary:    'bg-[var(--nl-color-note-summary-bar)]',
  transcript: 'bg-[var(--nl-color-ink-disabled)]',
};

function CitationRow({ citation }: { citation: ChatCitation }) {
  const isNote = citation.type === 'note';
  const time   = citation.capturedAt
    ? new Date(citation.capturedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    : citation.timeRange ?? '';

  const typeKey  = isNote ? (citation.noteType ?? 'summary') : 'transcript';
  const dotColor = TYPE_DOT_COLOR[typeKey] ?? TYPE_DOT_COLOR['summary'];

  // Truncate quote to keep rows compact
  const maxLen = 90;
  const quote  = citation.text.length > maxLen
    ? citation.text.slice(0, maxLen).trimEnd() + '…'
    : citation.text;

  return (
    <div className="flex items-baseline gap-2 py-1 border-b border-[var(--nl-border-subtle)] last:border-0">
      {/* Index number */}
      <span className="text-[10px] font-mono text-[var(--nl-color-ink-disabled)] shrink-0 w-5 text-right">
        {citation.index}
      </span>

      {/* Type dot */}
      <span className={cn('w-1.5 h-1.5 rounded-full shrink-0 mt-[3px]', dotColor)} aria-hidden="true" />

      {/* Label */}
      <span className="text-[10px] font-mono text-[var(--nl-color-ink-tertiary)] shrink-0 capitalize">
        {isNote ? (citation.noteType ?? 'note') : 'transcript'}
      </span>

      {/* Time */}
      <span className="text-[10px] font-mono text-[var(--nl-color-ink-disabled)] shrink-0">
        {time}
      </span>

      {/* Truncated quote */}
      <span className="text-[11px] font-sans text-[var(--nl-color-ink-secondary)] min-w-0 flex-1 line-clamp-2">
        "{quote}"
      </span>
    </div>
  );
}

// ─── Inline citation marker styling ──────────────────────────────────────────
// Replace [N] in answer text with a styled superscript span.

function AnswerText({ text }: { text: string }) {
  const parts = text.split(/(\[\d+\])/g);
  return (
    <p className="text-[14px] font-sans leading-[1.7] text-[var(--nl-color-ink-primary)] whitespace-pre-wrap">
      {parts.map((part, i) => {
        if (/^\[\d+\]$/.test(part)) {
          return (
            <sup
              key={i}
              className="inline-flex items-center justify-center w-4 h-4 text-[9px] font-mono font-bold rounded-full bg-[var(--nl-color-accent-border)] text-[var(--nl-color-accent-primary)] mx-0.5 align-super"
            >
              {part.slice(1, -1)}
            </sup>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </p>
  );
}

// ─── Message bubble ───────────────────────────────────────────────────────────

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';

  if (isUser) {
    return (
      <div className="flex justify-end w-full">
        <div className={cn(
          'max-w-[min(100%,42rem)] px-4 py-2.5 rounded-[var(--nl-radius-lg)] rounded-br-[4px]',
          'bg-[var(--nl-color-accent-primary)] text-white',
          'text-[14px] font-sans leading-[1.65]',
        )}>
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2.5 w-full">
      {/* Answer */}
      <div className={cn(
        'w-full px-4 py-3 rounded-[var(--nl-radius-lg)] rounded-bl-[4px]',
        'bg-[var(--nl-color-paper-raised)] border border-[var(--nl-border-subtle)]',
      )}>
        <AnswerText text={message.content} />
      </div>

      {/* Citations — compact footnote rows */}
      {message.citations && message.citations.length > 0 && (
        <div className="w-full rounded-[var(--nl-radius-md)] border border-[var(--nl-border-subtle)] bg-[var(--nl-color-paper-raised)] overflow-hidden">
          {/* Header */}
          <div className="flex items-center gap-2 px-3 py-1.5 border-b border-[var(--nl-border-subtle)] bg-[var(--nl-color-paper-sunken)]">
            <span className="text-[9px] font-mono uppercase tracking-widest text-[var(--nl-color-ink-disabled)]">
              Sources
            </span>
            <span className="text-[9px] font-mono text-[var(--nl-color-ink-disabled)]">
              {message.citations.length}
            </span>
          </div>
          {/* Rows */}
          <div className="px-3 py-1">
            {message.citations.map((c) => (
              <CitationRow key={c.index} citation={c} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────

export function ChatPanel({
  sessionId,
  notes,
  transcriptSegments,
  fullTranscript = '',
  liveTranscript = '',
  isRecording = false,
  sessionTitle,
  initialMessages = [],
  onMessagesPersisted,
}: ChatPanelProps) {
  const [messages, setMessages]       = useState<ChatMessage[]>(initialMessages);
  const [input, setInput]       = useState('');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const bottomRef               = useRef<HTMLDivElement>(null);
  const inputRef                = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setMessages(initialMessages);
  }, [sessionId, initialMessages]);

  useEffect(() => {
    setInput('');
    setError(null);
  }, [sessionId]);

  const contextOptions = {
    liveTranscript,
    fullTranscript,
    isRecording,
  };

  const apiNotes = useMemo(() => notesForChat(notes), [notes]);
  const apiSegments = useMemo(
    () => segmentsForChat(transcriptSegments, contextOptions),
    [transcriptSegments, liveTranscript, fullTranscript, isRecording],
  );
  const hasContext = apiNotes.length > 0 || apiSegments.length > 0;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  async function handleSend() {
    const q = input.trim();
    if (!q || loading || !hasContext || !sessionId) return;

    const userMsg: ChatMessage = {
      id:        uuidv4(),
      role:      'user',
      content:   q,
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);
    setError(null);

    // Build history from prior turns (exclude current question).
    const history = messages.map((m) => ({ role: m.role, content: m.content }));

    try {
      const res = await http.post<AskNotesResponse>('/api/chat/ask', {
        sessionId,
        question: q,
        notes: apiNotes,
        transcriptSegments: apiSegments,
        history,
      });

      const assistantMsg: ChatMessage = {
        id:        uuidv4(),
        role:      'assistant',
        content:   res.answer,
        citations: res.citations,
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => {
        const next = [...prev, assistantMsg];
        onMessagesPersisted?.(next);
        return next;
      });
    } catch (err) {
      setMessages((prev) => prev.filter((m) => m.id !== userMsg.id));
      const message = err instanceof HttpError
        ? err.apiError.message
        : err instanceof Error
          ? err.message
          : 'Failed to get answer.';
      setError(message);
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  }

  // ── Context-aware suggested questions (refresh as conversation grows) ─────

  const askedQuestions = useMemo(
    () => messages.filter((m) => m.role === 'user').map((m) => m.content),
    [messages],
  );

  const suggestedQuestions = useMemo(
    () => getSuggestedQuestions({
      notes,
      transcriptSegments,
      askedQuestions,
      isRecording,
      max: 3,
    }),
    [notes, transcriptSegments, askedQuestions, isRecording],
  );

  const showSuggestions = suggestedQuestions.length > 0;
  const exploredAll = messages.length > 0 && !hasMoreToExplore({
    notes,
    transcriptSegments,
    askedQuestions,
    isRecording,
  });

  // ── Empty state ─────────────────────────────────────────────────────────────

  if (!hasContext) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 w-full min-h-0 min-w-0 px-7 py-12">
        <div className="w-14 h-14 rounded-full border border-[var(--nl-border-default)] bg-[var(--nl-color-paper-raised)] flex items-center justify-center">
          {isRecording ? (
            <span className="w-3 h-3 rounded-full bg-red-500 animate-pulse" aria-hidden="true" />
          ) : (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--nl-color-ink-disabled)]">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
          )}
        </div>
        <div className="max-w-sm">
          <p className="font-serif text-[17px] text-[var(--nl-color-ink-primary)] mb-2">
            {isRecording ? 'Listening…' : 'No notes to chat with yet'}
          </p>
          <p className="text-[12px] font-sans text-[var(--nl-color-ink-tertiary)] leading-relaxed mx-auto">
            {isRecording
              ? 'Start speaking — context appears here within a few seconds. You can ask questions while the meeting continues.'
              : 'Record a session first. Once speech is captured, come back here to ask questions.'}
          </p>
        </div>
      </div>
    );
  }

  // ── Chat UI ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col flex-1 h-full w-full min-h-0 min-w-0">

      {/* Context header — full panel width */}
      <div className="flex items-center gap-3 px-7 py-3 border-b border-[var(--nl-border-subtle)] bg-[var(--nl-color-paper-base)] shrink-0 w-full min-w-0">
        <div className="flex-1 min-w-0">
          <p className="text-[12px] font-sans font-medium text-[var(--nl-color-ink-secondary)] truncate">
            {sessionTitle || 'Untitled session'}
          </p>
          <p className="text-[10px] font-mono text-[var(--nl-color-ink-disabled)] mt-0.5">
            {apiNotes.length} {apiNotes.length === 1 ? 'note' : 'notes'}
            {apiSegments.length > 0 && ` · ${apiSegments.length} transcript sources`}
            {isRecording && liveTranscript.trim() && ' · live speech'}
          </p>
        </div>
        {isRecording ? (
          <span className="flex items-center gap-1.5 text-[10px] font-mono text-red-600 border border-red-200 bg-red-50 px-2 py-1 rounded-full shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" aria-hidden="true" />
            live
          </span>
        ) : (
          <span className="flex items-center gap-1 text-[10px] font-mono text-[var(--nl-color-accent-primary)] border border-[var(--nl-color-accent-border)] bg-[var(--nl-color-accent-subtle)] px-2 py-1 rounded-full shrink-0">
            <svg width="8" height="8" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="4"/></svg>
            session-scoped
          </span>
        )}
      </div>

      {/* Message list */}
      <div className={cn(
        'flex-1 overflow-y-auto px-7 py-6 space-y-5 w-full min-w-0',
        messages.length === 0 && 'flex flex-col justify-center',
      )}>

        {/* Initial suggested questions — before first message */}
        {messages.length === 0 && showSuggestions && (
          <div className="space-y-3 w-full py-4">
            <p className="font-serif text-[16px] text-[var(--nl-color-ink-tertiary)]">
              {isRecording ? 'Ask while the meeting is in progress' : 'Ask anything about this meeting'}
            </p>
            {isRecording && (
              <p className="text-[11px] font-mono text-[var(--nl-color-ink-disabled)] leading-relaxed mb-1">
                Answers use everything captured so far, including speech still being transcribed.
              </p>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2 w-full">
              {suggestedQuestions.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => { setInput(q); inputRef.current?.focus(); }}
                  disabled={loading}
                  className={cn(
                    'text-left px-3.5 py-2 rounded-[var(--nl-radius-md)]',
                    'text-[12px] font-sans text-[var(--nl-color-ink-secondary)]',
                    'border border-[var(--nl-border-default)] bg-[var(--nl-color-paper-raised)]',
                    'hover:border-[var(--nl-color-accent-border)] hover:bg-[var(--nl-color-accent-subtle)]',
                    'transition-colors disabled:opacity-50',
                  )}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.length === 0 && !showSuggestions && (
          <div className="text-center py-8">
            <p className="font-serif text-[16px] text-[var(--nl-color-ink-tertiary)]">
              Type a question about this session
            </p>
          </div>
        )}

        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}

        {/* Loading bubble */}
        {loading && (
          <div className="flex gap-1.5 px-4 py-3 rounded-[var(--nl-radius-lg)] rounded-bl-[4px] bg-[var(--nl-color-paper-raised)] border border-[var(--nl-border-subtle)] w-16">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="w-1.5 h-1.5 rounded-full bg-[var(--nl-color-ink-disabled)] animate-bounce"
                style={{ animationDelay: `${i * 0.15}s` }}
              />
            ))}
          </div>
        )}

        {/* Error */}
        {error && (
          <p className="text-[12px] font-mono text-[var(--nl-color-danger)] px-1">
            {error}
          </p>
        )}

        {/* Follow-up suggestions — after each turn until scope is covered */}
        {messages.length > 0 && showSuggestions && (
          <div className="space-y-2 py-2 w-full">
            <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--nl-color-ink-disabled)]">
              Explore further
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2 w-full">
              {suggestedQuestions.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => { setInput(q); inputRef.current?.focus(); }}
                  disabled={loading}
                  className={cn(
                    'text-left px-3.5 py-2 rounded-[var(--nl-radius-md)]',
                    'text-[12px] font-sans text-[var(--nl-color-ink-secondary)]',
                    'border border-[var(--nl-border-default)] bg-[var(--nl-color-paper-raised)]',
                    'hover:border-[var(--nl-color-accent-border)] hover:bg-[var(--nl-color-accent-subtle)]',
                    'transition-colors disabled:opacity-50',
                  )}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {exploredAll && (
          <p className="text-center text-[11px] font-mono text-[var(--nl-color-ink-disabled)] py-2">
            You&apos;ve covered the main topics in this session. Ask anything else below.
          </p>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input — full panel width */}
      <div className="shrink-0 w-full min-w-0 border-t border-[var(--nl-border-subtle)] bg-[var(--nl-color-paper-base)]">
        <div className={cn(
          'flex items-end gap-3 w-full min-w-0',
          'px-7 py-3',
          'focus-within:bg-[var(--nl-color-paper-raised)]',
          'transition-colors',
        )}>
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              e.target.style.height = 'auto';
              e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
            }}
            onKeyDown={handleKeyDown}
            placeholder={isRecording ? 'Ask about what\'s been said so far…' : 'Ask about this meeting… (Enter to send)'}
            rows={1}
            disabled={loading}
            className={cn(
              'flex-1 resize-none overflow-hidden bg-transparent border-none outline-none',
              'text-[13px] font-sans text-[var(--nl-color-ink-primary)]',
              'placeholder:text-[var(--nl-color-ink-disabled)]',
              'disabled:opacity-50',
            )}
          />
          <button
            type="button"
            onClick={() => void handleSend()}
            disabled={!input.trim() || loading}
            aria-label="Send"
            className={cn(
              'shrink-0 w-8 h-8 rounded-[var(--nl-radius-md)] flex items-center justify-center',
              'bg-[var(--nl-color-accent-primary)] text-white',
              'hover:bg-[var(--nl-color-accent-hover)]',
              'disabled:opacity-30 disabled:cursor-not-allowed',
              'transition-all',
            )}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13"/>
              <polygon points="22 2 15 22 11 13 2 9 22 2"/>
            </svg>
          </button>
        </div>
        <p className="text-[9px] font-mono text-[var(--nl-color-ink-disabled)] mt-1.5 px-7 pb-3">
          {isRecording
            ? 'Context updates live as you speak · answers cite captured sources only'
            : 'Answers are grounded in this session only · every claim cites the exact source'}
        </p>
      </div>
    </div>
  );
}
