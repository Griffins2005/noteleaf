'use client';

import { MEETING_HOW_TO_STEPS } from '@/lib/meetingPhase';
import { cn } from '@/lib/cn';

interface MeetingHowToStripProps {
  className?: string;
  compact?: boolean;
}

export function MeetingHowToStrip({ className, compact = false }: MeetingHowToStripProps) {
  return (
    <div
      className={cn(
        'rounded-[var(--nl-radius-md)] border border-[var(--nl-border-subtle)]',
        'bg-[var(--nl-color-paper-base)]',
        compact ? 'mx-5 mt-3 px-4 py-3' : 'px-4 py-4',
        className,
      )}
    >
      <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--nl-color-ink-disabled)] mb-3">
        How to use Noteleaf
      </p>
      <ol className={cn(
        'grid gap-3',
        compact ? 'grid-cols-2 lg:grid-cols-4' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4',
      )}>
        {MEETING_HOW_TO_STEPS.map(({ step, title, detail }) => (
          <li key={step} className="flex gap-2.5 min-w-0">
            <span
              className={cn(
                'shrink-0 w-5 h-5 rounded-full flex items-center justify-center',
                'text-[10px] font-mono font-semibold',
                'bg-[var(--nl-color-accent-subtle)] text-[var(--nl-color-accent-primary)]',
                'border border-[var(--nl-color-accent-border)]',
              )}
              aria-hidden="true"
            >
              {step}
            </span>
            <div className="min-w-0">
              <p className="text-[11px] font-sans font-medium text-[var(--nl-color-ink-primary)]">
                {title}
              </p>
              <p className="text-[10px] font-mono text-[var(--nl-color-ink-tertiary)] leading-relaxed mt-0.5">
                {detail}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
