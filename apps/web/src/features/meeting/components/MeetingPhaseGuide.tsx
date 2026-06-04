'use client';

import {
  getMeetingPhase,
  MEETING_PHASES,
  type MeetingPhaseActionId,
  type MeetingPhaseInput,
} from '@/lib/meetingPhase';
import { cn } from '@/lib/cn';

interface MeetingPhaseGuideProps extends MeetingPhaseInput {
  className?: string;
  onPhaseAction?: (actionId: MeetingPhaseActionId) => void;
  isRecordingBlocked?: boolean;
}

export function MeetingPhaseGuide({
  onPhaseAction,
  isRecordingBlocked = false,
  className,
  ...phaseInput
}: MeetingPhaseGuideProps) {
  const phase = getMeetingPhase(phaseInput);
  const active = MEETING_PHASES.find((s) => s.id === phase)!;
  const activeIndex = MEETING_PHASES.findIndex((s) => s.id === phase);

  return (
    <div
      className={cn(
        'mx-7 mb-4 px-4 py-3 rounded-[var(--nl-radius-md)]',
        'border border-[var(--nl-border-subtle)] bg-[var(--nl-color-paper-sunken)]',
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-2 mb-2">
        {MEETING_PHASES.map((step, index) => {
          const isActive = step.id === phase;
          const isPast = activeIndex > index;

          return (
            <div key={step.id} className="flex items-center gap-2">
              {index > 0 && (
                <span
                  className={cn(
                    'w-4 h-px',
                    isPast || isActive
                      ? 'bg-[var(--nl-color-accent-primary)]'
                      : 'bg-[var(--nl-border-default)]',
                  )}
                  aria-hidden="true"
                />
              )}
              <span
                className={cn(
                  'text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-full border',
                  isActive && phase === 'during' && 'text-red-700 bg-red-50 border-red-200',
                  isActive && phase !== 'during' && 'text-[var(--nl-color-accent-primary)] bg-[var(--nl-color-accent-subtle)] border-[var(--nl-color-accent-border)]',
                  !isActive && isPast && 'text-[var(--nl-color-ink-tertiary)] border-transparent',
                  !isActive && !isPast && 'text-[var(--nl-color-ink-disabled)] border-transparent',
                )}
              >
                {step.label}
              </span>
            </div>
          );
        })}
      </div>

      <p className="text-[11px] font-sans text-[var(--nl-color-ink-secondary)] leading-relaxed">
        {active.hint}
      </p>

      {onPhaseAction && active.actions.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-3">
          {active.actions.map((action) => {
            const disabled = action.id === 'start-capture' && isRecordingBlocked;
            return (
              <button
                key={action.id}
                type="button"
                disabled={disabled}
                onClick={() => onPhaseAction(action.id)}
                className={cn(
                  'px-3 py-1.5 rounded-[var(--nl-radius-sm)] text-[10px] font-mono font-medium',
                  'border transition-colors',
                  disabled
                    ? 'opacity-50 cursor-not-allowed border-[var(--nl-border-subtle)] text-[var(--nl-color-ink-disabled)]'
                    : 'border-[var(--nl-color-accent-border)] bg-[var(--nl-color-paper-base)] text-[var(--nl-color-accent-primary)] hover:bg-[var(--nl-color-accent-subtle)]',
                )}
              >
                {action.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
