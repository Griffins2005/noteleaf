/**
 * @file NotepadShell.tsx
 * @description The main application shell — the full Noteleaf UI.
 *
 * This is the primary Client Component that assembles all features:
 *   - StorageOnboarding modal (shown on first launch)
 *   - TopBar with logo, navigation tabs, and status indicator
 *   - SessionSidebar (session list, new session, sync button)
 *   - Main content area:
 *       - Session title input
 *       - LiveTranscriptBar
 *       - Notes list (NoteCard per note)
 *       - AiSummaryCard
 *       - AI generate button
 *   - BottomBar with MicButton, RecordingTimer, status text
 *   - Settings panel (toggled via top nav)
 *
 * Architecture: this component is the composition root of the UI. It holds
 * no business logic itself — it composes hooks and feature components.
 * All state comes from the Zustand stores via the recording/session hooks.
 */

'use client';

import { useState, useCallback, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

// Feature components
import { StorageOnboarding } from '@/features/storage/components/StorageOnboarding';
import { FolderPickerButton } from '@/features/storage/components/FolderPickerButton';
import { useStorageFolderHandle } from '@/features/storage/useStorageFolderHandle';
import { IdentityRecovery } from '@/features/identity/IdentityRecovery';
import { ChatPanel } from '@/features/chat/ChatPanel';
import { NavigationSidebar } from '@/components/layout/NavigationSidebar';
import { SessionTranscriptPanel } from '@/components/layout/SessionTranscriptPanel';
import { LiveTranscriptBar } from '@/features/recording/components/LiveTranscriptBar';
import { MicButton } from '@/features/recording/components/MicButton';
import { RecordingTimer } from '@/features/recording/components/RecordingTimer';
import { NoteCard } from '@/features/notes/components/NoteCard';
import { AiSummaryCard } from '@/features/notes/components/AiSummaryCard';

// UI components
import { Button } from '@/components/ui/Button';
import { Toggle } from '@/components/ui/Toggle';

// Hooks
import { useRecordingState } from '@/features/recording/hooks/useRecordingState';

// Stores
import { useSessionStore, selectActiveSessionListItem } from '@/store/session.store';
import { useUserStore } from '@/store/user.store';

// Services
import { sessionsApi } from '@/features/sessions/sessions.api';
import { http } from '@/lib/http.client';
import { exportFormatter } from '@/lib/exportFormatter';

// Types
import type { AiSummary, SummarizeRequest, TranscriptSegment, NoteType } from '@noteleaf/shared-types';
import { cn } from '@/lib/cn';

import { saveSessionData, loadSessionData } from '@/lib/localDb';

// ─── Settings panel ───────────────────────────────────────────────────────────

function SettingsPanel() {
  const {
    storageMode, localSaveMode, uuid, email, preferences,
    setPreference, setStorageMode, resetIdentity, setEmail, applyRecoveredUuid,
  } = useUserStore();
  const [pendingMode, setPendingMode] = useState(storageMode);
  const [pendingLocal, setPendingLocal] = useState(localSaveMode);
  const [saved, setSaved] = useState(false);

  function handleSave() {
    if (!pendingMode) return;
    setStorageMode(pendingMode, pendingLocal ?? undefined);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  const prefRow = (label: string, sub: string, key: keyof typeof preferences) => (
    <div className="flex items-center justify-between py-3 border-b border-[var(--nl-border-subtle)] last:border-0 gap-4">
      <div>
        <p className="text-[12px] font-mono text-[var(--nl-color-ink-secondary)]">{label}</p>
        <p className="text-[10px] font-mono text-[var(--nl-color-ink-tertiary)] mt-0.5">{sub}</p>
      </div>
      <Toggle
        checked={preferences[key] as boolean}
        onChange={(v) => setPreference(key, v)}
        label={label}
      />
    </div>
  );

  return (
    <div className="flex-1 overflow-y-auto p-7 space-y-8">
      {/* Storage section */}
      <section>
        <h3 className="text-[10px] font-mono uppercase tracking-[1px] text-[var(--nl-color-ink-tertiary)] pb-3 border-b border-[var(--nl-border-subtle)] mb-4">
          Storage preference
        </h3>
        <div className="grid grid-cols-2 gap-3 mb-4">
          {(['cloud', 'local'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setPendingMode(mode)}
              className={cn(
                'p-4 rounded-[var(--nl-radius-lg)] border-[1.5px] text-left transition-all relative',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--nl-color-accent-primary)]',
                pendingMode === mode
                  ? mode === 'cloud'
                    ? 'border-[var(--nl-color-blue-primary)] bg-[var(--nl-color-blue-subtle)]'
                    : 'border-[var(--nl-color-accent-primary)] bg-[var(--nl-color-accent-subtle)]'
                  : 'border-[var(--nl-border-default)] bg-[var(--nl-color-paper-raised)] hover:border-[var(--nl-border-strong)]',
              )}
            >
              {pendingMode === mode && (
                <span className="absolute top-2.5 right-2.5 w-4 h-4 rounded-full flex items-center justify-center bg-[var(--nl-color-accent-primary)]" aria-hidden="true">
                  <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="2,6 5,9 10,3"/></svg>
                </span>
              )}
              <p className="text-[12px] font-mono font-medium text-[var(--nl-color-ink-primary)] capitalize">{mode === 'cloud' ? 'Cloud sync' : 'Local only'}</p>
              <p className="text-[10px] font-mono text-[var(--nl-color-ink-tertiary)] mt-1 leading-snug">
                {mode === 'cloud' ? 'Saved under your UUID, any device.' : 'Never leaves your machine.'}
              </p>
            </button>
          ))}
        </div>

        {pendingMode === 'cloud' && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-[var(--nl-radius-sm)] bg-[var(--nl-color-blue-subtle)] border border-[var(--nl-color-blue-border)] mb-4">
            <span className="text-[9px] font-mono uppercase tracking-[0.8px] text-[var(--nl-color-ink-tertiary)] shrink-0">Your ID</span>
            <code className="flex-1 text-[11px] font-mono text-[var(--nl-color-blue-primary)] truncate">{uuid}</code>
            <button type="button" onClick={() => navigator.clipboard.writeText(uuid)} className="text-[10px] font-mono text-[var(--nl-color-blue-primary)] hover:underline shrink-0">Copy</button>
          </div>
        )}

        {pendingMode === 'local' && (
          <div className="space-y-2 mb-4">
            {(['download', 'folder'] as const).map((lm) => (
              <button
                key={lm}
                type="button"
                onClick={() => setPendingLocal(lm)}
                className={cn(
                  'w-full text-left px-3 py-2.5 rounded-[var(--nl-radius-sm)] flex items-center gap-3 border transition-all',
                  pendingLocal === lm
                    ? 'border-[var(--nl-color-accent-primary)] bg-[var(--nl-color-accent-subtle)]'
                    : 'border-[var(--nl-border-subtle)] hover:bg-[var(--nl-color-paper-sunken)]',
                )}
              >
                <p className="text-[12px] font-mono font-medium text-[var(--nl-color-ink-primary)]">
                  {lm === 'download' ? 'Download after each session' : 'Save to a folder'}
                </p>
                {pendingLocal === lm && <svg className="ml-auto text-[var(--nl-color-accent-primary)] shrink-0" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>}
              </button>
            ))}

            {/*
              FolderPickerButton — only shown when the user has selected or
              previously saved "folder" as their local save mode.

              Rendered directly below the mode selector so the relationship
              between choosing "Save to a folder" and granting access is
              spatially obvious — no hunting around the settings page.

              The component handles browser support detection internally:
              Firefox gets an explanatory banner; Chrome/Edge get the picker.
            */}
            {pendingLocal === 'folder' && (
              <div className="mt-3 pl-1">
                <FolderPickerButton />
              </div>
            )}
          </div>
        )}

        <div className="flex items-center gap-3">
          <Button variant="primary" size="md" onClick={handleSave}>Save changes</Button>
          {saved && <span className="text-[11px] font-mono text-[var(--nl-color-accent-primary)]">✓ Saved</span>}
        </div>
      </section>

      {/* Preferences section */}
      <section>
        <h3 className="text-[10px] font-mono uppercase tracking-[1px] text-[var(--nl-color-ink-tertiary)] pb-3 border-b border-[var(--nl-border-subtle)] mb-2">
          Preferences
        </h3>
        {prefRow('Auto-classify notes', 'Label notes as action, decision, or insight', 'autoClassify')}
        {prefRow('Show live transcript', 'Display real-time speech while recording', 'showLiveTranscript')}
        {prefRow('Auto-tag keywords', 'Extract keyword tags on each note card', 'autoTagKeywords')}
      </section>

      {/* Recovery email */}
      <section>
        <h3 className="text-[10px] font-mono uppercase tracking-[1px] text-[var(--nl-color-ink-tertiary)] pb-3 border-b border-[var(--nl-border-subtle)] mb-4">
          Cross-device recovery
        </h3>
        {email ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 px-3 py-2 rounded-[var(--nl-radius-sm)] bg-[var(--nl-color-accent-subtle)] border border-[var(--nl-color-accent-border)]">
              <span className="text-[9px] font-mono uppercase tracking-[0.8px] text-[var(--nl-color-ink-tertiary)] shrink-0">Linked</span>
              <code className="flex-1 text-[11px] font-mono text-[var(--nl-color-accent-primary)] truncate">{email}</code>
            </div>
            <p className="text-[10px] font-mono text-[var(--nl-color-ink-tertiary)] leading-relaxed">
              Enter this email on any device to recover your sessions.
            </p>
            <button
              type="button"
              onClick={() => {
                if (confirm('Link a different recovery email?')) {
                  setEmail('');
                }
              }}
              className="text-[10px] font-mono text-[var(--nl-color-ink-tertiary)] hover:text-[var(--nl-color-ink-primary)] underline"
            >
              Change email
            </button>
          </div>
        ) : (
          <>
            <p className="text-[10px] font-mono text-[var(--nl-color-ink-tertiary)] leading-relaxed mb-3">
              Link a recovery email so you can access your notes on a new device.
              On a new device, enter the same email to get your UUID back.
            </p>
            <IdentityRecovery
              currentUuid={uuid}
              linkedEmail={email}
              onSuccess={(recoveredUuid, recoveredEmail, isRecovery) => {
                if (isRecovery) {
                  applyRecoveredUuid(recoveredUuid, recoveredEmail);
                  // Clear session list — it will refetch under the recovered UUID.
                  useSessionStore.getState().setSessions([]);
                } else {
                  setEmail(recoveredEmail);
                }
              }}
            />
          </>
        )}
      </section>

      {/* Danger zone */}
      <section>
        <h3 className="text-[10px] font-mono uppercase tracking-[1px] text-[var(--nl-color-ink-tertiary)] pb-3 border-b border-[var(--nl-border-subtle)] mb-4">
          Danger zone
        </h3>
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-[12px] font-mono text-[var(--nl-color-ink-secondary)]">Reset storage preference</p>
              <p className="text-[10px] font-mono text-[var(--nl-color-ink-tertiary)] mt-0.5">Show the onboarding screen again</p>
            </div>
            <Button variant="danger" size="sm" onClick={() => { if (confirm('Reset preference and re-onboard?')) resetIdentity(); }}>
              Re-onboard
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}

