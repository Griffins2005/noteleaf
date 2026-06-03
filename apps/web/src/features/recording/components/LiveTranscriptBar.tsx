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
  const isRecording = status === 'recording';

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
      <div className="flex flex-col items-center gap-2 pt-0.5 shrink-0">
        <AudioVisualizer isActive={isRecording} />
        {isRecording && (
          <span className="flex items-center gap-1 text-[9px] font-mono text-emerald-700 whitespace-nowrap">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" aria-hidden="true" />
            Live
          </span>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1.5">
          <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--nl-color-ink-tertiary)]">
            Transcription active
          </span>
          <span className="text-[10px] font-mono text-[var(--nl-color-ink-disabled)] hidden sm:inline">
            · audio stays on your device
          </span>
        </div>
        {showTranscript ? (
          <p className={cn(
            'text-[13px] font-sans leading-relaxed',
            'transition-colors duration-150',
            transcript
              ? 'text-[var(--nl-color-ink-secondary)]'
              : 'italic text-[var(--nl-color-ink-disabled)]',
          )}>
            {transcript || 'Listening… speak naturally and notes will appear below.'}
          </p>
        ) : (
          <p className="text-[12px] font-mono italic text-[var(--nl-color-ink-disabled)]">
            Recording in progress — live text hidden in settings
          </p>
        )}
      </div>
    </div>
  );
}
