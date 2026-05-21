'use client';

import { AudioVisualizer } from './AudioVisualizer';
import { cn } from '@/lib/cn';
import type { RecordingStatus } from '../hooks/useRecordingState';

export interface LiveTranscriptBarProps {
  transcript: string;
  status: RecordingStatus;
  showTranscript: boolean;
  className?: string;
}

export function LiveTranscriptBar({ transcript, status, showTranscript, className }: LiveTranscriptBarProps) {
  const isActive = status === 'recording' || status === 'connecting';

  // Only render when actively recording — collapses cleanly when idle
  if (!isActive) return null;

  return (
    <div
      className={cn(
        'flex items-start gap-3 px-6 py-3 mx-4 mb-1 mt-3',
        'rounded-[var(--nl-radius-md)]',
        'bg-[var(--nl-color-paper-sunken)]',
        'border border-[var(--nl-border-subtle)]',
        'transition-all duration-200',
        className,
      )}
      aria-live="polite"
      aria-label="Live speech transcript"
    >
      <div className="flex items-center pt-0.5 shrink-0">
        <AudioVisualizer isActive={status === 'recording'} />
      </div>

      <div className="flex-1 min-w-0">
        {showTranscript ? (
          <p className={cn(
            'text-[13px] font-sans leading-relaxed',
            'transition-colors duration-150',
            transcript
              ? 'text-[var(--nl-color-ink-secondary)]'
              : 'italic text-[var(--nl-color-ink-disabled)]',
          )}>
            {transcript || 'Listening…'}
          </p>
        ) : (
          <p className="text-[12px] font-mono italic text-[var(--nl-color-ink-disabled)]">
            Recording in progress…
          </p>
        )}
      </div>
    </div>
  );
}