// ─── Main shell ───────────────────────────────────────────────────────────────

type ActiveTab = 'notes' | 'transcript' | 'summary' | 'chat' | 'settings';

export function NotepadShell() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('notes');
  const [isSyncing, setIsSyncing] = useState(false);
  const [aiState, setAiState] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [aiSummary, setAiSummary] = useState<AiSummary | undefined>();
  const notesEndRef = useRef<HTMLDivElement>(null);

  const qc = useQueryClient();
  const [noteSearch, setNoteSearch] = useState('');

  // ── Stores ─────────────────────────────────────────────────────────────

  const {
    sessions,
    activeSessionId,
    activeNotes,
    activeTranscript,
    activeTranscriptSegments,
    setActiveSession,
    createSession,
    setActiveSessionTitle,
    updateNote,
    removeSession,
  } = useSessionStore();

  const { uuid, hasOnboarded, storageMode, localSaveMode, preferences, completeOnboarding } = useUserStore();
  const { saveToFolder, hasFolder } = useStorageFolderHandle();

  const activeItem = useSessionStore(selectActiveSessionListItem);

  // ── Recording orchestrator ─────────────────────────────────────────────

  const {
    recordingStatus,
    liveTranscript,
    elapsedSeconds,
    error: recordingError,
    startRecording,
    stopRecording,
  } = useRecordingState();

  // ── Queries ────────────────────────────────────────────────────────────

  // Fetch session list from API when in cloud mode
  const { data: cloudSessions = [] } = useQuery({
    queryKey: ['sessions', uuid],
    queryFn: () => sessionsApi.list(),
    enabled: storageMode === 'cloud' && !!uuid,
  });

  // ── Mutations ──────────────────────────────────────────────────────────

  const createSessionMutation = useMutation({
    mutationFn: (payload: { id: string; title: string }) => sessionsApi.create(payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sessions', uuid] }),
  });

  const deleteSessionMutation = useMutation({
    mutationFn: (id: string) => sessionsApi.delete(id),
    onSuccess: (_data, deletedId) => {
      // Remove from local Zustand list immediately — no wait for refetch.
      removeSession(deletedId);
      // Refresh the cloud sessions list.
      void qc.invalidateQueries({ queryKey: ['sessions', uuid] });
      // If we just deleted the active session, load the next available one.
      const { activeSessionId: nextId, sessions: remaining } = useSessionStore.getState();
      if (nextId && nextId !== deletedId) {
        void handleSelectSession(nextId);
      } else if (remaining.length === 0) {
        setAiState('idle');
        setAiSummary(undefined);
      }
    },
    onError: (err) => {
      console.error('[Session] Delete failed:', err);
    },
  });

  function handleDeleteSession(sessionId: string) {
    // Confirmation is handled inline in NavigationSidebar's SessionItem.
    if (storageMode === 'cloud') {
      deleteSessionMutation.mutate(sessionId);
    } else {
      // Local delete — remove immediately and auto-navigate.
      const wasActive = activeSessionId === sessionId;
      removeSession(sessionId);
      if (wasActive) {
        const { sessions: remaining } = useSessionStore.getState();
        const next = remaining[0];
        if (next) void handleSelectSession(next.id);
        else { setAiState('idle'); setAiSummary(undefined); }
      }
    }
  }

  // ── Handlers ───────────────────────────────────────────────────────────

  function handleNewSession() {
    const newId = createSession(uuid);
    if (storageMode === 'cloud') {
      createSessionMutation.mutate({ id: newId, title: '' });
    }
    setAiState('idle');
    setAiSummary(undefined);
  }

  async function handleSelectSession(sessionId: string) {
    if (sessionId === activeSessionId) return;
    setAiState('idle');
    setAiSummary(undefined);

    if (storageMode === 'cloud') {
      try {
        const session = await sessionsApi.get(sessionId);
        setActiveSession(
          session.id,
          session.notes,
          session.transcript ?? '',
          session.transcriptSegments ?? [],
        );
        if (session.aiSummary) {
          setAiState('success');
          setAiSummary(session.aiSummary);
        }
      } catch {
        // Fall back to local state
        const local = sessions.find((s) => s.id === sessionId);
        if (local) setActiveSession(sessionId, [], '', []);
      }
    } else {
      // Local mode: load notes + transcript from IndexedDB.
      const saved = await loadSessionData(sessionId);
      setActiveSession(
        sessionId,
        saved?.notes ?? [],
        saved?.transcript ?? '',
        saved?.transcriptSegments ?? [],
      );
      if (saved?.aiSummary) {
        setAiState('success');
        setAiSummary(saved.aiSummary);
      }
    }
  }

  async function handleSyncCloud() {
    if (storageMode !== 'cloud') return;
    setIsSyncing(true);
    try {
      await qc.invalidateQueries({ queryKey: ['sessions', uuid] });
    } finally {
      setIsSyncing(false);
    }
  }

  const generateAiNotes = useCallback(async (options?: {
    sessionId?: string | null;
    notes?: typeof activeNotes;
    transcript?: string;
    transcriptSegments?: TranscriptSegment[];
    sessionTitle?: string;
  }): Promise<AiSummary | undefined> => {
    const sessionId = options?.sessionId ?? activeSessionId;
    const notes = options?.notes ?? activeNotes;
    const transcript = options?.transcript ?? activeTranscript;
    const transcriptSegments = options?.transcriptSegments ?? activeTranscriptSegments;

    if (!sessionId || (notes.length === 0 && transcriptSegments.length === 0 && !transcript.trim())) return undefined;
    setAiState('loading');

    try {
      const summary = await http.post<AiSummary>('/api/ai/summarize', {
        sessionId,
        notes: notes.map((n) => ({ type: n.type, content: n.content, capturedAt: n.capturedAt })),
        transcriptExcerpt: transcript.slice(0, 1500),
        transcriptSegments: transcriptSegments
          .slice(0, 80)
          .map((segment) => ({
            text: segment.text,
            startOffsetSeconds: segment.startOffsetSeconds,
            endOffsetSeconds: segment.endOffsetSeconds,
          })),
        sessionTitle: options?.sessionTitle ?? activeItem?.title,
      } satisfies SummarizeRequest);

      setAiSummary(summary);
      setAiState('success');
      setTimeout(() => notesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
      return summary;
    } catch {
      setAiState('error');
      return undefined;
    }
  }, [activeItem?.title, activeNotes, activeSessionId, activeTranscript, activeTranscriptSegments]);

  // ── Auto-title ─────────────────────────────────────────────────────────

  function generateTitle(opts: {
    summary?: AiSummary;
    notes: typeof activeNotes;
    transcriptSegments: typeof activeTranscriptSegments;
  }): string {
    const trim = (s: string, n: number) => {
      const words = s.trim().split(/\s+/).slice(0, n).join(' ');
      return words.length > 48 ? words.slice(0, 48) + '…' : words;
    };
    if (opts.summary?.overview) return trim(opts.summary.overview, 6);
    const firstAction = opts.notes.find((n) => n.type !== 'summary') ?? opts.notes[0];
    if (firstAction?.content) return trim(firstAction.content, 5);
    if (opts.transcriptSegments[0]?.text) return trim(opts.transcriptSegments[0].text, 5);
    return `Session ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`;
  }

  // ── Note edit sync ──────────────────────────────────────────────────────

  async function syncNoteEdits(updatedNotes: typeof activeNotes) {
    if (!activeSessionId) return;
    if (storageMode === 'cloud') {
      try {
        await sessionsApi.update(activeSessionId, { notes: updatedNotes });
      } catch (err) {
        console.error('[Notes] Failed to save note edit:', err);
      }
    } else if (storageMode === 'local') {
      const existing = await loadSessionData(activeSessionId);
      if (existing) {
        await saveSessionData(activeSessionId, { ...existing, notes: updatedNotes });
      }
    }
  }

  function handleNoteUpdate(id: string, content: string, type: NoteType) {
    updateNote(id, content, type);
    // Read fresh state immediately after the synchronous store update.
    const latest = useSessionStore.getState().activeNotes;
    void syncNoteEdits(latest);
  }

  // ── Title blur-save (cloud) ─────────────────────────────────────────────

  async function handleTitleBlur() {
    if (storageMode === 'cloud' && activeSessionId && activeItem?.title) {
      try {
        await sessionsApi.update(activeSessionId, { title: activeItem.title });
      } catch { /* non-fatal */ }
    } else if (storageMode === 'local' && activeSessionId) {
      const existing = await loadSessionData(activeSessionId);
      if (existing) {
        // Title lives in the Zustand sessions list (persisted via idbStorage).
        // Nothing extra to write here — setActiveSessionTitle already updated it.
      }
      useSessionStore.getState().setSessions(
        useSessionStore.getState().sessions.map((s) =>
          s.id === activeSessionId ? { ...s, title: activeItem?.title ?? s.title } : s,
        ),
      );
    }
  }

  function handleExport() {
    if (!activeNotes.length && !activeTranscriptSegments.length && !activeTranscript.trim()) return;
    const { txt, filename } = exportFormatter.toTxt({
      title: activeItem?.title ?? '',
      notes: activeNotes,
      transcript: activeTranscript,
      transcriptSegments: activeTranscriptSegments,
      aiSummary,
      durationSeconds: elapsedSeconds,
    });
    exportFormatter.triggerDownload(txt, filename);
  }

  async function handleStopRecording() {
    await stopRecording();

    const {
      activeSessionId: stoppedSessionId,
      activeNotes: stoppedNotes,
      activeTranscript: stoppedTranscript,
      activeTranscriptSegments: stoppedTranscriptSegments,
      sessions: stoppedSessions,
    } = useSessionStore.getState();

    const rawTitle    = stoppedSessions.find((s) => s.id === stoppedSessionId)?.title ?? '';
    const hasContent  = stoppedNotes.length > 0 || stoppedTranscriptSegments.length > 0 || stoppedTranscript.trim().length > 0;

    // Refresh the sidebar so the saved session is visible immediately.
    if (storageMode === 'cloud') {
      void qc.invalidateQueries({ queryKey: ['sessions', uuid] });
    }

    // Generate AI summary (cloud only — local sessions aren't in the DB).
    const summary = storageMode === 'cloud'
      ? await generateAiNotes({
          sessionId: stoppedSessionId,
          notes: stoppedNotes,
          transcript: stoppedTranscript,
          transcriptSegments: stoppedTranscriptSegments,
          sessionTitle: rawTitle,
        })
      : undefined;

    // Auto-name the session if the user left it blank.
    const finalTitle = rawTitle.trim() || generateTitle({
      summary,
      notes: stoppedNotes,
      transcriptSegments: stoppedTranscriptSegments,
    });

    if (!rawTitle.trim() && finalTitle && stoppedSessionId) {
      setActiveSessionTitle(finalTitle);
      if (storageMode === 'cloud') {
        try { await sessionsApi.update(stoppedSessionId, { title: finalTitle }); } catch { /* non-fatal */ }
      }
    }

    // Refresh again so the AI summary badge and title appear on the session list item.
    if (storageMode === 'cloud') {
      void qc.invalidateQueries({ queryKey: ['sessions', uuid] });
    }

    // Local mode: persist notes + transcript to IndexedDB so the session is
    // viewable in the sidebar after navigation or page refresh.
    if (storageMode === 'local' && stoppedSessionId) {
      await saveSessionData(stoppedSessionId, {
        notes: stoppedNotes,
        transcript: stoppedTranscript,
        transcriptSegments: stoppedTranscriptSegments,
        durationSeconds: elapsedSeconds,
        aiSummary: summary,
      });

      useSessionStore.getState().setSessions(
        useSessionStore.getState().sessions.map((s) =>
          s.id === stoppedSessionId
            ? {
                ...s,
                title: finalTitle || s.title,
                noteCount: stoppedNotes.length,
                durationSeconds: elapsedSeconds,
                status: 'stopped' as const,
              }
            : s,
        ),
      );
    }

    // Local file export — runs after AI so the summary is included in the file.
    if (storageMode === 'local' && hasContent) {
      const { txt, filename } = exportFormatter.toTxt({
        title: finalTitle,
        notes: stoppedNotes,
        transcript: stoppedTranscript,
        transcriptSegments: stoppedTranscriptSegments,
        aiSummary: summary,
        durationSeconds: elapsedSeconds,
      });

      if (localSaveMode === 'folder' && hasFolder) {
        const wrote = await saveToFolder(txt, filename);
        if (!wrote) exportFormatter.triggerDownload(txt, filename);
      } else {
        exportFormatter.triggerDownload(txt, filename);
      }
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────

  const isRecording = recordingStatus === 'recording';

  function formatDuration(secs: number): string {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
  }

  const sessionDate = activeItem
    ? new Date(activeItem.createdAt).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
    : null;

  const SESSION_TABS: { id: ActiveTab; label: string }[] = [
    { id: 'notes',      label: 'Notes'      },
    { id: 'transcript', label: 'Transcript' },
    { id: 'summary',    label: 'Summary'    },
    { id: 'chat',       label: 'Ask notes'  },
  ];

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <>
      {/* Onboarding overlay */}
      {!hasOnboarded && (
        <StorageOnboarding
          uuid={uuid}
          onConfirm={(mode, localMode) => completeOnboarding(mode, localMode)}
        />
      )}

      {/* Full-screen app shell */}
      <div className="flex h-screen overflow-hidden bg-[var(--nl-color-paper-bg)]">
        {/* ── Dark navigation sidebar ──────────────────────────────── */}
        <NavigationSidebar
          sessions={sessions}
          cloudSessions={cloudSessions}
          activeSessionId={activeSessionId}
          storageMode={storageMode}
          isSyncing={isSyncing}
          onSelectSession={handleSelectSession}
          onDeleteSession={handleDeleteSession}
          onNewSession={handleNewSession}
          onSyncCloud={handleSyncCloud}
          onOpenSettings={() => setActiveTab('settings')}
        />

        {/* ── Main content ────────────────────────────────────────── */}
        <div className="flex flex-col flex-1 min-w-0 overflow-hidden bg-[var(--nl-color-paper-base)]">

        {/* Settings (full-page) */}
        {activeTab === 'settings' && (
          <div className="flex flex-col flex-1 overflow-hidden">
            <header className="flex items-center gap-3 px-8 py-5 border-b border-[var(--nl-border-subtle)] shrink-0">
              <button type="button" onClick={() => setActiveTab('notes')} className="text-[11px] font-mono text-[var(--nl-color-ink-tertiary)] hover:text-[var(--nl-color-ink-primary)] flex items-center gap-1.5 transition-colors">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
                Back
              </button>
              <div className="flex items-center gap-3">
                {/* App icon */}
                <div aria-hidden="true" style={{ width: 28, height: 28, borderRadius: 7, background: 'white', overflow: 'hidden', flexShrink: 0 }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/logo.png" alt="" style={{ width: 185, height: 'auto', marginTop: -6, marginLeft: -6, display: 'block' }} />
                </div>
                <h1 className="font-serif text-[20px] font-semibold text-[var(--nl-color-ink-primary)]">Settings</h1>
              </div>
            </header>
            <div className="flex-1 overflow-y-auto">
              <div className="max-w-xl mx-auto px-8 py-8">
                <SettingsPanel />
              </div>
            </div>
          </div>
        )}

        {/* Session content (Notes / Transcript / Summary / Chat) */}
        {activeTab !== 'settings' && (
          <>
            {/* Session header */}
            <header className="shrink-0 px-7 pt-6 bg-[var(--nl-color-paper-base)] border-b border-[var(--nl-border-subtle)]">
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1 min-w-0 mr-4">
                  <input
                    type="text"
                    value={activeItem?.title ?? ''}
                    onChange={(e) => setActiveSessionTitle(e.target.value)}
                    onBlur={() => void handleTitleBlur()}
                    placeholder="Untitled session"
                    aria-label="Session title"
                    className="font-serif text-[24px] font-semibold bg-transparent border-none outline-none w-full text-[var(--nl-color-ink-primary)] placeholder:text-[var(--nl-color-ink-disabled)]"
                  />
                  <div className="flex items-center gap-3 mt-1">
                    {sessionDate && <span className="text-[11px] font-mono text-[var(--nl-color-ink-tertiary)]">{sessionDate}</span>}
                    {activeNotes.length > 0 && <span className="text-[11px] font-mono text-[var(--nl-color-ink-tertiary)]">· {activeNotes.length} notes</span>}
                    {elapsedSeconds > 0 && recordingStatus === 'idle' && <span className="text-[11px] font-mono text-[var(--nl-color-ink-tertiary)]">· {formatDuration(elapsedSeconds)}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2 pt-1">
                  {isRecording && (
                    <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-mono text-red-600 bg-red-50 border border-red-200">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                      recording
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={handleExport}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--nl-radius-sm)] text-[11px] font-mono border border-[var(--nl-border-default)] text-[var(--nl-color-ink-tertiary)] hover:border-[var(--nl-border-strong)] hover:text-[var(--nl-color-ink-secondary)] transition-colors"
                  >
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                    Export
                  </button>
                </div>
              </div>

              {/* Tab nav */}
              <nav className="flex gap-0" aria-label="Session view">
                {SESSION_TABS.map(({ id, label }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setActiveTab(id)}
                    aria-current={activeTab === id ? 'page' : undefined}
                    className={cn(
                      'relative px-4 py-2 text-[13px] font-sans border-b-2 transition-colors',
                      'focus-visible:outline-none',
                      activeTab === id
                        ? 'border-[var(--nl-color-accent-primary)] text-[var(--nl-color-ink-primary)] font-medium'
                        : 'border-transparent text-[var(--nl-color-ink-tertiary)] hover:text-[var(--nl-color-ink-secondary)]',
                    )}
                  >
                    {label}
                    {/* Dot when summary is ready and user is on a different tab */}
                    {id === 'summary' && aiState === 'success' && activeTab !== 'summary' && (
                      <span
                        className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full bg-[var(--nl-color-accent-primary)]"
                        aria-label="Summary ready"
                      />
                    )}
                    {/* Spinner while generating */}
                    {id === 'summary' && aiState === 'loading' && activeTab !== 'summary' && (
                      <span
                        className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full bg-[var(--nl-color-ink-disabled)] animate-pulse"
                        aria-label="Generating summary"
                      />
                    )}
                  </button>
                ))}
              </nav>
            </header>

            {/* Tab content */}
            <div className="flex flex-1 min-h-0">

              {/* ── Notes tab ───────────────────────────────────────────── */}
              {activeTab === 'notes' && (
                <>
                  <div className="flex flex-col flex-1 min-w-0">
                    {/* Live transcript bar */}
                    <LiveTranscriptBar transcript={liveTranscript} status={recordingStatus} showTranscript={preferences.showLiveTranscript} />

                    {/* Note search */}
                    {activeNotes.length > 0 && recordingStatus === 'idle' && (
                      <div className="px-6 pt-4 shrink-0">
                        <div className="relative">
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--nl-color-ink-disabled)] pointer-events-none"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                          <input type="search" value={noteSearch} onChange={(e) => setNoteSearch(e.target.value)} placeholder="Search notes…" aria-label="Search notes" className={cn('w-full pl-8 pr-8 py-2 rounded-[var(--nl-radius-md)] text-[12px] font-sans text-[var(--nl-color-ink-primary)] bg-[var(--nl-color-paper-sunken)] border border-[var(--nl-border-subtle)] placeholder:text-[var(--nl-color-ink-disabled)] focus:outline-none focus:border-[var(--nl-color-accent-border)] transition-colors')} />
                          {noteSearch && <button type="button" onClick={() => setNoteSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--nl-color-ink-disabled)]"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>}
                        </div>
                      </div>
                    )}

                    {/* Notes feed */}
                    {(() => {
                      const visible = noteSearch.trim()
                        ? activeNotes.filter((n) => n.content.toLowerCase().includes(noteSearch.toLowerCase()) || n.tags.some((t) => t.toLowerCase().includes(noteSearch.toLowerCase())) || n.type.includes(noteSearch.toLowerCase()))
                        : activeNotes;
                      return (
                        <div className="flex-1 overflow-y-auto px-6 pb-6" role="feed" aria-label="Meeting notes" aria-live="polite">
                          {activeNotes.length === 0 && activeTranscriptSegments.length === 0 && recordingStatus === 'idle' ? (
                            <div className="flex flex-col items-center justify-center h-full gap-4 py-16">
                              <div className="w-14 h-14 rounded-full bg-[var(--nl-color-paper-sunken)] flex items-center justify-center">
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--nl-color-ink-disabled)]"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="22"/><line x1="8" y1="22" x2="16" y2="22"/></svg>
                              </div>
                              <div className="text-center">
                                <p className="font-serif text-[18px] text-[var(--nl-color-ink-tertiary)] mb-1">Ready to capture</p>
                                <p className="text-[12px] font-mono text-[var(--nl-color-ink-disabled)] max-w-[220px] leading-relaxed">Tap the mic and start talking. Notes appear here as you speak.</p>
                              </div>
                            </div>
                          ) : (
                            <>
                              {visible.length === 0 && noteSearch.trim() ? (
                                <p className="pt-8 text-center text-[12px] font-mono text-[var(--nl-color-ink-disabled)] italic">
                                  No notes match "{noteSearch}"
                                </p>
                              ) : visible.length > 0 ? (
                                recordingStatus === 'idle' ? (
                                  /* ── Grouped by type — document view ─────────────── */
                                  <div className="pt-5 pb-4 space-y-6">
                                    {(
                                      [
                                        { type: 'action',   label: 'Action Items' },
                                        { type: 'decision', label: 'Decisions'    },
                                        { type: 'insight',  label: 'Insights'     },
                                        { type: 'summary',  label: 'Notes'        },
                                      ] as { type: import('@noteleaf/shared-types').NoteType; label: string }[]
                                    )
                                      .map(({ type, label }) => {
                                        const group = visible.filter((n) => n.type === type);
                                        if (group.length === 0) return null;
                                        return (
                                          <section key={type} aria-label={label}>
                                            {/* Section header */}
                                            <div className="flex items-center gap-3 mb-1">
                                              <h3 className="text-[10px] font-mono font-semibold uppercase tracking-[1.5px] text-[var(--nl-color-ink-tertiary)] shrink-0">
                                                {label}
                                              </h3>
                                              <span className="text-[10px] font-mono text-[var(--nl-color-ink-disabled)] shrink-0">
                                                {group.length}
                                              </span>
                                              <div className="flex-1 h-px bg-[var(--nl-border-subtle)]" />
                                            </div>
                                            {/* Note rows */}
                                            <div>
                                              {group.map((note) => (
                                                <NoteCard
                                                  key={note.id}
                                                  note={note}
                                                  variant="document"
                                                  onUpdate={handleNoteUpdate}
                                                />
                                              ))}
                                            </div>
                                          </section>
                                        );
                                      })}
                                  </div>
                                ) : (
                                  /* ── Chronological feed — during recording ──────── */
                                  <div className="pt-4 space-y-2">
                                    {visible.map((note) => (
                                      <NoteCard
                                        key={note.id}
                                        note={note}
                                        variant="feed"
                                        onUpdate={handleNoteUpdate}
                                      />
                                    ))}
                                  </div>
                                )
                              ) : null}
                              <div ref={notesEndRef} />
                            </>
                          )}
                        </div>
                      );
                    })()}

                    {/* Error */}
                    {recordingError && (
                      <div role="alert" className="mx-5 mb-2 px-4 py-2.5 rounded-[var(--nl-radius-sm)] bg-[var(--nl-color-danger-subtle)] border border-red-200 text-[11px] font-mono text-[var(--nl-color-danger)] shrink-0">
                        {recordingError === 'permission-denied' ? 'Microphone access denied. Allow it in browser settings.' : recordingError === 'not-supported' ? 'Speech recognition requires Chrome or Edge.' : 'Speech recognition error. Please try again.'}
                      </div>
                    )}

                    {/* Recording bar */}
                    <footer className="flex items-center gap-4 px-5 py-4 shrink-0 bg-[var(--nl-color-paper-raised)] border-t border-[var(--nl-border-subtle)]">
                      <MicButton status={recordingStatus} onStart={startRecording} onStop={handleStopRecording} />
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-sans text-[var(--nl-color-ink-secondary)] truncate">
                          {recordingStatus === 'idle' ? 'Tap to start listening' : recordingStatus === 'connecting' ? 'Connecting…' : recordingStatus === 'recording' ? 'Listening — speak clearly' : recordingStatus === 'stopping' ? 'Wrapping up…' : 'Something went wrong'}
                        </p>
                        <p className="text-[10px] font-mono text-[var(--nl-color-ink-disabled)] mt-0.5">
                          {activeNotes.length > 0 ? `${activeNotes.length} note${activeNotes.length !== 1 ? 's' : ''} captured` : 'notes will appear as you speak'}
                        </p>
                      </div>
                      <RecordingTimer elapsedSeconds={elapsedSeconds} status={recordingStatus} />
                    </footer>
                  </div>

                  {/* Right: searchable transcript panel */}
                  <SessionTranscriptPanel
                    segments={activeTranscriptSegments}
                    liveTranscript={liveTranscript}
                    isRecording={isRecording}
                    elapsedSeconds={elapsedSeconds}
                  />
                </>
              )}

              {/* ── Transcript tab ──────────────────────────────────────── */}
              {activeTab === 'transcript' && (
                <div className="flex-1 overflow-y-auto px-8 py-6">
                  {activeTranscriptSegments.length === 0 && !activeTranscript ? (
                    <p className="text-[13px] font-mono text-[var(--nl-color-ink-disabled)] italic text-center mt-16">No transcript yet. Record a session first.</p>
                  ) : (
                    <div className="max-w-2xl mx-auto">
                      <h2 className="font-serif text-[18px] font-semibold mb-4 text-[var(--nl-color-ink-primary)]">Verbatim Transcript</h2>
                      {activeTranscriptSegments.length > 0 ? (
                        <div className="space-y-1">
                          {activeTranscriptSegments.map((seg) => (
                            <div key={seg.id} className="flex gap-4 py-2 border-b border-[var(--nl-border-subtle)] last:border-0">
                              <span className="text-[11px] font-mono text-[var(--nl-color-ink-tertiary)] shrink-0 pt-0.5 w-12">
                                {String(Math.floor(seg.startOffsetSeconds / 60)).padStart(2, '0')}:{String(Math.floor(seg.startOffsetSeconds % 60)).padStart(2, '0')}
                              </span>
                              <p className="text-[14px] font-sans leading-[1.7] text-[var(--nl-color-ink-primary)]">{seg.text}</p>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-[14px] font-sans leading-[1.75] text-[var(--nl-color-ink-secondary)]">{activeTranscript}</p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* ── Summary tab ─────────────────────────────────────────── */}
              {activeTab === 'summary' && (
                <div className="flex-1 overflow-y-auto px-8 py-6">
                  <div className="max-w-2xl mx-auto">
                    {aiState === 'idle' ? (
                      <div className="text-center mt-16 space-y-3">
                        <p className="font-serif text-[18px] text-[var(--nl-color-ink-tertiary)]">No summary yet</p>
                        <p className="text-[12px] font-mono text-[var(--nl-color-ink-disabled)]">Record a session and the AI summary will appear here automatically.</p>
                      </div>
                    ) : (
                      <AiSummaryCard state={aiState} summary={aiSummary} onRetry={() => void generateAiNotes()} />
                    )}
                  </div>
                </div>
              )}

              {/* ── Chat tab ────────────────────────────────────────────── */}
              {activeTab === 'chat' && (
                <ChatPanel
                  notes={activeNotes}
                  transcriptSegments={activeTranscriptSegments}
                  sessionTitle={activeItem?.title ?? ''}
                />
              )}

            </div>
          </>
        )}

        </div>{/* end main content */}
      </div>
    </>
  );
}
