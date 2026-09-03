'use client';

import { useState, useRef, useEffect } from 'react';
import { cn } from '@/lib/cn';
import type { Note, NoteType } from '@noteleaf/shared-types';

export interface NoteCardProps {
  note: Note;
  /**
   * 'document' (default) — clean text row, type handled by parent section header.
   * 'feed'               — includes type badge, for chronological live view.
   */
  variant?: 'document' | 'feed';
  onUpdate?: (id: string, content: string, type: NoteType) => void;
  className?: string;
}

const NOTE_TYPES: NoteType[] = ['action', 'decision', 'insight', 'summary'];

const TYPE_LABEL: Record<NoteType, string> = {
  action:   'Action',
  decision: 'Decision',
  insight:  'Insight',
  summary:  'Note',
};

const TYPE_DOT: Record<NoteType, string> = {
  action:   'bg-[var(--nl-color-note-action-bar)]',
  decision: 'bg-[var(--nl-color-note-decision-bar)]',
  insight:  'bg-[var(--nl-color-note-insight-bar)]',
  summary:  'bg-[var(--nl-color-note-summary-bar)]',
};

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

export function NoteCard({ note, variant = 'document', onUpdate, className }: NoteCardProps) {
  const [editing, setEditing]     = useState(false);
  const [draft, setDraft]         = useState(note.content);
  const [draftType, setDraftType] = useState<NoteType>(note.type);
  const textareaRef               = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!editing) { setDraft(note.content); setDraftType(note.type); }
  }, [note.content, note.type, editing]);

  function startEdit()  { setDraft(note.content); setDraftType(note.type); setEditing(true); }
  function cancelEdit() { setEditing(false); }
  function saveEdit()   {
    const trimmed = draft.trim();
    if (!trimmed) { cancelEdit(); return; }
    onUpdate?.(note.id, trimmed, draftType);
    setEditing(false);
  }

  useEffect(() => {
    if (editing && textareaRef.current) {
      const el = textareaRef.current;
      el.style.height = 'auto';
      el.style.height = `${el.scrollHeight}px`;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    }
  }, [editing]);

  return (
    <article
      className={cn(
        'group relative',
        // Document variant: clean row inside a section
        variant === 'document'
          ? 'py-3.5 border-b border-[var(--nl-border-subtle)] last:border-0'
          : 'p-3.5 rounded-[var(--nl-radius-md)] border border-[var(--nl-border-subtle)] bg-[var(--nl-color-paper-base)] mb-2 animate-[noteIn_0.18s_ease-out_both]',
        className,
      )}
      aria-label={`${TYPE_LABEL[note.type]} note`}
    >
      {editing ? (
        /* ── Edit mode ──────────────────────────────────────────────── */
        <div>
          {/* Type selector */}
          <div className="flex items-center gap-2 mb-2">
            <select
              value={draftType}
              onChange={(e) => setDraftType(e.target.value as NoteType)}
              className={cn(
                'text-[10px] font-mono uppercase tracking-wide rounded px-2 py-1',
                'bg-[var(--nl-color-paper-sunken)] border border-[var(--nl-border-default)]',
                'text-[var(--nl-color-ink-secondary)]',
                'focus:outline-none focus:border-[var(--nl-color-accent-primary)]',
              )}
            >
              {NOTE_TYPES.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
            </select>
          </div>

          <textarea
            ref={textareaRef}
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              e.target.style.height = 'auto';
              e.target.style.height = `${e.target.scrollHeight}px`;
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') cancelEdit();
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) saveEdit();
            }}
            rows={2}
            className="w-full resize-none overflow-hidden bg-transparent border-none outline-none text-[14px] leading-[1.65] font-sans text-[var(--nl-color-ink-primary)]"
            placeholder="Note content…"
          />
          <div className="flex items-center gap-3 mt-2">
            <button
              type="button"
              onClick={saveEdit}
              className="px-3 py-1 rounded-[var(--nl-radius-sm)] text-[11px] font-mono font-medium text-white bg-[var(--nl-color-accent-primary)] hover:bg-[var(--nl-color-accent-hover)] transition-colors"
            >
              Save
            </button>
            <button
              type="button"
              onClick={cancelEdit}
              className="text-[11px] font-mono text-[var(--nl-color-ink-tertiary)] hover:text-[var(--nl-color-ink-primary)] transition-colors"
            >
              Cancel
            </button>
            <span className="text-[9px] font-mono text-[var(--nl-color-ink-disabled)] ml-auto">
              Ctrl+Enter to save
            </span>
          </div>
        </div>
      ) : (
        /* ── Read mode ──────────────────────────────────────────────── */
        <>
          {/* In feed variant, show type dot + label above content */}
          {variant === 'feed' && (
            <div className="flex items-center gap-1.5 mb-1.5">
              <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', TYPE_DOT[note.type])} />
              <span className="text-[10px] font-mono font-semibold uppercase tracking-widest text-[var(--nl-color-ink-tertiary)]">
                {TYPE_LABEL[note.type]}
              </span>
            </div>
          )}

          {/* Content — the hero */}
          <p className={cn(
            'text-[14px] font-sans leading-[1.65] text-[var(--nl-color-ink-primary)]',
            // Leave room for the edit button that appears on hover
            onUpdate ? 'pr-7' : '',
          )}>
            {note.content}
          </p>

          {/* Meta row */}
          <div className="flex items-center gap-3 mt-2 text-[11px] font-mono text-[var(--nl-color-ink-tertiary)]">
            <span>{formatTime(note.capturedAt)}</span>
            {note.isUserEdited && (
              <span className="text-[var(--nl-color-ink-disabled)]">· edited</span>
            )}
            {note.tags.length > 0 && (
              <>
                <span className="text-[var(--nl-color-ink-disabled)]">·</span>
                {note.tags.map((tag) => (
                  <span key={tag} className="text-[var(--nl-color-ink-disabled)]">
                    #{tag}
                  </span>
                ))}
              </>
            )}
          </div>

          {/* Edit button — top-right, visible on hover */}
          {onUpdate && (
            <button
              type="button"
              onClick={startEdit}
              aria-label="Edit note"
              className="absolute right-0 top-3.5 opacity-70 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity text-[var(--nl-color-ink-disabled)] hover:text-[var(--nl-color-ink-secondary)]"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
            </button>
          )}
        </>
      )}

      <style>{`
        @keyframes noteIn {
          from { opacity: 0; transform: translateY(4px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </article>
  );
}
