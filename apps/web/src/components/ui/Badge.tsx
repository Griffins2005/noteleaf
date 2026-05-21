/**
 * @file Badge.tsx
 * @description Colour-coded badge component for labels, statuses, and note types.
 *
 * Colour variants map to semantic meaning:
 *   - `action`   → Amber. Indicates a task to be done.
 *   - `decision` → Green. Indicates a conclusion reached.
 *   - `insight`  → Blue. Indicates a notable observation.
 *   - `summary`  → Neutral. General note with no specific classification.
 *   - `cloud`    → Blue. Indicates a cloud-synced item in the sidebar.
 *   - `neutral`  → Neutral. Generic label.
 *
 * Usage:
 *   <Badge variant="action">action</Badge>
 *   <Badge variant="cloud">synced</Badge>
 */

import { cn } from '@/lib/cn';

// ─── Types ────────────────────────────────────────────────────────────────────

export type BadgeVariant = 'action' | 'decision' | 'insight' | 'summary' | 'cloud' | 'neutral';

export interface BadgeProps {
  variant?: BadgeVariant;
  className?: string;
  children: React.ReactNode;
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const BASE = 'inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-mono font-medium tracking-wide uppercase leading-none';

const VARIANTS: Record<BadgeVariant, string> = {
  action:   'bg-[var(--nl-color-badge-action-bg)]   text-[var(--nl-color-badge-action-text)]',
  decision: 'bg-[var(--nl-color-badge-decision-bg)] text-[var(--nl-color-badge-decision-text)]',
  insight:  'bg-[var(--nl-color-badge-insight-bg)]  text-[var(--nl-color-badge-insight-text)]',
  summary:  'bg-[var(--nl-color-badge-summary-bg)]  text-[var(--nl-color-badge-summary-text)] border border-[var(--nl-border-subtle)]',
  cloud:    'bg-[var(--nl-color-blue-subtle)]        text-[var(--nl-color-blue-primary)]',
  neutral:  'bg-[var(--nl-color-paper-raised)]       text-[var(--nl-color-ink-tertiary)] border border-[var(--nl-border-subtle)]',
};

// ─── Component ────────────────────────────────────────────────────────────────

export function Badge({ variant = 'neutral', className, children }: BadgeProps) {
  return (
    <span className={cn(BASE, VARIANTS[variant], className)}>
      {children}
    </span>
  );
}
