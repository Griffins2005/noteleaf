/**
 * @file Toggle.tsx
 * @description Accessible on/off toggle for the settings panel.
 *
 * Implements ARIA switch pattern:
 *   - role="switch"
 *   - aria-checked reflects current state
 *   - Keyboard: Space or Enter toggles
 *
 * Usage:
 *   <Toggle
 *     checked={prefs.autoClassify}
 *     onChange={(val) => setPreference('autoClassify', val)}
 *     label="Auto-classify notes"
 *   />
 */

import { cn } from '@/lib/cn';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ToggleProps {
  checked: boolean;
  onChange: (value: boolean) => void;
  /** Accessible label — used as aria-label if no visible label is adjacent. */
  label?: string;
  disabled?: boolean;
  className?: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function Toggle({ checked, onChange, label, disabled, className }: ToggleProps) {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      if (!disabled) onChange(!checked);
    }
  };

  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      onKeyDown={handleKeyDown}
      className={cn(
        'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full',
        'transition-colors duration-200 cursor-pointer',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--nl-color-accent-primary)] focus-visible:ring-offset-1',
        'disabled:opacity-40 disabled:cursor-not-allowed',
        checked
          ? 'bg-[var(--nl-color-accent-primary)] border border-[var(--nl-color-accent-primary)]'
          : 'bg-[var(--nl-color-paper-sunken)] border border-[var(--nl-border-default)]',
        className,
      )}
    >
      <span
        className={cn(
          'inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm',
          'transition-transform duration-200',
          checked ? 'translate-x-[18px]' : 'translate-x-[2px]',
        )}
        aria-hidden="true"
      />
    </button>
  );
}
