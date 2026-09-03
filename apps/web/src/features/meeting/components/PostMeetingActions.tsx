'use client';

import { useState } from 'react';
import { exportFormatter, type ExportInput } from '@/lib/exportFormatter';
import { cn } from '@/lib/cn';

interface PostMeetingActionsProps extends ExportInput {
  compact?: boolean;
  onDismiss?: () => void;
  onAskNotes?: () => void;
  onOpenRecap?: () => void;
  className?: string;
}

export function PostMeetingActions({
  compact = false,
  onDismiss,
  onAskNotes,
  onOpenRecap,
  className,
  ...exportInput
}: PostMeetingActionsProps) {
  const [feedback, setFeedback] = useState<string | null>(null);

  const exportPayload: ExportInput = exportInput;

  async function handleCopyRecap() {
    const text = exportFormatter.toRecapPlainText(exportPayload);
    const ok = await exportFormatter.copyToClipboard(text);
    setFeedback(ok ? 'Recap copied' : 'Copy failed');
    setTimeout(() => setFeedback(null), 2200);
  }

  async function handleCopyActions() {
    const text = exportFormatter.toActionItemsChecklist(exportPayload);
    const ok = await exportFormatter.copyToClipboard(text);
    setFeedback(ok ? 'Action items copied' : 'Copy failed');
    setTimeout(() => setFeedback(null), 2200);
  }

  async function handleCopyTakeaways() {
    const text = exportFormatter.toKeyTakeawaysPlainText(exportPayload);
    const ok = await exportFormatter.copyToClipboard(text);
    setFeedback(ok ? 'Takeaways copied' : 'Copy failed');
    setTimeout(() => setFeedback(null), 2200);
  }

  function handleEmailRecap() {
    window.location.href = exportFormatter.toMailtoUrl(exportPayload);
  }

  function handleDownload() {
    const { txt, filename } = exportFormatter.toTxt(exportPayload);
    exportFormatter.triggerDownload(txt, filename);
    setFeedback('Download started');
    setTimeout(() => setFeedback(null), 2200);
  }

  const actions = [
    {
      id: 'copy-recap',
      label: 'Copy recap',
      sub: 'Summary + takeaways + tasks',
      onClick: () => void handleCopyRecap(),
    },
    {
      id: 'takeaways',
      label: 'Copy takeaways',
      sub: 'Key points for Slack or docs',
      onClick: () => void handleCopyTakeaways(),
    },
    {
      id: 'email',
      label: 'Email recap',
      sub: 'Opens your mail app',
      onClick: handleEmailRecap,
    },
    {
      id: 'actions',
      label: 'Copy next steps',
      sub: 'Checklist for your tools',
      onClick: () => void handleCopyActions(),
    },
    {
      id: 'download',
      label: 'Download .txt',
      sub: 'Full session export',
      onClick: handleDownload,
    },
  ] as const;

  return (
    <div
      className={cn(
        'rounded-[var(--nl-radius-md)] border border-[var(--nl-color-accent-border)]',
        'bg-[var(--nl-color-accent-subtle)]',
        className,
      )}
    >
      <div className={cn('flex items-start gap-3', compact ? 'px-4 py-3' : 'px-5 py-4')}>
        <div className="flex-1 min-w-0">
          <p className="text-[12px] font-sans font-medium text-[var(--nl-color-ink-primary)]">
            Post-meeting workflows
          </p>
          <p className="text-[10px] font-mono text-[var(--nl-color-ink-tertiary)] mt-0.5 leading-relaxed">
            Send recap emails, copy next steps, or ask follow-ups — no bot required.
          </p>
        </div>
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className="text-[var(--nl-color-ink-disabled)] hover:text-[var(--nl-color-ink-tertiary)] shrink-0"
            aria-label="Dismiss"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        )}
      </div>

      <div className={cn(
        'grid gap-2 border-t border-[var(--nl-color-accent-border)]',
        compact ? 'px-4 py-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5' : 'px-5 py-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5',
      )}>
        {actions.map((action) => (
          <button
            key={action.id}
            type="button"
            onClick={action.onClick}
            className={cn(
              'text-left px-3 py-2.5 rounded-[var(--nl-radius-md)]',
              'bg-[var(--nl-color-paper-base)] border border-[var(--nl-border-subtle)]',
              'hover:border-[var(--nl-color-accent-border)] transition-colors',
            )}
          >
            <span className="block text-[11px] font-mono font-medium text-[var(--nl-color-ink-primary)]">
              {action.label}
            </span>
            <span className="block text-[9px] font-mono text-[var(--nl-color-ink-disabled)] mt-0.5">
              {action.sub}
            </span>
          </button>
        ))}
      </div>

      <div className={cn(
        'flex flex-wrap items-center gap-3 border-t border-[var(--nl-color-accent-border)]',
        compact ? 'px-4 py-2.5' : 'px-5 py-3',
      )}>
        {onOpenRecap && (
          <button
            type="button"
            onClick={onOpenRecap}
            className="text-[11px] font-mono font-medium text-[var(--nl-color-ink-secondary)] hover:text-[var(--nl-color-ink-primary)]"
          >
            Open recap →
          </button>
        )}
        {onAskNotes && (
          <button
            type="button"
            onClick={onAskNotes}
            className="text-[11px] font-mono font-medium text-[var(--nl-color-accent-primary)] hover:underline"
          >
            Ask follow-up questions →
          </button>
        )}
        {feedback && (
          <span className="text-[10px] font-mono text-[var(--nl-color-accent-primary)] ml-auto">
            {feedback}
          </span>
        )}
      </div>
    </div>
  );
}
