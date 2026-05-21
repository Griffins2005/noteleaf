'use client';

import { useState, useMemo } from 'react';
import { cn } from '@/lib/cn';
import type { SessionListItem } from '@noteleaf/shared-types';

export interface SessionSidebarProps {
  sessions: SessionListItem[];
  cloudSessions: SessionListItem[];
  activeSessionId: string | null;
  storageMode: 'cloud' | 'local' | null;
  isSyncing: boolean;
  onSelectSession: (sessionId: string) => void;
  onNewSession: () => void;
  onSyncCloud: () => void;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  if (d.toDateString() === today.toDateString()) {
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

interface ItemProps {
  session: SessionListItem;
  isActive: boolean;
  isCloud?: boolean;
  onClick: () => void;
}

function SessionItem({ session, isActive, isCloud = false, onClick }: ItemProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={isActive ? 'page' : undefined}
      className={cn(
        'w-full text-left px-3 py-2.5 rounded-[var(--nl-radius-md)] mx-1',
        'transition-all duration-150 group',
        'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--nl-color-accent-border)]',
        isActive
          ? isCloud
            ? 'bg-[var(--nl-color-blue-subtle)] border border-[var(--nl-color-blue-border)]'
            : 'bg-[var(--nl-color-accent-subtle)] border border-[var(--nl-color-accent-border)]'
          : 'border border-transparent hover:bg-[var(--nl-color-paper-sunken)]',
      )}
    >
      <p className={cn(
        'text-[12px] font-sans leading-snug truncate',
        isActive
          ? isCloud ? 'text-[var(--nl-color-blue-primary)] font-medium' : 'text-[var(--nl-color-accent-primary)] font-medium'
          : 'text-[var(--nl-color-ink-secondary)]',
      )}>
        {session.title || 'Untitled session'}
      </p>
      <div className="flex items-center gap-1.5 mt-1">
        <time
          dateTime={session.createdAt}
          className="text-[10px] font-mono text-[var(--nl-color-ink-disabled)]"
        >
          {formatDate(session.createdAt)}
        </time>
        {session.noteCount > 0 && (
          <span className="text-[10px] font-mono text-[var(--nl-color-ink-disabled)]">
            · {session.noteCount} {session.noteCount === 1 ? 'note' : 'notes'}
          </span>
        )}
        {isCloud && (
          <span className="ml-auto text-[9px] font-mono text-[var(--nl-color-blue-primary)] opacity-70">
            synced
          </span>
        )}
        {session.hasAiSummary && (
          <span className="text-[9px] text-[var(--nl-color-accent-primary)] opacity-70" title="Has AI summary">
            ✦
          </span>
        )}
      </div>
    </button>
  );
}

export function SessionSidebar({
  sessions,
  cloudSessions,
  activeSessionId,
  storageMode,
  isSyncing,
  onSelectSession,
  onNewSession,
  onSyncCloud,
}: SessionSidebarProps) {
  const [query, setQuery] = useState('');

  const filteredSessions = useMemo(() => {
    if (!query.trim()) return sessions;
    const q = query.toLowerCase();
    return sessions.filter((s) => (s.title || 'untitled session').toLowerCase().includes(q));
  }, [sessions, query]);

  const cloudOnly = useMemo(() => {
    const allCloud = cloudSessions.filter((cs) => !sessions.find((s) => s.id === cs.id));
    if (!query.trim()) return allCloud;
    const q = query.toLowerCase();
    return allCloud.filter((s) => (s.title || 'untitled session').toLowerCase().includes(q));
  }, [cloudSessions, sessions, query]);

  return (
    <aside
      className={cn(
        'w-[200px] shrink-0 flex flex-col',
        'bg-[var(--nl-color-paper-raised)]',
        'border-r border-[var(--nl-border-subtle)]',
      )}
      aria-label="Sessions"
    >
      {/* Header + search */}
      <div className="px-3 pt-3 pb-2 space-y-2">
        <h2 className="text-[9px] font-mono uppercase tracking-[1.5px] text-[var(--nl-color-ink-disabled)] px-1">
          Sessions
        </h2>
        <div className="relative">
          <svg
            width="11" height="11" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--nl-color-ink-disabled)] pointer-events-none"
          >
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search…"
            aria-label="Search sessions"
            className={cn(
              'w-full pl-7 pr-3 py-1.5 rounded-[var(--nl-radius-sm)]',
              'text-[11px] font-mono text-[var(--nl-color-ink-primary)]',
              'bg-[var(--nl-color-paper-sunken)] border border-[var(--nl-border-subtle)]',
              'placeholder:text-[var(--nl-color-ink-disabled)]',
              'focus:outline-none focus:border-[var(--nl-color-accent-border)]',
              'transition-colors',
            )}
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--nl-color-ink-disabled)] hover:text-[var(--nl-color-ink-tertiary)]"
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          )}
        </div>
      </div>

      {/* Session list */}
      <nav className="flex-1 overflow-y-auto py-1 space-y-0.5 pr-1" aria-label="Session list">
        {filteredSessions.length === 0 && cloudOnly.length === 0 && (
          <p className="px-4 py-3 text-[11px] font-mono text-[var(--nl-color-ink-disabled)] italic">
            {query ? 'No matches' : 'No sessions yet'}
          </p>
        )}

        {/* Local / current-device sessions */}
        {filteredSessions.length > 0 && (
          <>
            {storageMode === 'cloud' && (
              <p className="px-4 pb-1 pt-0.5 text-[9px] font-mono uppercase tracking-[1px] text-[var(--nl-color-ink-disabled)]">
                This device
              </p>
            )}
            {filteredSessions.map((s) => (
              <SessionItem
                key={s.id}
                session={s}
                isActive={s.id === activeSessionId}
                onClick={() => onSelectSession(s.id)}
              />
            ))}
          </>
        )}

        {/* Cloud-only sessions */}
        {storageMode === 'cloud' && cloudOnly.length > 0 && (
          <>
            <div className="px-4 py-1.5 flex items-center gap-1.5">
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--nl-color-ink-disabled)]">
                <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/>
              </svg>
              <p className="text-[9px] font-mono uppercase tracking-[1px] text-[var(--nl-color-ink-disabled)]">
                From cloud
              </p>
            </div>
            {cloudOnly.map((s) => (
              <SessionItem
                key={s.id}
                session={s}
                isActive={s.id === activeSessionId}
                isCloud
                onClick={() => onSelectSession(s.id)}
              />
            ))}
          </>
        )}
      </nav>

      {/* Actions */}
      <div className="p-3 border-t border-[var(--nl-border-subtle)] space-y-2">
        <button
          type="button"
          onClick={onNewSession}
          className={cn(
            'w-full text-left px-3 py-2 rounded-[var(--nl-radius-sm)]',
            'text-[11px] font-mono text-[var(--nl-color-ink-tertiary)]',
            'border border-dashed border-[var(--nl-border-default)]',
            'hover:border-[var(--nl-color-accent-border)] hover:text-[var(--nl-color-accent-primary)]',
            'hover:bg-[var(--nl-color-accent-subtle)]',
            'transition-all duration-150',
          )}
        >
          + new session
        </button>

        {storageMode === 'cloud' && (
          <button
            type="button"
            onClick={onSyncCloud}
            disabled={isSyncing}
            className={cn(
              'w-full flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--nl-radius-sm)]',
              'text-[10px] font-mono text-[var(--nl-color-blue-primary)]',
              'border border-[var(--nl-color-blue-border)]',
              'hover:bg-[var(--nl-color-blue-subtle)] transition-colors',
              'disabled:opacity-50',
            )}
          >
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/>
            </svg>
            {isSyncing ? 'Syncing…' : 'Sync to cloud'}
          </button>
        )}
      </div>
    </aside>
  );
}
