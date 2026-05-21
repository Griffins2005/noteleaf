/**
 * @file MicButton.tsx
 * @description The primary recording control button.
 *
 * Visually communicates the current recording status through colour,
 * animation, and iconography. Handles all five recording states.
 *
 * Accessibility:
 *   - aria-label changes with state to describe the button's current action.
 *   - aria-pressed reflects whether recording is active.
 *   - Keyboard accessible: Enter / Space start or stop recording.
 *
 * States:
 *   idle       → Green, mic icon. "Start recording"
 *   connecting → Muted, spinner. "Connecting…" (disabled)
 *   recording  → Red pulsing ring, stop icon. "Stop recording"
 *   stopping   → Muted, spinner. "Stopping…" (disabled)
 *   error      → Red border, exclamation. "Retry recording"
 */

'use client';

import { cn } from '@/lib/cn';
import type { RecordingStatus } from '../hooks/useRecordingState';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MicButtonProps {
  status: RecordingStatus;
  onStart: () => void;
  onStop: () => void;
  className?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getAriaLabel(status: RecordingStatus): string {
  switch (status) {
    case 'idle':       return 'Start recording';
    case 'connecting': return 'Connecting to speech recognition…';
    case 'recording':  return 'Stop recording';
    case 'stopping':   return 'Stopping…';
    case 'error':      return 'Retry recording';
  }
}

// ─── Icons (inline SVG — no dependency needed for these simple shapes) ────────

function MicIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="2" width="6" height="11" rx="3"/>
      <path d="M5 10a7 7 0 0 0 14 0"/>
      <line x1="12" y1="19" x2="12" y2="22"/>
      <line x1="8" y1="22" x2="16" y2="22"/>
    </svg>
  );
}

function StopIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <rect x="4" y="4" width="16" height="16" rx="2"/>
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <span
      className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin"
      aria-hidden="true"
    />
  );
}

function ErrorIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
      <line x1="12" y1="8" x2="12" y2="13"/>
      <line x1="12" y1="16" x2="12.01" y2="16"/>
    </svg>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export function MicButton({ status, onStart, onStop, className }: MicButtonProps) {
  const isDisabled = status === 'connecting' || status === 'stopping';
  const isRecording = status === 'recording';

  function handleClick() {
    if (isDisabled) return;
    if (status === 'recording') onStop();
    else onStart();
  }

  return (
    <div className={cn('relative inline-flex items-center justify-center', className)}>
      {/* Pulsing ring — only visible during recording */}
      {isRecording && (
        <span
          className="absolute inset-0 rounded-full bg-[var(--nl-color-danger)] opacity-20 animate-ping"
          aria-hidden="true"
        />
      )}

      <button
        type="button"
        onClick={handleClick}
        disabled={isDisabled}
        aria-label={getAriaLabel(status)}
        aria-pressed={isRecording}
        className={cn(
          'relative z-10 w-10 h-10 rounded-full flex items-center justify-center',
          'transition-all duration-200 focus-visible:outline-none',
          'focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--nl-color-accent-primary)]',
          'active:scale-95 disabled:cursor-not-allowed disabled:opacity-50',
          // Colour by state
          status === 'idle' || status === 'error'
            ? 'bg-[var(--nl-color-accent-primary)] text-white hover:bg-[var(--nl-color-accent-hover)]'
            : status === 'recording'
            ? 'bg-[var(--nl-color-danger)] text-white hover:brightness-110'
            : 'bg-[var(--nl-color-paper-sunken)] text-[var(--nl-color-ink-tertiary)]',
          status === 'error' && 'ring-2 ring-[var(--nl-color-danger)] ring-offset-1',
        )}
      >
        {status === 'idle' && <MicIcon />}
        {status === 'recording' && <StopIcon />}
        {(status === 'connecting' || status === 'stopping') && <SpinnerIcon />}
        {status === 'error' && <ErrorIcon />}
      </button>
    </div>
  );
}
