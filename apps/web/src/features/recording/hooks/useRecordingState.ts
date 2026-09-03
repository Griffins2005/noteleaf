import { useState, useCallback, useRef, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useSpeechRecognition } from './useSpeechRecognition';
import { resolveSpeechLanguage } from '@/lib/speechLanguages';
import { useNoteClassifier } from '@/features/notes/useNoteClassifier';
import { useSessionStore } from '@/store/session.store';
import { useUserStore } from '@/store/user.store';
import { useAuthStore } from '@/store/auth.store';
import { sessionsApi } from '@/features/sessions/sessions.api';
import { persistRecordingSnapshot } from '@/features/recording/persistRecordingSnapshot';
import type { TranscriptSegment } from '@noteleaf/shared-types';

export type AutosaveStatus = 'idle' | 'saving' | 'saved' | 'error';

// ─── Types ────────────────────────────────────────────────────────────────────

export type RecordingStatus = 'idle' | 'connecting' | 'recording' | 'stopping' | 'error';

export interface UseRecordingStateReturn {
  recordingStatus: RecordingStatus;
  liveTranscript:  string;
  elapsedSeconds:  number;
  /** 'permission-denied' | 'not-supported' | null */
  error: string | null;
  /** Brief warning when STT reconnects after a network hiccup. */
  sttWarning: string | null;
  startRecording: () => Promise<void>;
  stopRecording:  () => Promise<void>;
  /** Mid-session persist to the server — notes/transcript save as you talk. */
  autosaveStatus: AutosaveStatus;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useRecordingState(): UseRecordingStateReturn {
  const [recordingStatus, setRecordingStatus] = useState<RecordingStatus>('idle');
  const [liveTranscript, setLiveTranscript]   = useState('');
  const [error, setError]                     = useState<string | null>(null);
  const [sttWarning, setSttWarning]           = useState<string | null>(null);

  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [autosaveStatus, setAutosaveStatus] = useState<AutosaveStatus>('idle');
  const timerRef   = useRef<ReturnType<typeof setInterval> | null>(null);
  const elapsedRef = useRef(0);
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const persistInFlightRef = useRef(false);
  const persistQueuedRef = useRef(false);
  const recordingSessionIdRef = useRef<string | null>(null);
  const isRecordingRef = useRef(false);

  // ── Stores ─────────────────────────────────────────────────────────────

  const {
    activeSessionId,
    createSession,
    removeSession,
    appendNote,
    appendTranscript,
    appendTranscriptSegment,
  } = useSessionStore();

  const { preferences } = useUserStore();
  const userId = useAuthStore((s) => s.user?.id ?? '');

  // ── Note classifier ────────────────────────────────────────────────────

  const { processTranscriptSegment } = useNoteClassifier({
    sessionId:      activeSessionId ?? '',
    enableTagging:  preferences.autoTagKeywords,
    enableClassify: preferences.autoClassify,
    onNoteCreated:  (note) => appendNote(note),
  });

  // ── Speech recognition ─────────────────────────────────────────────────

  const { isSupported, start: startSTT, stop: stopSTT } = useSpeechRecognition({
    onPartialTranscript: (text) => {
      if (preferences.showLiveTranscript) setLiveTranscript(text);
    },

    onFinalTranscript: (text, startOffsetSeconds, endOffsetSeconds, confidence) => {
      const trimmed = text.trim();
      if (!trimmed) {
        setLiveTranscript('');
        return;
      }

      setLiveTranscript('');
      appendTranscript(trimmed);

      const activeId = useSessionStore.getState().activeSessionId;
      if (activeId) {
        const segment: TranscriptSegment = {
          id: uuidv4(),
          sessionId: activeId,
          text: trimmed,
          capturedAt: new Date().toISOString(),
          startOffsetSeconds,
          endOffsetSeconds,
          confidence,
        };
        appendTranscriptSegment(segment);
      }

      processTranscriptSegment(trimmed, endOffsetSeconds, confidence, activeId ?? undefined);
    },

    onError: (code, message) => {
      console.error(`[STT] ${code}: ${message}`);
      setSttWarning(null);
      setError(code === 'permission-denied' ? 'permission-denied' : 'unknown');
      setRecordingStatus('error');
      stopTimer();
    },

    onRecoverableError: (code) => {
      console.warn(`[STT] Recoverable error (${code}) — restarting transcription`);
      setSttWarning('Transcription reconnecting… keep speaking.');
      setTimeout(() => setSttWarning(null), 5000);
    },
  });

  // ── Timer ──────────────────────────────────────────────────────────────

  function startTimer() {
    elapsedRef.current = 0;
    setElapsedSeconds(0);
    timerRef.current = setInterval(() => {
      elapsedRef.current += 1;
      setElapsedSeconds(elapsedRef.current);
    }, 1000);
  }

  function stopTimer() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  useEffect(() => () => stopTimer(), []);

  const readSnapshot = useCallback((status: 'recording' | 'stopped') => {
    const {
      activeSessionId: sessionId,
      activeNotes,
      activeTranscript,
      activeTranscriptSegments,
    } = useSessionStore.getState();
    const id = recordingSessionIdRef.current ?? sessionId;
    if (!id) return null;
    return {
      sessionId: id,
      notes: activeNotes,
      transcript: activeTranscript,
      transcriptSegments: activeTranscriptSegments,
      durationSeconds: elapsedRef.current,
      status,
    };
  }, []);

  const flushPersist = useCallback(async (status: 'recording' | 'stopped' = 'recording') => {
    if (persistTimerRef.current) {
      clearTimeout(persistTimerRef.current);
      persistTimerRef.current = null;
    }

    if (status === 'recording' && !isRecordingRef.current) return;

    const snapshot = readSnapshot(status);
    if (!snapshot) return;

    if (persistInFlightRef.current) {
      persistQueuedRef.current = status === 'recording' && isRecordingRef.current;
      return;
    }

    persistInFlightRef.current = true;
    setAutosaveStatus('saving');
    try {
      await persistRecordingSnapshot(snapshot);
      setAutosaveStatus('saved');
    } catch (err) {
      console.error('[Session] Autosave failed:', err);
      setAutosaveStatus('error');
    } finally {
      persistInFlightRef.current = false;
      if (persistQueuedRef.current) {
        persistQueuedRef.current = false;
        void flushPersist(status);
      }
    }
  }, [readSnapshot]);

  const schedulePersist = useCallback(() => {
    if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    persistTimerRef.current = setTimeout(() => {
      void flushPersist('recording');
    }, 4000);
  }, [flushPersist]);

  useEffect(() => {
    if (recordingStatus !== 'recording') {
      isRecordingRef.current = false;
      return;
    }

    isRecordingRef.current = true;

    const unsub = useSessionStore.subscribe((state, prev) => {
      if (
        state.activeNotes !== prev.activeNotes ||
        state.activeTranscript !== prev.activeTranscript ||
        state.activeTranscriptSegments !== prev.activeTranscriptSegments
      ) {
        schedulePersist();
      }
    });

    const heartbeat = setInterval(() => {
      void flushPersist('recording');
    }, 15_000);

    const saveOnLeave = () => {
      if (!isRecordingRef.current) return;
      const snapshot = readSnapshot('recording');
      if (!snapshot) return;
      void persistRecordingSnapshot(snapshot, { keepalive: true });
    };

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') saveOnLeave();
    };

    window.addEventListener('pagehide', saveOnLeave);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      unsub();
      clearInterval(heartbeat);
      window.removeEventListener('pagehide', saveOnLeave);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [recordingStatus, flushPersist, schedulePersist, readSnapshot]);

  // ── Start recording ────────────────────────────────────────────────────

  const startRecording = useCallback(async (): Promise<void> => {
    if (recordingStatus !== 'idle' && recordingStatus !== 'error') return;

    if (!isSupported) {
      setError('not-supported');
      setRecordingStatus('error');
      return;
    }

    setError(null);
    setSttWarning(null);
    setRecordingStatus('connecting');

    let sessionId = activeSessionId;
    if (!sessionId) {
      sessionId = createSession(userId);
      try {
        await sessionsApi.create({ id: sessionId, title: '' });
      } catch (err) {
        console.error('[Session] Failed to create session before recording:', err);
        removeSession(sessionId);
        setError('session-create-failed');
        setRecordingStatus('error');
        return;
      }
    }

    recordingSessionIdRef.current = sessionId;
    startSTT(preferences.speechLanguage || resolveSpeechLanguage());
    setRecordingStatus('recording');
    startTimer();
    setAutosaveStatus('idle');
    void persistRecordingSnapshot({
      sessionId,
      notes: useSessionStore.getState().activeNotes,
      transcript: useSessionStore.getState().activeTranscript,
      transcriptSegments: useSessionStore.getState().activeTranscriptSegments,
      durationSeconds: 0,
      status: 'recording',
    }).catch((err) => {
      console.error('[Session] Failed to mark session recording:', err);
    });
  }, [
    activeSessionId,
    createSession,
    removeSession,
    isSupported,
    preferences.speechLanguage,
    recordingStatus,
    startSTT,
    userId,
  ]);

  // ── Stop recording ─────────────────────────────────────────────────────

  const stopRecording = useCallback(async (): Promise<void> => {
    if (recordingStatus !== 'recording') return;

    setRecordingStatus('stopping');
    setLiveTranscript('');
    isRecordingRef.current = false;
    stopTimer();

    await stopSTT();

    persistQueuedRef.current = false;
    if (persistTimerRef.current) {
      clearTimeout(persistTimerRef.current);
      persistTimerRef.current = null;
    }

    const waitUntil = Date.now() + 3000;
    while (persistInFlightRef.current && Date.now() < waitUntil) {
      await new Promise((resolve) => setTimeout(resolve, 40));
    }

    const {
      activeSessionId: stoppedSessionId,
      activeNotes: stoppedNotes,
      activeTranscript: stoppedTranscript,
      activeTranscriptSegments: stoppedTranscriptSegments,
      sessions: stoppedSessions,
    } = useSessionStore.getState();

    const sessionId = recordingSessionIdRef.current ?? stoppedSessionId;
    if (sessionId) {
      const stoppedTitle = stoppedSessions.find((s) => s.id === sessionId)?.title ?? '';
      try {
        await persistRecordingSnapshot({
          sessionId,
          notes: stoppedNotes,
          transcript: stoppedTranscript,
          transcriptSegments: stoppedTranscriptSegments,
          durationSeconds: elapsedRef.current,
          status: 'stopped',
        });
        if (stoppedTitle) {
          await sessionsApi.update(sessionId, { title: stoppedTitle }).catch(() => { /* title is non-fatal */ });
        }
        setAutosaveStatus('saved');
      } catch (err) {
        console.error('[Session] Failed to persist session to API:', err);
        setAutosaveStatus('error');
      }
    }

    recordingSessionIdRef.current = null;
    setRecordingStatus('idle');
  }, [recordingStatus, stopSTT]);

  return {
    recordingStatus,
    liveTranscript,
    elapsedSeconds,
    error,
    sttWarning,
    startRecording,
    stopRecording,
    autosaveStatus,
  };
}
