/**
 * @file RecordingTimer.tsx
 * @description Elapsed recording time display.
 *
 * Displays MM:SS format. Turns red and bold during active recording.
 * Fades to secondary colour when idle (showing last session duration or 0:00).
 *
 * The elapsed seconds value is driven by the timer in useRecordingState,
 * not computed here — this component is a pure display.
 */

import { cn } from '@/lib/cn';
import type { RecordingStatus } from '../hooks/useRecordingState';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RecordingTimerProps {
  elapsedSeconds: number;
  status: RecordingStatus;
  className?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Formats elapsed seconds into MM:SS display string.
 * e.g. 185 → '3:05'
 */
function formatTime(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function RecordingTimer({ elapsedSeconds, status, className }: RecordingTimerProps) {
  const isActive = status === 'recording';

  return (
    <time
      dateTime={`PT${elapsedSeconds}S`}
      aria-label={`Recording duration: ${formatTime(elapsedSeconds)}`}
      className={cn(
        'font-serif tabular-nums min-w-[48px] text-right leading-none',
        'text-[18px] tracking-wide',
        isActive
          ? 'text-[var(--nl-color-danger)]'
          : 'text-[var(--nl-color-ink-tertiary)]',
        className,
      )}
    >
      {formatTime(elapsedSeconds)}
    </time>
  );
}
