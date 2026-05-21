/**
 * @file Button.tsx
 * @description Base button component used throughout the Noteleaf UI.
 *
 * Variants:
 *   - `primary`   → Filled accent green. Main CTAs.
 *   - `secondary` → Outlined. Secondary actions.
 *   - `ghost`     → No border, subtle hover. Toolbar actions.
 *   - `danger`    → Outlined red. Destructive actions (delete, reset).
 *
 * Sizes:
 *   - `sm`   → 11px text, compact padding. Toolbar buttons.
 *   - `md`   → 12px text, default padding. Standard buttons.
 *   - `icon` → Square, no text. Icon-only toolbar actions.
 *
 * Props extend the native <button> element — all standard HTML button
 * attributes (disabled, onClick, type, aria-label, etc.) work as expected.
 *
 * Usage:
 *   <Button variant="primary" onClick={handleSave}>Save notes</Button>
 *   <Button variant="ghost" size="icon" aria-label="Delete session"><TrashIcon /></Button>
 *   <Button variant="primary" isLoading>Generating…</Button>
 */

import { forwardRef } from 'react';
import { cn } from '@/lib/cn';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'icon';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows a spinner and disables interaction. Sets aria-busy="true". */
  isLoading?: boolean;
  /** Rendered before the button label. */
  leftIcon?: React.ReactNode;
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const BASE =
  'inline-flex items-center justify-center gap-1.5 font-mono rounded-[var(--nl-radius-sm)] ' +
  'transition-all duration-150 cursor-pointer select-none ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--nl-color-accent-primary)] focus-visible:ring-offset-1 ' +
  'disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.97]';

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-[var(--nl-color-accent-primary)] text-[var(--nl-color-paper-base)] ' +
    'hover:bg-[var(--nl-color-accent-hover)] border border-transparent',
  secondary:
    'bg-transparent text-[var(--nl-color-ink-secondary)] ' +
    'border border-[var(--nl-border-default)] hover:bg-[var(--nl-color-paper-raised)] ' +
    'hover:text-[var(--nl-color-ink-primary)]',
  ghost:
    'bg-transparent text-[var(--nl-color-ink-secondary)] border border-transparent ' +
    'hover:bg-[var(--nl-color-paper-raised)] hover:text-[var(--nl-color-ink-primary)]',
  danger:
    'bg-transparent text-[var(--nl-color-danger)] ' +
    'border border-[var(--nl-color-danger)] hover:bg-[var(--nl-color-danger-subtle)]',
};

const SIZES: Record<ButtonSize, string> = {
  sm:   'px-3 py-1.5 text-[var(--nl-text-sm)] h-7',
  md:   'px-3.5 py-2 text-[var(--nl-text-base)] h-8',
  icon: 'w-8 h-8 p-0',
};

// ─── Component ────────────────────────────────────────────────────────────────

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'secondary',
      size = 'md',
      isLoading = false,
      leftIcon,
      className,
      children,
      disabled,
      ...props
    },
    ref,
  ) => {
    return (
      <button
        ref={ref}
        className={cn(BASE, VARIANTS[variant], SIZES[size], className)}
        disabled={disabled || isLoading}
        aria-busy={isLoading}
        {...props}
      >
        {isLoading ? (
          <span
            className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin"
            aria-hidden="true"
          />
        ) : (
          leftIcon && <span className="shrink-0">{leftIcon}</span>
        )}
        {children}
      </button>
    );
  },
);

Button.displayName = 'Button';
