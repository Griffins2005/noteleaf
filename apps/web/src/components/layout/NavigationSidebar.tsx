'use client';

import { useState, useMemo } from 'react';
import { cn } from '@/lib/cn';
import type { SessionListItem } from '@noteleaf/shared-types';

// ─── Icons ────────────────────────────────────────────────────────────────────

function SearchIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
    </svg>
  );
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface NavigationSidebarProps {
  sessions: SessionListItem[];
  activeSessionId: string | null;
  onSelectSession: (id: string) => void;
  onDeleteSession: (id: string) => void;
  onNewSession: () => void;
  onOpenSettings: () => void;
}

// ─── Session item ─────────────────────────────────────────────────────────────

function SessionItem({
  session,
  isActive,
  onClick,
  onDelete,
}: {
  session: SessionListItem;
  isActive: boolean;
  onClick: () => void;
  onDelete: () => void;
}) {
  const [pendingDelete, setPendingDelete] = useState(false);

  const date  = new Date(session.updatedAt);
  const today = new Date();
  const label = date.toDateString() === today.toDateString()
    ? date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  return (
    <div className="relative group mx-2" style={{ width: 'calc(100% - 16px)' }}>
      <button
        type="button"
        onClick={onClick}
        aria-current={isActive ? 'page' : undefined}
        className={cn(
          'w-full text-left px-3 py-2.5 rounded-[8px] transition-colors pr-8',
          'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--nl-sidebar-accent)]',
          isActive ? 'bg-[var(--nl-sidebar-bg-active)]' : 'hover:bg-[var(--nl-sidebar-bg-hover)]',
        )}
      >
        <p className={cn(
          'text-[12px] font-sans leading-snug truncate',
          isActive ? 'text-[var(--nl-sidebar-text-active)] font-medium' : 'text-[var(--nl-sidebar-text)]',
        )}>
          {session.title || 'Untitled session'}
        </p>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className={cn(
            'text-[10px] font-mono',
            isActive ? 'text-[var(--nl-sidebar-text-active)] opacity-70' : 'text-[var(--nl-sidebar-text-muted)]',
          )}>
            {label}
          </span>
          {session.noteCount > 0 && (
            <span className="text-[10px] font-mono text-[var(--nl-sidebar-text-muted)]">· {session.noteCount}</span>
          )}
          {session.hasAiSummary && (
            <span className="ml-auto text-[9px] text-[var(--nl-sidebar-accent)] opacity-80">✦</span>
          )}
        </div>
      </button>

      {pendingDelete ? (
        <div
          className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5 px-2 py-1 rounded-md z-10"
          style={{ background: '#1e293b', border: '1px solid rgba(239,68,68,0.25)' }}
        >
          <span className="text-[9px] font-mono mr-1" style={{ color: '#c8b8a0' }}>Sure?</span>
          <button type="button" onClick={() => { setPendingDelete(false); onDelete(); }} className="text-[10px] font-mono font-semibold text-red-400 hover:text-red-300 px-1 py-0.5 rounded transition-colors">Yes</button>
          <button type="button" onClick={() => setPendingDelete(false)} className="text-[10px] font-mono px-1 py-0.5 rounded transition-colors" style={{ color: 'var(--nl-sidebar-text-muted)' }}>No</button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setPendingDelete(true)}
          aria-label={`Delete "${session.title || 'Untitled session'}"`}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center rounded opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500/20"
          style={{ color: 'rgba(255,100,80,0.7)' }}
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
            <path d="M10 11v6M14 11v6"/>
            <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
          </svg>
        </button>
      )}
    </div>
  );
}

// ─── Main sidebar ─────────────────────────────────────────────────────────────

