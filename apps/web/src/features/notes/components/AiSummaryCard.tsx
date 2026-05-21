'use client';

import { cn } from '@/lib/cn';
import type { AiSummary } from '@noteleaf/shared-types';

export type AiSummaryCardState = 'idle' | 'loading' | 'success' | 'error';

export interface AiSummaryCardProps {
  state: AiSummaryCardState;
  summary?: AiSummary;
  onRetry: () => void;
  className?: string;
}

function Section({ icon, title, children }: { icon: string; title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-widest text-[var(--nl-color-ink-tertiary)] mb-2.5">
        <span aria-hidden="true">{icon}</span>
        {title}
      </h4>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function Bullet({ text }: { text: string }) {
  return (
    <p className="flex items-start gap-2.5 text-[14px] font-sans leading-[1.6] text-[var(--nl-color-ink-primary)]">
      <span className="mt-[5px] w-1.5 h-1.5 rounded-full bg-[var(--nl-border-default)] shrink-0" aria-hidden="true" />
      {text}
    </p>
  );
}

function ActionItem({ text }: { text: string }) {
  return (
    <label className="flex items-start gap-2.5 cursor-pointer group">
      <span className="mt-[3px] w-4 h-4 shrink-0 rounded border border-[var(--nl-border-default)] group-hover:border-[var(--nl-color-accent-primary)] flex items-center justify-center transition-colors" aria-hidden="true" />
      <span className="text-[14px] font-sans leading-[1.6] text-[var(--nl-color-ink-primary)]">{text}</span>
    </label>
  );
}

export function AiSummaryCard({ state, summary, onRetry, className }: AiSummaryCardProps) {
  return (
    <div
      className={cn(
        'rounded-[var(--nl-radius-lg)] overflow-hidden',
        'border border-[var(--nl-border-default)]',
        'bg-[var(--nl-color-paper-base)]',
        'shadow-[var(--nl-shadow-sm)]',
        'animate-[summaryIn_0.3s_ease-out_both]',
        className,
      )}
      aria-label="AI meeting summary"
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-5 py-3.5 border-b border-[var(--nl-border-subtle)]">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          className="text-[var(--nl-color-accent-primary)] shrink-0">
          <path d="M12 2L9.5 9.5 2 12l7.5 2.5L12 22l2.5-7.5L22 12l-7.5-2.5z"/>
        </svg>
        <span className="font-serif text-[15px] font-medium text-[var(--nl-color-ink-primary)]">
          Meeting Recap
        </span>
        {state === 'success' && summary && (
          <time className="ml-auto text-[10px] font-mono text-[var(--nl-color-ink-disabled)]">
            {new Date(summary.generatedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
          </time>
        )}
      </div>

      {/* Loading */}
      {state === 'loading' && (
        <div className="px-5 py-5 space-y-3">
          <p className="text-[13px] font-sans text-[var(--nl-color-accent-primary)] font-medium">
            Generating your meeting recap…
          </p>
          <div className="space-y-2 animate-pulse">
            <div className="h-2.5 bg-[var(--nl-border-default)] opacity-40 rounded-full w-4/5" />
            <div className="h-2.5 bg-[var(--nl-border-default)] opacity-30 rounded-full w-full" />
            <div className="h-2.5 bg-[var(--nl-border-default)] opacity-25 rounded-full w-3/5" />
          </div>
          <p className="text-[11px] font-mono text-[var(--nl-color-ink-disabled)]">
            Usually takes 5–15 seconds. Please don't close this tab.
          </p>
        </div>
      )}

      {/* Error */}
      {state === 'error' && (
        <div className="px-5 py-5 space-y-3">
          <p className="text-[13px] font-sans text-[var(--nl-color-danger)]">
            Couldn't generate the summary. Check your connection and try again.
          </p>
          <button
            type="button"
            onClick={onRetry}
            className={cn(
              'px-3.5 py-1.5 rounded-[var(--nl-radius-sm)] text-[12px] font-mono',
              'border border-[var(--nl-border-default)] text-[var(--nl-color-accent-primary)]',
              'hover:bg-[var(--nl-border-default)] transition-colors',
            )}
          >
            Retry
          </button>
        </div>
      )}

      {/* Success */}
      {state === 'success' && summary && (
        <div className="px-5 py-5 space-y-5">
          {/* Overview */}
          <p className="text-[15px] font-sans leading-[1.7] text-[var(--nl-color-ink-primary)]">
            {summary.overview}
          </p>

          {/* Decisions */}
          {summary.decisions.length > 0 && (
            <>
              <div className="border-t border-[var(--nl-border-default)] opacity-50" />
              <Section icon="✓" title="Decisions made">
                {summary.decisions.map((d, i) => <Bullet key={i} text={d} />)}
              </Section>
            </>
          )}

          {/* Action items */}
          {summary.actionItems.length > 0 && (
            <>
              <div className="border-t border-[var(--nl-border-default)] opacity-50" />
              <Section icon="→" title="Action items">
                {summary.actionItems.map((a, i) => <ActionItem key={i} text={a} />)}
              </Section>
            </>
          )}

          {/* Insights */}
          {summary.insights.length > 0 && (
            <>
              <div className="border-t border-[var(--nl-border-default)] opacity-50" />
              <Section icon="◆" title="Insights">
                {summary.insights.map((ins, i) => <Bullet key={i} text={ins} />)}
              </Section>
            </>
          )}

          {/* Footer */}
          <div className="border-t border-[var(--nl-border-default)] opacity-50" />
          <p className="text-[9px] font-mono text-[var(--nl-color-ink-disabled)] uppercase tracking-widest">
            {summary.modelUsed}
          </p>
        </div>
      )}

      <style>{`
        @keyframes summaryIn {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
