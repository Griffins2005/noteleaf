'use client';

import { useState, useRef, useEffect } from 'react';
import { cn } from '@/lib/cn';
import type { TranscriptSegment } from '@noteleaf/shared-types';

interface SessionTranscriptPanelProps {
  segments: TranscriptSegment[];
  liveTranscript: string;
  isRecording: boolean;
  elapsedSeconds: number;
  className?: string;
}

function formatOffset(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  const ss = s % 60;
  return `${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}

export function SessionTranscriptPanel({
  segments,
  liveTranscript,
  isRecording,
  elapsedSeconds,
  className,
}: SessionTranscriptPanelProps) {
  const [query, setQuery] = useState('');
  const liveRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to live segment while recording
  useEffect(() => {
    if (isRecording && liveTranscript) {
      liveRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [isRecording, liveTranscript]);

  const filtered = query.trim()
    ? segments.filter((s) => s.text.toLowerCase().includes(query.toLowerCase()))
    : segments;

  const isEmpty = segments.length === 0 && !isRecording;

  return (
    <aside className={cn(
      'w-[268px] shrink-0 flex-col',
      'bg-[var(--nl-color-paper-raised)]',
      'border-l border-[var(--nl-border-subtle)]',
      className,
    )}>
      {/* Header + search */}
      <div className="px-3 py-3 border-b border-[var(--nl-border-subtle)] shrink-0 space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-[10px] font-mono uppercase tracking-widest text-[var(--nl-color-ink-tertiary)]">
            Transcript
          </h3>
          {segments.length > 0 && (
            <span className="text-[9px] font-mono text-[var(--nl-color-ink-disabled)]">
              {segments.length} {segments.length === 1 ? 'segment' : 'segments'}
            </span>
          )}
        </div>
        <div className="relative">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--nl-color-ink-disabled)] pointer-events-none">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search transcript…"
            aria-label="Search transcript"
            className={cn(
              'w-full pl-7 pr-3 py-1.5 rounded-[6px]',
              'text-[11px] font-sans text-[var(--nl-color-ink-primary)]',
              'bg-[var(--nl-color-paper-sunken)] border border-[var(--nl-border-subtle)]',
              'placeholder:text-[var(--nl-color-ink-disabled)]',
              'focus:outline-none focus:border-[var(--nl-color-accent-border)]',
              'transition-colors',
            )}
          />
        </div>
      </div>

      {/* Segment list */}
      <div className="flex-1 overflow-y-auto">
        {isEmpty ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 px-4 text-center">
            <p className="text-[11px] font-mono text-[var(--nl-color-ink-disabled)] italic">
              Transcript segments will appear here as you speak.
            </p>
          </div>
        ) : filtered.length === 0 ? (
          <p className="px-4 py-4 text-[11px] font-mono text-[var(--nl-color-ink-disabled)] italic">
            No matches for "{query}"
          </p>
        ) : (
          <div className="divide-y divide-[var(--nl-border-subtle)]">
            {filtered.map((segment) => (
              <div
                key={segment.id}
                className="flex gap-3 px-3 py-2.5 hover:bg-[var(--nl-color-paper-sunken)] transition-colors"
              >
                <div className="min-w-0">
                  <span className="text-[10px] font-mono text-[var(--nl-color-ink-tertiary)] block mb-0.5">
                    {formatOffset(segment.startOffsetSeconds)}
                  </span>
                  <p className="text-[12px] font-sans leading-[1.6] text-[var(--nl-color-ink-secondary)]">
                    {query
                      ? highlightMatch(segment.text, query)
                      : segment.text}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Live segment (during recording) */}
        {isRecording && liveTranscript && (
          <div
            ref={liveRef}
            className={cn(
              'flex gap-3 px-3 py-2.5',
              'bg-[var(--nl-color-accent-subtle)]',
              'border-t border-[var(--nl-color-accent-border)]',
            )}
          >
            <span className="shrink-0 mt-0.5 w-2 h-2 rounded-full bg-red-500 animate-pulse mt-1.5" />
            <div className="min-w-0">
              <span className="text-[10px] font-mono text-[var(--nl-color-accent-primary)] block mb-0.5">
                {formatOffset(elapsedSeconds)} · live
              </span>
              <p className="text-[12px] font-sans leading-[1.6] italic text-[var(--nl-color-ink-secondary)]">
                {liveTranscript}
              </p>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}

// Highlight matching text in a segment
function highlightMatch(text: string, query: string): React.ReactNode {
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-[var(--nl-color-accent-subtle)] text-[var(--nl-color-accent-primary)] rounded-[2px] px-0.5">
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  );
}
