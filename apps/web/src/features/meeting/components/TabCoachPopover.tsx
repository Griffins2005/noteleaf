'use client';

import { useEffect, useRef } from 'react';
import { cn } from '@/lib/cn';

export interface TabCoachContent {
  tab: string;
  title: string;
  message: string;
}

interface TabCoachPopoverProps {
  content: TabCoachContent;
  onDismiss: () => void;
  /** Keeps first/last tabs on-screen. */
  anchor?: 'start' | 'center' | 'end';
}

/** Small tooltip-style hint — hangs below the tab, milkwhite + navy + black only. */
export function TabCoachPopover({ content, onDismiss, anchor = 'center' }: TabCoachPopoverProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onPointerDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onDismiss();
      }
    }
    const t = window.setTimeout(() => {
      document.addEventListener('mousedown', onPointerDown);
    }, 0);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener('mousedown', onPointerDown);
    };
  }, [onDismiss]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onDismiss();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onDismiss]);

  return (
    <div
      ref={ref}
      role="tooltip"
      aria-labelledby={`tab-coach-${content.tab}`}
      className={cn(
        'absolute top-[calc(100%+6px)] z-[var(--nl-z-overlay)]',
        'w-[min(260px,calc(100vw-1.5rem))]',
        anchor === 'start' && 'left-0',
        anchor === 'end' && 'right-0',
        anchor === 'center' && 'left-1/2 -translate-x-1/2',
      )}
    >
      {/* caret */}
      <span
        className={cn(
          'absolute -top-[5px] block w-2.5 h-2.5 rotate-45 bg-[var(--nl-color-milk)] border-l border-t border-black/10',
          anchor === 'start' && 'left-6',
          anchor === 'end' && 'right-6',
          anchor === 'center' && 'left-1/2 -translate-x-1/2',
        )}
        aria-hidden="true"
      />
      <div
        className={cn(
          'relative rounded-[6px] px-3 py-2.5',
          'bg-[var(--nl-color-milk)] border border-black/10',
          'shadow-[0_2px_6px_rgba(0,0,0,0.05)]',
        )}
      >
        <p
          id={`tab-coach-${content.tab}`}
          className="text-[9px] font-mono uppercase tracking-[0.12em] text-[var(--nl-color-navy)] mb-1"
        >
          {content.title}
        </p>
        <p className="text-[11px] font-sans text-black leading-[1.45]">
          {content.message}
        </p>
      </div>
    </div>
  );
}