export function NavigationSidebar({
  sessions,
  activeSessionId,
  onSelectSession,
  onDeleteSession,
  onNewSession,
  onOpenSettings,
}: NavigationSidebarProps) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    if (!query.trim()) return sessions;
    const q = query.toLowerCase();
    return sessions.filter((s) => (s.title || 'untitled session').toLowerCase().includes(q));
  }, [sessions, query]);

  return (
    <aside
      className="w-[220px] shrink-0 flex flex-col overflow-hidden"
      style={{ background: 'var(--nl-sidebar-bg)', borderRight: '1px solid var(--nl-sidebar-border)' }}
      aria-label="Sessions navigation"
    >
      {/* Logo */}
      <div className="px-4 pt-6 pb-4 shrink-0 flex flex-col items-center gap-2.5">
        <div
          aria-hidden="true"
          style={{
            width: 46, height: 46, borderRadius: 13, flexShrink: 0,
            background: 'linear-gradient(145deg, #1fa463 0%, #0d7a47 100%)',
            boxShadow: '0 3px 12px rgba(13,122,71,0.45), inset 0 1px 0 rgba(255,255,255,0.18)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <svg width="26" height="26" viewBox="0 0 26 26" fill="none" aria-hidden="true">
            <path d="M13 24C13 24 5 18 5 11.5C5 7.36 8.58 4 13 4C17.42 4 21 7.36 21 11.5C21 18 13 24 13 24Z" fill="white" opacity="0.95"/>
            <path d="M13 24L13 12" stroke="rgba(13,122,71,0.5)" strokeWidth="1.6" strokeLinecap="round"/>
            <path d="M13 15.5L9.5 13.5" stroke="rgba(13,122,71,0.35)" strokeWidth="1.2" strokeLinecap="round"/>
            <path d="M13 19L9.5 17" stroke="rgba(13,122,71,0.35)" strokeWidth="1.2" strokeLinecap="round"/>
          </svg>
        </div>
        <span className="font-serif text-[17px] font-bold leading-tight text-white" style={{ letterSpacing: '-0.2px' }}>Noteleaf</span>
      </div>

      {/* New session */}
      <div className="px-3 pb-3 shrink-0">
        <button
          type="button"
          onClick={onNewSession}
          className={cn(
            'w-full flex items-center justify-center gap-1.5 py-2 rounded-[8px]',
            'text-[12px] font-mono font-medium transition-colors',
            'border border-white/35 text-white bg-white/10',
            'hover:bg-white/15 hover:border-white/50',
          )}
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          New Session
        </button>
      </div>

      {/* Search */}
      <div className="px-3 pb-3 shrink-0">
        <div className="relative">
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--nl-sidebar-text-muted)]"><SearchIcon /></span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search sessions"
            className="w-full pl-7 pr-3 py-1.5 rounded-[6px] text-[11px] font-mono transition-colors outline-none"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--nl-sidebar-border)', color: 'var(--nl-sidebar-text)' }}
          />
        </div>
      </div>

      {filtered.length > 0 && (
        <p className="px-5 pb-1 text-[9px] font-mono uppercase tracking-[1.5px]" style={{ color: 'var(--nl-sidebar-text-muted)' }}>
          Sessions
        </p>
      )}

      {/* Sessions list */}
      <nav className="flex-1 overflow-y-auto py-1 space-y-0.5" aria-label="Session list">
        {filtered.length === 0 && (
          <p className="px-5 py-3 text-[11px] font-mono italic" style={{ color: 'var(--nl-sidebar-text-muted)' }}>
            {query ? 'No matches' : 'No sessions yet'}
          </p>
        )}
        {filtered.map((s) => (
          <SessionItem
            key={s.id}
            session={s}
            isActive={s.id === activeSessionId}
            onClick={() => onSelectSession(s.id)}
            onDelete={() => onDeleteSession(s.id)}
          />
        ))}
      </nav>

      {/* Bottom actions */}
      <div className="shrink-0 px-3 py-3" style={{ borderTop: '1px solid var(--nl-sidebar-border)' }}>
        <button
          type="button"
          onClick={onOpenSettings}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-[6px] text-[11px] font-mono transition-colors"
          style={{ color: 'var(--nl-sidebar-text-muted)' }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--nl-sidebar-bg-hover)'; e.currentTarget.style.color = 'var(--nl-sidebar-text)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--nl-sidebar-text-muted)'; }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
          </svg>
          Settings
        </button>
      </div>
    </aside>
  );
}
