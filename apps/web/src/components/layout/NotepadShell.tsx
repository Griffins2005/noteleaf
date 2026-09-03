'use client';

import { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

// Feature components
import { ChatPanel } from '@/features/chat/ChatPanel';
import { SettingsPanel } from '@/components/layout/SettingsPanel';
import { TabCoachPopover } from '@/features/meeting/components/TabCoachPopover';
import { MeetingHowToStrip } from '@/features/meeting/components/MeetingHowToStrip';
import { PostMeetingActions } from '@/features/meeting/components/PostMeetingActions';
import { getMeetingPhase } from '@/lib/meetingPhase';
import {
  dismissTabCoach,
  getTabCoachMessage,
  wasTabCoachDismissed,
  type CoachTab,
} from '@/lib/tabCoachMessages';
import { NavigationSidebar } from '@/components/layout/NavigationSidebar';
import { SessionTranscriptPanel } from '@/components/layout/SessionTranscriptPanel';
import { LiveTranscriptBar } from '@/features/recording/components/LiveTranscriptBar';
import { MicButton } from '@/features/recording/components/MicButton';
import { RecordingTimer } from '@/features/recording/components/RecordingTimer';
import { NoteCard } from '@/features/notes/components/NoteCard';
import { AiSummaryCard } from '@/features/notes/components/AiSummaryCard';

// UI
import { Button } from '@/components/ui/Button';

// Hooks
import { useRecordingState, type RecordingStatus, type AutosaveStatus } from '@/features/recording/hooks/useRecordingState';

// Stores
import { useSessionStore, selectActiveSessionListItem } from '@/store/session.store';
import { useUserStore } from '@/store/user.store';
import { useAuthStore } from '@/store/auth.store';

// Services
import { sessionsApi } from '@/features/sessions/sessions.api';
import { http, HttpError } from '@/lib/http.client';
import { exportFormatter } from '@/lib/exportFormatter';
import {
  hasSummarizeContext,
  buildSummarizePayload,
  hasChatContext,
} from '@/lib/sessionContext';
import { buildInstantRecap } from '@/lib/instantRecap';

// Types
import type { AiSummary, SummarizeRequest, TranscriptSegment, NoteType, ChatMessage } from '@noteleaf/shared-types';
import { cn } from '@/lib/cn';

// ─── Main shell ───────────────────────────────────────────────────────────────

type ActiveTab = 'notes' | 'transcript' | 'summary' | 'chat' | 'settings';

const LAST_SESSION_KEY = 'nl_last_session';

export function NotepadShell() {
  const [activeTab, setActiveTab]               = useState<ActiveTab>('notes');
  const [aiState, setAiState]                   = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [aiEnhancing, setAiEnhancing]           = useState(false);
  const [aiSummary, setAiSummary]               = useState<AiSummary | undefined>();
  const [tabCoach, setTabCoach]                 = useState<{
    tab: CoachTab;
    title: string;
    message: string;
  } | null>(null);
  const notesEndRef = useRef<HTMLDivElement>(null);
  const hasRestoredSession = useRef(false);
  const captureBusyRef = useRef(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [noteSaveError, setNoteSaveError] = useState<string | null>(null);

  const qc = useQueryClient();
  const [noteSearch, setNoteSearch] = useState('');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);

  // ── Stores ─────────────────────────────────────────────────────────────

  const {
    sessions: zustandSessions,
    activeSessionId,
    activeNotes,
    activeTranscript,
    activeTranscriptSegments,
    setActiveSession,
    createSession,
    setActiveSessionTitle,
    setActiveSessionDuration,
    updateNote,
    removeSession,
  } = useSessionStore();

  const { preferences } = useUserStore();
  const userId = useAuthStore((s) => s.user?.id ?? '');

  const activeItem = useSessionStore(selectActiveSessionListItem);

  // ── Recording orchestrator ─────────────────────────────────────────────

  const {
    recordingStatus,
    liveTranscript,
    elapsedSeconds,
    error: recordingError,
    sttWarning,
    startRecording,
    stopRecording,
    autosaveStatus,
  } = useRecordingState();

  // ── Query: session list ────────────────────────────────────────────────

  const { data: apiSessions = [] } = useQuery({
    queryKey: ['sessions', userId],
    queryFn:  () => sessionsApi.list(),
    enabled:  !!userId,
  });

  // Merge: Zustand has optimistic new sessions; API is source of truth for existing ones.
  const sessions = useMemo(() => {
    const apiIds = new Set(apiSessions.map((s) => s.id));
    return [...zustandSessions.filter((s) => !apiIds.has(s.id)), ...apiSessions];
  }, [zustandSessions, apiSessions]);

  // ── Mutations ──────────────────────────────────────────────────────────

  const createSessionMutation = useMutation({
    mutationFn: (payload: { id: string; title: string }) => sessionsApi.create(payload),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['sessions', userId] }),
    onError: (_err, payload) => {
      if (captureBusyRef.current) return;
      removeSession(payload.id);
    },
  });

  const deleteSessionMutation = useMutation({
    mutationFn: (id: string) => sessionsApi.delete(id),
    onSuccess: (_data, deletedId) => {
      removeSession(deletedId);
      void qc.invalidateQueries({ queryKey: ['sessions', userId] });
      const { activeSessionId: nextId, sessions: remaining } = useSessionStore.getState();
      if (nextId && nextId !== deletedId) {
        void handleSelectSession(nextId);
      } else if (remaining.length === 0) {
        setAiState('idle');
        setAiSummary(undefined);
      }
    },
  });

  // ── Handlers ───────────────────────────────────────────────────────────

  function handleNewSession() {
    if (recordingStatus === 'recording' || recordingStatus === 'connecting' || recordingStatus === 'stopping') {
      return;
    }
    const newId = createSession(userId);
    createSessionMutation.mutate({ id: newId, title: '' });
    setAiState('idle');
    setAiSummary(undefined);
    setAiEnhancing(false);
    setTabCoach(null);
    setChatMessages([]);
    setSessionError(null);
    setNoteSaveError(null);
    setActiveTab('notes');
    if (typeof window !== 'undefined') {
      localStorage.setItem(LAST_SESSION_KEY, newId);
    }
  }

  async function handleSelectSession(sessionId: string) {
    if (sessionId === activeSessionId) return;
    if (recordingStatus === 'recording' || recordingStatus === 'connecting' || recordingStatus === 'stopping') {
      return;
    }
    setAiState('idle');
    setAiSummary(undefined);
    setAiEnhancing(false);
    setTabCoach(null);
    setSessionError(null);
    setNoteSaveError(null);

    try {
      const session = await sessionsApi.get(sessionId);
      setActiveSession(
        session.id,
        session.notes,
        session.transcript ?? '',
        session.transcriptSegments ?? [],
        {
          userUuid: session.userUuid,
          title: session.title,
          durationSeconds: session.durationSeconds,
          status: session.status,
          hasAiSummary: !!session.aiSummary,
          createdAt: session.createdAt,
          updatedAt: session.updatedAt,
        },
      );
      setChatMessages(session.chatMessages ?? []);
      if (session.aiSummary) {
        setAiState('success');
        setAiSummary(session.aiSummary);
      }
      if (typeof window !== 'undefined') {
        localStorage.setItem(LAST_SESSION_KEY, sessionId);
      }
    } catch {
      setSessionError("Couldn't load that session. Try again.");
    }
  }

  // Restore last-open session after refresh
  useEffect(() => {
    if (!userId || apiSessions.length === 0 || activeSessionId || hasRestoredSession.current) return;
    hasRestoredSession.current = true;

    const lastId = typeof window !== 'undefined'
      ? localStorage.getItem(LAST_SESSION_KEY)
      : null;
    const target = lastId && apiSessions.some((s) => s.id === lastId)
      ? lastId
      : apiSessions[0]!.id;

    void handleSelectSession(target);
  }, [userId, apiSessions, activeSessionId]);

  const generateAiNotes = useCallback(async (options?: {
    sessionId?: string | null;
    notes?: typeof activeNotes;
    transcript?: string;
    transcriptSegments?: TranscriptSegment[];
    sessionTitle?: string;
    /** Keep instant draft visible while the LLM runs. */
    background?: boolean;
  }): Promise<AiSummary | undefined> => {
    const sessionId          = options?.sessionId ?? activeSessionId;
    const notes              = options?.notes ?? activeNotes;
    const transcript         = options?.transcript ?? activeTranscript;
    const transcriptSegments = options?.transcriptSegments ?? activeTranscriptSegments;
    const background         = options?.background ?? false;

    if (!sessionId || !hasSummarizeContext(notes, transcript, transcriptSegments)) return undefined;

    if (background) {
      setAiEnhancing(true);
    } else {
      setAiState('loading');
      setAiEnhancing(false);
    }

    try {
      const payload = buildSummarizePayload(notes, transcript, transcriptSegments);

      const summary = await http.post<AiSummary>('/api/ai/summarize', {
        sessionId,
        ...payload,
        sessionTitle: options?.sessionTitle ?? activeItem?.title,
      } satisfies SummarizeRequest);

      setAiSummary(summary);
      setAiState('success');
      setAiEnhancing(false);
      setTimeout(() => notesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
      return summary;
    } catch (err) {
      console.error(
        '[AI summarize]',
        err instanceof HttpError
          ? `${err.apiError.code}: ${err.apiError.message}`
          : err,
      );
      if (background) {
        setAiEnhancing(false);
      } else {
        setAiState('error');
      }
      return undefined;
    }
  }, [activeItem?.title, activeNotes, activeSessionId, activeTranscript, activeTranscriptSegments]);

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
    const first = opts.notes.find((n) => n.type !== 'summary') ?? opts.notes[0];
    if (first?.content) return trim(first.content, 5);
    if (opts.transcriptSegments[0]?.text) return trim(opts.transcriptSegments[0].text, 5);
    return `Session ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`;
  }

  async function syncNoteEdits(updatedNotes: typeof activeNotes) {
    if (!activeSessionId) return;
    try {
      await sessionsApi.update(activeSessionId, { notes: updatedNotes });
      setNoteSaveError(null);
    } catch (err) {
      console.error('[Notes] Failed to save note edit:', err);
      setNoteSaveError("Couldn't save that edit. Check your connection and try again.");
    }
  }

  function handleNoteUpdate(id: string, content: string, type: NoteType) {
    updateNote(id, content, type);
    const latest = useSessionStore.getState().activeNotes;
    void syncNoteEdits(latest);
  }

  async function handleTitleBlur() {
    if (!activeSessionId) return;
    const title = (activeItem?.title ?? '').trim();
    try {
      await sessionsApi.update(activeSessionId, { title });
      void qc.invalidateQueries({ queryKey: ['sessions', userId] });
    } catch { /* non-fatal */ }
  }

  function handleExport() {
    if (!activeNotes.length && !activeTranscriptSegments.length && !activeTranscript.trim()) return;
    const { txt, filename } = exportFormatter.toTxt({
      title: activeItem?.title ?? '',
      notes: activeNotes,
      transcript: activeTranscript,
      transcriptSegments: activeTranscriptSegments,
      aiSummary,
      durationSeconds: displayDuration,
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

    const rawTitle   = stoppedSessions.find((s) => s.id === stoppedSessionId)?.title ?? '';
    const hasContent = stoppedNotes.length > 0 || stoppedTranscriptSegments.length > 0 || stoppedTranscript.trim().length > 0;

    setActiveSessionDuration(elapsedSeconds);
    void qc.invalidateQueries({ queryKey: ['sessions', userId] });

    if (hasContent && stoppedSessionId) {
      setAiSummary(buildInstantRecap(stoppedSessionId, stoppedNotes));
      setAiState('success');
      setActiveTab('summary');
      if (!wasTabCoachDismissed(stoppedSessionId, 'summary')) {
        setTabCoach({ tab: 'summary', ...getTabCoachMessage('summary', 'after') });
      }
    }

    const finalTitle = rawTitle.trim() || generateTitle({
      notes: stoppedNotes,
      transcriptSegments: stoppedTranscriptSegments,
    });

    if (!rawTitle.trim() && finalTitle && stoppedSessionId) {
      setActiveSessionTitle(finalTitle);
      void sessionsApi.update(stoppedSessionId, { title: finalTitle }).catch(() => { /* non-fatal */ });
    }

    if (hasContent) {
      void generateAiNotes({
        sessionId: stoppedSessionId,
        notes: stoppedNotes,
        transcript: stoppedTranscript,
        transcriptSegments: stoppedTranscriptSegments,
        sessionTitle: rawTitle.trim() || finalTitle,
        background: true,
      }).then((summary) => {
        if (!rawTitle.trim() && summary && stoppedSessionId) {
          const aiTitle = generateTitle({
            summary,
            notes: stoppedNotes,
            transcriptSegments: stoppedTranscriptSegments,
          });
          if (aiTitle !== finalTitle) {
            setActiveSessionTitle(aiTitle);
            void sessionsApi.update(stoppedSessionId, { title: aiTitle }).catch(() => { /* non-fatal */ });
          }
        }
        void qc.invalidateQueries({ queryKey: ['sessions', userId] });
      });
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────

  const isRecording = recordingStatus === 'recording';
  const isCaptureBusy =
    recordingStatus === 'recording' ||
    recordingStatus === 'connecting' ||
    recordingStatus === 'stopping';
  const displayDuration = isCaptureBusy || recordingStatus === 'error'
    ? elapsedSeconds
    : (activeItem?.durationSeconds || elapsedSeconds);
  captureBusyRef.current = isCaptureBusy;

  const hasSessionContent =
    activeNotes.length > 0 ||
    activeTranscriptSegments.length > 0 ||
    activeTranscript.trim().length > 0;

  const chatReady = hasChatContext(activeNotes, activeTranscriptSegments, {
    liveTranscript,
    fullTranscript: activeTranscript,
    isRecording,
  });

  const meetingPhase = getMeetingPhase({
    isRecording,
    hasSessionContent,
    recordingStatus,
  });

  function handleTabSelect(tab: ActiveTab) {
    if (tab === activeTab) return;

    if (tab === 'settings') {
      setActiveTab(tab);
      setTabCoach(null);
      return;
    }

    setActiveTab(tab);

    const coachTab = tab as CoachTab;
    if (wasTabCoachDismissed(activeSessionId, coachTab)) {
      setTabCoach(null);
      return;
    }

    setTabCoach({ tab: coachTab, ...getTabCoachMessage(coachTab, meetingPhase) });
  }

  function dismissTabCoachPopover() {
    if (activeTab !== 'settings') {
      dismissTabCoach(activeSessionId, activeTab as CoachTab);
    }
    setTabCoach(null);
  }

  function formatDuration(secs: number): string {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
  }

  const sessionDate = activeItem
    ? new Date(activeItem.createdAt).toLocaleDateString('en-US', {
        weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
      })
    : null;

  const SESSION_TABS: { id: ActiveTab; label: string }[] = [
    { id: 'notes',      label: 'Notes'      },
    { id: 'transcript', label: 'Transcript' },
    { id: 'summary',    label: 'Recap'      },
    { id: 'chat',       label: 'Ask notes'  },
  ];

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--nl-color-paper-bg)]">

      {sidebarOpen && (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
          aria-label="Close sessions menu"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ── Dark navigation sidebar ──────────────────────────────── */}
      <div
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex h-full transition-transform duration-200',
          'lg:relative lg:z-auto lg:h-full lg:shrink-0 lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
        )}
      >
        <NavigationSidebar
          sessions={sessions}
          activeSessionId={activeSessionId}
          recordingLocked={isCaptureBusy}
          onSelectSession={(id) => {
            setSidebarOpen(false);
            void handleSelectSession(id);
          }}
          onDeleteSession={(id) => deleteSessionMutation.mutate(id)}
          onNewSession={() => {
            setSidebarOpen(false);
            handleNewSession();
          }}
          onOpenSettings={() => {
            setSidebarOpen(false);
            setActiveTab('settings');
          }}
        />
      </div>

      {/* ── Main content ────────────────────────────────────────── */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden bg-[var(--nl-color-paper-base)]">

        {/* Settings */}
        {activeTab === 'settings' && (
          <div className="flex flex-col flex-1 overflow-hidden">
            <header className="flex items-center gap-4 px-8 py-5 border-b border-[var(--nl-border-subtle)] shrink-0">
              <button
                type="button"
                onClick={() => setSidebarOpen(true)}
                aria-label="Open sessions"
                aria-expanded={sidebarOpen}
                className="lg:hidden w-9 h-9 flex items-center justify-center rounded-[var(--nl-radius-md)] text-[var(--nl-color-ink-tertiary)] hover:text-[var(--nl-color-ink-primary)] hover:bg-[var(--nl-color-paper-sunken)] transition-colors shrink-0"
              >
                <MenuIcon />
              </button>
              <button
                type="button"
                onClick={() => handleTabSelect('notes')}
                aria-label="Back"
                className="w-9 h-9 flex items-center justify-center rounded-[var(--nl-radius-md)] text-[var(--nl-color-ink-tertiary)] hover:text-[var(--nl-color-ink-primary)] hover:bg-[var(--nl-color-paper-sunken)] transition-colors shrink-0"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
              </button>
              <h1 className="font-serif text-[20px] font-semibold text-[var(--nl-color-ink-primary)]">Settings</h1>
            </header>
            <div className="flex-1 overflow-y-auto">
              <div className="max-w-xl mx-auto px-8 py-8">
                <SettingsPanel />
              </div>
            </div>
          </div>
        )}

        {/* Session content */}
        {activeTab !== 'settings' && (
          <>
            {/* Session header */}
            <header className="shrink-0 px-4 sm:px-7 pt-6 bg-[var(--nl-color-paper-base)] border-b border-[var(--nl-border-subtle)]">
              <div className="flex items-start justify-between mb-4">
                <button
                  type="button"
                  onClick={() => setSidebarOpen(true)}
                  aria-label="Open sessions"
                  aria-expanded={sidebarOpen}
                  className="lg:hidden w-9 h-9 mt-1 mr-2 flex items-center justify-center rounded-[var(--nl-radius-md)] text-[var(--nl-color-ink-tertiary)] hover:text-[var(--nl-color-ink-primary)] hover:bg-[var(--nl-color-paper-sunken)] transition-colors shrink-0"
                >
                  <MenuIcon />
                </button>
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
                    {displayDuration > 0 && recordingStatus === 'idle' && <span className="text-[11px] font-mono text-[var(--nl-color-ink-tertiary)]">· {formatDuration(displayDuration)}</span>}
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
                    disabled={!hasSessionContent}
                    aria-label={hasSessionContent ? 'Export this session' : 'Export unavailable — record a session first'}
                    title={hasSessionContent ? 'Export this session' : 'Nothing to export yet — record a session first'}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--nl-radius-sm)] text-[11px] font-mono border border-[var(--nl-border-default)] text-[var(--nl-color-ink-tertiary)] hover:border-[var(--nl-border-strong)] hover:text-[var(--nl-color-ink-secondary)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-[var(--nl-border-default)] disabled:hover:text-[var(--nl-color-ink-tertiary)]"
                  >
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                    Export
                  </button>
                </div>
              </div>

              {/* Tab nav */}
              <nav className="flex gap-0 overflow-x-auto border-b border-[var(--nl-border-subtle)]" aria-label="Session view">
                {SESSION_TABS.map(({ id, label }) => (
                  <div key={id} className="relative">
                    <button
                      type="button"
                      onClick={() => handleTabSelect(id)}
                      aria-current={activeTab === id ? 'page' : undefined}
                      aria-describedby={tabCoach?.tab === id ? `tab-coach-${id}` : undefined}
                      className={cn(
                        'relative px-4 py-2.5 text-[13px] font-sans whitespace-nowrap shrink-0 transition-colors focus-visible:outline-none',
                        activeTab === id
                          ? 'text-black font-medium border-b-2 border-[var(--nl-color-navy)] -mb-px'
                          : 'text-[var(--nl-color-ink-tertiary)] hover:text-black border-b-2 border-transparent -mb-px',
                      )}
                    >
                      {label}
                      {id === 'summary' && (aiState === 'success' || aiEnhancing) && activeTab !== 'summary' && (
                        <span className="absolute top-2 right-1 w-1 h-1 rounded-full bg-[var(--nl-color-navy)]" aria-label="Recap ready" />
                      )}
                      {id === 'chat' && chatReady && activeTab !== 'chat' && (
                        <span
                          className="absolute top-2 right-1 w-1 h-1 rounded-full bg-[var(--nl-color-navy)]"
                          aria-label={isRecording ? 'Live — ready to ask' : 'Ready to ask'}
                        />
                      )}
                    </button>
                    {tabCoach?.tab === id && (
                      <TabCoachPopover
                        content={tabCoach}
                        onDismiss={dismissTabCoachPopover}
                        anchor={id === 'notes' ? 'start' : id === 'chat' ? 'end' : 'center'}
                      />
                    )}
                  </div>
                ))}
              </nav>
            </header>

            {(sessionError || noteSaveError) && (
              <div
                role="alert"
                className="mx-4 sm:mx-7 mt-3 px-4 py-2.5 rounded-[var(--nl-radius-sm)] bg-[var(--nl-color-danger-subtle)] border border-red-200 text-[11px] font-mono text-[var(--nl-color-danger)] shrink-0"
              >
                {sessionError ?? noteSaveError}
              </div>
            )}

            {/* Tab content */}
            <div className={cn(
              'flex flex-1 min-h-0 w-full min-w-0',
              activeTab === 'chat' && 'flex-col',
            )}>

              {/* ── Notes tab ──────────────────────────────────────────── */}
              {activeTab === 'notes' && (
                <>
                  <div className="flex flex-col flex-1 min-w-0">

                    <LiveTranscriptBar transcript={liveTranscript} status={recordingStatus} showTranscript={preferences.showLiveTranscript} />

                    {activeNotes.length > 0 && recordingStatus === 'idle' && (
                      <div className="px-6 pt-4 shrink-0">
                        <div className="relative">
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--nl-color-ink-disabled)] pointer-events-none"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                          <input
                            type="search"
                            value={noteSearch}
                            onChange={(e) => setNoteSearch(e.target.value)}
                            placeholder="Search notes…"
                            aria-label="Search notes"
                            className="w-full pl-8 pr-8 py-2 rounded-[var(--nl-radius-md)] text-[12px] font-sans text-[var(--nl-color-ink-primary)] bg-[var(--nl-color-paper-sunken)] border border-[var(--nl-border-subtle)] placeholder:text-[var(--nl-color-ink-disabled)] focus:outline-none focus:border-[var(--nl-color-accent-border)] transition-colors"
                          />
                          {noteSearch && (
                            <button type="button" onClick={() => setNoteSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--nl-color-ink-disabled)]">
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                            </button>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Notes feed */}
                    {(() => {
                      const visible = noteSearch.trim()
                        ? activeNotes.filter((n) =>
                            n.content.toLowerCase().includes(noteSearch.toLowerCase()) ||
                            n.tags.some((t) => t.toLowerCase().includes(noteSearch.toLowerCase())) ||
                            n.type.includes(noteSearch.toLowerCase())
                          )
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
                                <p className="text-[12px] font-mono text-[var(--nl-color-ink-disabled)] max-w-[280px] leading-relaxed mx-auto">
                                  Open Noteleaf beside Zoom, Teams, Meet, or a room. Tap the mic — then be fully present.
                                </p>
                              </div>
                              <MeetingHowToStrip compact className="w-full max-w-2xl mx-0 mt-2" />
                            </div>
                          ) : (
                            <>
                              {visible.length === 0 && noteSearch.trim() ? (
                                <p className="pt-8 text-center text-[12px] font-mono text-[var(--nl-color-ink-disabled)] italic">No notes match &ldquo;{noteSearch}&rdquo;</p>
                              ) : visible.length > 0 ? (
                                recordingStatus === 'idle' ? (
                                  <div className="pt-5 pb-4 space-y-6">
                                    {(
                                      [
                                        { type: 'action',   label: 'Action Items' },
                                        { type: 'decision', label: 'Decisions'    },
                                        { type: 'insight',  label: 'Insights'     },
                                        { type: 'summary',  label: 'Notes'        },
                                      ] as { type: import('@noteleaf/shared-types').NoteType; label: string }[]
                                    ).map(({ type, label }) => {
                                      const group = visible.filter((n) => n.type === type);
                                      if (group.length === 0) return null;
                                      return (
                                        <section key={type} aria-label={label}>
                                          <div className="flex items-center gap-3 mb-1">
                                            <h3 className="text-[10px] font-mono font-semibold uppercase tracking-[1.5px] text-[var(--nl-color-ink-tertiary)] shrink-0">{label}</h3>
                                            <span className="text-[10px] font-mono text-[var(--nl-color-ink-disabled)] shrink-0">{group.length}</span>
                                            <div className="flex-1 h-px bg-[var(--nl-border-subtle)]" />
                                          </div>
                                          <div>
                                            {group.map((note) => (
                                              <NoteCard key={note.id} note={note} variant="document" onUpdate={handleNoteUpdate} />
                                            ))}
                                          </div>
                                        </section>
                                      );
                                    })}
                                  </div>
                                ) : (
                                  <div className="pt-4 space-y-2">
                                    {visible.map((note) => (
                                      <NoteCard key={note.id} note={note} variant="feed" onUpdate={handleNoteUpdate} />
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

                    {sttWarning && !recordingError && (
                      <div role="status" className="mx-5 mb-2 px-4 py-2.5 rounded-[var(--nl-radius-sm)] bg-amber-50 border border-amber-200 text-[11px] font-mono text-amber-800 shrink-0">
                        {sttWarning}
                      </div>
                    )}

                    {recordingError && (
                      <div role="alert" className="mx-5 mb-2 px-4 py-2.5 rounded-[var(--nl-radius-sm)] bg-[var(--nl-color-danger-subtle)] border border-red-200 text-[11px] font-mono text-[var(--nl-color-danger)] shrink-0">
                        {recordingErrorCopy(recordingError)}
                      </div>
                    )}

                    <footer className="flex items-center gap-4 px-5 py-4 shrink-0 bg-[var(--nl-color-paper-raised)] border-t border-[var(--nl-border-subtle)]">
                      <MicButton status={recordingStatus} onStart={startRecording} onStop={handleStopRecording} />
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-sans text-[var(--nl-color-ink-secondary)] truncate">
                          {recordingStatus === 'idle'
                            ? 'Tap to start — works with any meeting on this device'
                            : recordingStatus === 'connecting'
                            ? 'Connecting…'
                            : recordingStatus === 'recording'
                            ? 'Capturing live — switch to Ask notes anytime'
                            : recordingStatus === 'stopping'
                            ? 'Saving session…'
                            : 'Something went wrong'}
                        </p>
                        <p className="text-[10px] font-mono text-[var(--nl-color-ink-disabled)] mt-0.5">
                          {activeNotes.length > 0
                            ? `${activeNotes.length} note${activeNotes.length !== 1 ? 's' : ''} captured`
                            : 'notes will appear as you speak'}
                          {recordingStatus === 'recording' && autosaveStatus !== 'idle' && (
                            <span className="ml-2">{autosaveCopy(autosaveStatus)}</span>
                          )}
                        </p>
                      </div>
                      <RecordingTimer elapsedSeconds={elapsedSeconds} status={recordingStatus} />
                    </footer>
                  </div>

                  <SessionTranscriptPanel
                    className="hidden lg:flex"
                    segments={activeTranscriptSegments}
                    liveTranscript={liveTranscript}
                    isRecording={isRecording}
                    elapsedSeconds={elapsedSeconds}
                  />
                </>
              )}

              {/* ── Transcript tab ──────────────────────────────────── */}
              {activeTab === 'transcript' && (
                <div className="flex-1 overflow-y-auto px-8 py-6">
                  {activeTranscriptSegments.length === 0 && !activeTranscript ? (
                    <div className="flex flex-col items-center justify-center text-center mt-16 gap-2">
                      <p className="font-serif text-[18px] text-[var(--nl-color-ink-tertiary)]">No transcript yet</p>
                      <p className="text-[12px] font-mono text-[var(--nl-color-ink-disabled)] max-w-sm leading-relaxed">
                        Start recording on the Notes tab. Your verbatim transcript with timestamps will appear here.
                      </p>
                      <button
                        type="button"
                        onClick={() => handleTabSelect('notes')}
                        className="mt-2 text-[12px] font-mono font-medium text-[var(--nl-color-accent-primary)] hover:underline"
                      >
                        Go to Notes →
                      </button>
                    </div>
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

              {/* ── Summary tab ─────────────────────────────────────── */}
              {activeTab === 'summary' && (
                <div className="flex-1 overflow-y-auto px-8 py-6">
                  <div className="max-w-2xl mx-auto space-y-6">
                    {aiState === 'idle' && !hasSessionContent ? (
                      <div className="text-center mt-16 space-y-3">
                        <p className="font-serif text-[18px] text-[var(--nl-color-ink-tertiary)]">No recap yet</p>
                        <p className="text-[12px] font-mono text-[var(--nl-color-ink-disabled)] max-w-sm mx-auto leading-relaxed">
                          Record a session first. When you stop, Noteleaf builds a recap with key takeaways and next steps.
                        </p>
                        <button
                          type="button"
                          onClick={() => handleTabSelect('notes')}
                          className="text-[12px] font-mono font-medium text-[var(--nl-color-accent-primary)] hover:underline"
                        >
                          Go to Notes →
                        </button>
                      </div>
                    ) : aiState === 'idle' && hasSessionContent ? (
                      <>
                        <div className="text-center py-8 space-y-3">
                          <p className="font-serif text-[18px] text-[var(--nl-color-ink-tertiary)]">Recap not generated</p>
                          <p className="text-[12px] font-mono text-[var(--nl-color-ink-disabled)] max-w-sm mx-auto leading-relaxed">
                            Generate a recap from your notes and transcript, or use Export in the header to share.
                          </p>
                          <Button variant="secondary" size="sm" onClick={() => void generateAiNotes()}>
                            Generate recap
                          </Button>
                        </div>
                      </>
                    ) : (
                      <>
                        {hasSessionContent && (
                          <PostMeetingActions
                            compact
                            title={activeItem?.title ?? ''}
                            notes={activeNotes}
                            transcript={activeTranscript}
                            transcriptSegments={activeTranscriptSegments}
                            aiSummary={aiSummary}
                            durationSeconds={displayDuration}
                            onAskNotes={() => handleTabSelect('chat')}
                          />
                        )}
                        <AiSummaryCard
                          state={aiState}
                          summary={aiSummary}
                          isEnhancing={aiEnhancing}
                          onRetry={() => void generateAiNotes()}
                        />
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* ── Chat tab ────────────────────────────────────────── */}
              <div className={cn(
                'flex flex-1 min-h-0 w-full min-w-0 flex-col',
                activeTab !== 'chat' && 'hidden',
              )}>
                <ChatPanel
                  sessionId={activeSessionId}
                  notes={activeNotes}
                  transcriptSegments={activeTranscriptSegments}
                  fullTranscript={activeTranscript}
                  liveTranscript={liveTranscript}
                  isRecording={isRecording}
                  sessionTitle={activeItem?.title ?? ''}
                  initialMessages={chatMessages}
                  onMessagesPersisted={setChatMessages}
                />
              </div>

            </div>
          </>
        )}

        {recordingStatus !== 'idle' && activeTab !== 'notes' && (
          <RecordingDock
            recordingStatus={recordingStatus}
            recordingError={recordingError}
            sttWarning={sttWarning}
            elapsedSeconds={elapsedSeconds}
            noteCount={activeNotes.length}
            onStart={startRecording}
            onStop={handleStopRecording}
            autosaveStatus={autosaveStatus}
          />
        )}

      </div>
    </div>
  );
}

function autosaveCopy(status: AutosaveStatus): string {
  if (status === 'saving') return 'Saving…';
  if (status === 'saved') return 'Saved';
  if (status === 'error') return 'Couldn’t save — will retry';
  return '';
}

function MenuIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
      <line x1="4" y1="7" x2="20" y2="7"/>
      <line x1="4" y1="12" x2="20" y2="12"/>
      <line x1="4" y1="17" x2="20" y2="17"/>
    </svg>
  );
}

function recordingErrorCopy(code: string | null): string {
  if (code === 'permission-denied') return 'Microphone access denied. Allow it in browser settings.';
  if (code === 'not-supported') return 'Speech recognition requires Chrome or Edge.';
  if (code === 'session-create-failed') return 'Couldn’t start a session. Check your connection and try again.';
  return 'Speech recognition error. Please try again.';
}

function RecordingDock({
  recordingStatus,
  recordingError,
  sttWarning,
  elapsedSeconds,
  noteCount,
  onStart,
  onStop,
  autosaveStatus,
}: {
  recordingStatus: RecordingStatus;
  recordingError: string | null;
  sttWarning: string | null;
  elapsedSeconds: number;
  noteCount: number;
  onStart: () => void;
  onStop: () => Promise<void>;
  autosaveStatus: AutosaveStatus;
}) {
  return (
    <div className="shrink-0">
      {sttWarning && !recordingError && (
        <div role="status" className="mx-5 mb-2 px-4 py-2.5 rounded-[var(--nl-radius-sm)] bg-amber-50 border border-amber-200 text-[11px] font-mono text-amber-800">
          {sttWarning}
        </div>
      )}
      {recordingError && (
        <div role="alert" className="mx-5 mb-2 px-4 py-2.5 rounded-[var(--nl-radius-sm)] bg-[var(--nl-color-danger-subtle)] border border-red-200 text-[11px] font-mono text-[var(--nl-color-danger)]">
          {recordingErrorCopy(recordingError)}
        </div>
      )}
      <footer className="flex items-center gap-4 px-5 py-3 bg-[var(--nl-color-paper-raised)] border-t border-[var(--nl-border-subtle)]">
        <MicButton status={recordingStatus} onStart={onStart} onStop={onStop} />
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-sans text-[var(--nl-color-ink-secondary)] truncate">
            {recordingStatus === 'connecting'
              ? 'Connecting…'
              : recordingStatus === 'recording'
              ? 'Still capturing — tap to stop'
              : recordingStatus === 'stopping'
              ? 'Saving session…'
              : 'Something went wrong'}
          </p>
          <p className="text-[10px] font-mono text-[var(--nl-color-ink-disabled)] mt-0.5">
            {noteCount > 0
              ? `${noteCount} note${noteCount !== 1 ? 's' : ''} captured`
              : 'notes will appear as you speak'}
            {recordingStatus === 'recording' && autosaveStatus !== 'idle' && (
              <span className="ml-2">{autosaveCopy(autosaveStatus)}</span>
            )}
          </p>
        </div>
        <RecordingTimer elapsedSeconds={elapsedSeconds} status={recordingStatus} />
      </footer>
    </div>
  );
}
