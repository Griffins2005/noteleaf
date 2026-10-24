import { useState, useCallback, useRef, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useSpeechRecognition } from './useSpeechRecognition';
import { useAudioCapture } from './useAudioCapture';
import { useSTTWebSocket } from './useSTTWebSocket';
import { useNoteClassifier } from '@/features/notes/useNoteClassifier';
import { useSessionStore } from '@/store/session.store';
import { useUserStore } from '@/store/user.store';
import { useAuthStore } from '@/store/auth.store';
import { sessionsApi } from '@/features/sessions/sessions.api';
import { persistRecordingSnapshot } from '@/features/recording/persistRecordingSnapshot';
import { isSameUtterance, joinUtterances, shouldStitchUtterances } from '@/lib/utteranceStitch';
import { PcmTimeline } from '@/lib/pcmTimeline';
import { resolveSpeechLanguage } from '@/lib/speechLanguages';
import type { TranscriptSegment } from '@noteleaf/shared-types';

export type AutosaveStatus = 'idle' | 'saving' | 'saved' | 'error';

// ─── Types ────────────────────────────────────────────────────────────────────

export type RecordingStatus = 'idle' | 'connecting' | 'recording' | 'stopping' | 'error';

export interface UseRecordingStateReturn {
  recordingStatus: RecordingStatus;
  liveTranscript:  string;
  elapsedSeconds:  number;
  /** How far the kept transcript reaches, in seconds on the recording clock. */
  coveredThroughSeconds: number;
  /** 'permission-denied' | 'not-supported' | 'no-microphone' | null */
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
  const [coveredThroughSeconds, setCoveredThroughSeconds] = useState(0);
  const [autosaveStatus, setAutosaveStatus] = useState<AutosaveStatus>('idle');
  const timerRef   = useRef<ReturnType<typeof setInterval> | null>(null);
  const elapsedRef = useRef(0);
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const persistInFlightRef = useRef(false);
  const persistQueuedRef = useRef(false);
  const recordingSessionIdRef = useRef<string | null>(null);
  const isRecordingRef = useRef(false);
  const stitchRef = useRef<{
    text: string;
    startOffsetSeconds: number;
    endOffsetSeconds: number;
    confidence: number;
    sessionId: string;
  } | null>(null);
  const stitchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const modeRef = useRef<'stream' | 'browser' | null>(null);
  const readyRef = useRef(false);
  const hadReadyRef = useRef(false);
  const timelineRef = useRef(new PcmTimeline());
  const lastFinalTextRef = useRef('');
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptRef = useRef(0);
  const streamFailedRef = useRef(false);
  const streamConfigRef = useRef({ sessionId: '', userUuid: '', languageCode: 'en-US' });
  const showLiveRef = useRef(true);

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
  showLiveRef.current = preferences.showLiveTranscript;

  // ── Note classifier ────────────────────────────────────────────────────

  const { processTranscriptSegment } = useNoteClassifier({
    sessionId:      activeSessionId ?? '',
    enableTagging:  preferences.autoTagKeywords,
    enableClassify: preferences.autoClassify,
    onNoteCreated:  (note) => appendNote(note),
  });

  const commitStitchedUtterance = useCallback(() => {
    if (stitchTimerRef.current) {
      clearTimeout(stitchTimerRef.current);
      stitchTimerRef.current = null;
    }
    const pending = stitchRef.current;
    stitchRef.current = null;
    const trimmed = pending?.text.trim();
    if (!pending || !trimmed) return;

    appendTranscript(trimmed);
    setCoveredThroughSeconds((prev) => Math.max(prev, pending.endOffsetSeconds));
    if (pending.sessionId) {
      const segment: TranscriptSegment = {
        id: uuidv4(),
        sessionId: pending.sessionId,
        text: trimmed,
        capturedAt: new Date().toISOString(),
        startOffsetSeconds: pending.startOffsetSeconds,
        endOffsetSeconds: pending.endOffsetSeconds,
        confidence: pending.confidence,
      };
      appendTranscriptSegment(segment);
    }
    processTranscriptSegment(
      trimmed,
      pending.endOffsetSeconds,
      pending.confidence,
      pending.sessionId || undefined,
    );
  }, [appendTranscript, appendTranscriptSegment, processTranscriptSegment]);

  // ── Speech recognition ─────────────────────────────────────────────────

  const { isSupported, start: startSTT, stop: stopSTT } = useSpeechRecognition({
    onPartialTranscript: (text) => {
      if (modeRef.current !== 'browser') return;
      if (showLiveRef.current) setLiveTranscript(text);
    },

    onFinalTranscript: (text, startOffsetSeconds, endOffsetSeconds, confidence) => {
      if (modeRef.current !== 'browser') return;
      const trimmed = text.trim();
      if (!trimmed) {
        setLiveTranscript('');
        return;
      }

      setLiveTranscript('');
      const activeId = useSessionStore.getState().activeSessionId ?? recordingSessionIdRef.current ?? '';
      const incoming = {
        text: trimmed,
        startOffsetSeconds,
        endOffsetSeconds,
        confidence: confidence > 0 ? confidence : 1,
        sessionId: activeId,
      };

      const pending = stitchRef.current;
      if (pending && isSameUtterance(pending.text, trimmed)) {
        stitchRef.current = {
          ...pending,
          text: trimmed.length > pending.text.length ? trimmed : pending.text,
          endOffsetSeconds,
          confidence: Math.max(pending.confidence, incoming.confidence),
        };
      } else if (
        pending &&
        shouldStitchUtterances(
          pending.endOffsetSeconds,
          startOffsetSeconds,
          pending.text,
          trimmed,
        )
      ) {
        stitchRef.current = {
          ...pending,
          text: joinUtterances(pending.text, trimmed),
          endOffsetSeconds,
          confidence: Math.max(pending.confidence, incoming.confidence),
        };
      } else {
        commitStitchedUtterance();
        stitchRef.current = incoming;
      }

      if (stitchTimerRef.current) clearTimeout(stitchTimerRef.current);
      stitchTimerRef.current = setTimeout(() => {
        commitStitchedUtterance();
      }, 2200);
    },

    onError: (code, message) => {
      if (modeRef.current !== 'browser') return;
      console.error(`[STT] ${code}: ${message}`);
      setSttWarning(null);
      setError(code === 'permission-denied' ? 'permission-denied' : 'unknown');
      setRecordingStatus('error');
      stopTimer();
    },

    onRecoverableError: (code) => {
      if (modeRef.current !== 'browser') return;
      console.warn(`[STT] Recoverable error (${code}) — restarting transcription`);
      setSttWarning('Transcription reconnecting… keep speaking.');
      setTimeout(() => setSttWarning(null), 5000);
    },
  });

  const startSessionRef = useRef<(options: {
    sessionId: string;
    userUuid: string;
    languageCode: string;
    audioOffsetMs: number;
  }) => void>(() => {});
  const sendAudioRef = useRef<(chunk: string) => boolean>(() => false);
  const stopSessionRef = useRef<() => Promise<void>>(async () => {});
  const startBrowserSttRef = useRef(startSTT);
  const stopBrowserSttRef = useRef(stopSTT);
  const speechSupportedRef = useRef(isSupported);
  startBrowserSttRef.current = startSTT;
  stopBrowserSttRef.current = stopSTT;
  speechSupportedRef.current = isSupported;

  const clearStreamTimers = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (fallbackTimerRef.current) {
      clearTimeout(fallbackTimerRef.current);
      fallbackTimerRef.current = null;
    }
  }, []);

  const flushUnsent = useCallback(() => {
    if (!readyRef.current || modeRef.current !== 'stream') return;
    for (const piece of timelineRef.current.unsentPieces()) {
      if (!sendAudioRef.current(piece.pcmBase64)) return;
      timelineRef.current.markSent(piece.endMs);
    }
  }, []);

  const { startCapture, stopCapture, resumeCapture } = useAudioCapture({
    onAudioChunk: (base64, byteLength) => {
      if (modeRef.current !== 'stream') return;
      timelineRef.current.push(base64, byteLength);
      flushUnsent();
    },
  });

  const commitStreamFinal = useCallback((
    text: string,
    startOffsetSeconds: number,
    endOffsetSeconds: number,
    confidence: number,
  ) => {
    const trimmed = text.trim();
    if (!trimmed) {
      setLiveTranscript('');
      return;
    }
    if (lastFinalTextRef.current.trim().toLowerCase() === trimmed.toLowerCase()) {
      setLiveTranscript('');
      timelineRef.current.markFinalized(endOffsetSeconds * 1000);
      return;
    }
    lastFinalTextRef.current = trimmed;
    setLiveTranscript('');
    setCoveredThroughSeconds((prev) => Math.max(prev, endOffsetSeconds));
    timelineRef.current.markFinalized(endOffsetSeconds * 1000);

    const sessionId = useSessionStore.getState().activeSessionId ?? recordingSessionIdRef.current ?? '';
    appendTranscript(trimmed);
    if (sessionId) {
      appendTranscriptSegment({
        id: uuidv4(),
        sessionId,
        text: trimmed,
        capturedAt: new Date().toISOString(),
        startOffsetSeconds,
        endOffsetSeconds,
        confidence: confidence > 0 ? confidence : 1,
      });
    }
    processTranscriptSegment(trimmed, endOffsetSeconds, confidence, sessionId || undefined);
  }, [appendTranscript, appendTranscriptSegment, processTranscriptSegment]);

  const fallbackToBrowser = useCallback(() => {
    if (modeRef.current !== 'stream') return;
    modeRef.current = 'browser';
    readyRef.current = false;
    clearStreamTimers();
    void stopSessionRef.current();
    stopCapture();
    if (!speechSupportedRef.current) {
      setSttWarning(null);
      setError('not-supported');
      setRecordingStatus('error');
      stopTimer();
      return;
    }
    setSttWarning('Speech service unavailable. Using the browser recognizer, so timestamps are approximate.');
    startBrowserSttRef.current();
  }, [clearStreamTimers, stopCapture]);

  const scheduleReconnect = useCallback(() => {
    if (reconnectTimerRef.current || modeRef.current !== 'stream' || !isRecordingRef.current) return;
    const attempt = reconnectAttemptRef.current;
    reconnectAttemptRef.current += 1;
    const delay = Math.min(3000, Math.round(400 * 1.5 ** attempt));
    setSttWarning('Transcription reconnecting… keep speaking.');
    timelineRef.current.rewindSentToFinalized();
    reconnectTimerRef.current = setTimeout(() => {
      reconnectTimerRef.current = null;
      if (modeRef.current !== 'stream' || !isRecordingRef.current) return;
      const cfg = streamConfigRef.current;
      startSessionRef.current({
        sessionId: cfg.sessionId,
        userUuid: cfg.userUuid,
        languageCode: cfg.languageCode,
        audioOffsetMs: timelineRef.current.finalizedThroughMs,
      });
    }, delay);
  }, []);

  const { startSession, sendAudio, stopSession } = useSTTWebSocket({
    onPartialTranscript: (text) => {
      if (modeRef.current !== 'stream') return;
      if (showLiveRef.current) setLiveTranscript(text);
    },
    onFinalTranscript: (text, startOffsetSeconds, endOffsetSeconds, confidence) => {
      if (modeRef.current !== 'stream') return;
      commitStreamFinal(text, startOffsetSeconds, endOffsetSeconds, confidence);
    },
    onSessionReady: () => {
      if (modeRef.current !== 'stream') return;
      readyRef.current = true;
      hadReadyRef.current = true;
      reconnectAttemptRef.current = 0;
      clearStreamTimers();
      setSttWarning(null);
      flushUnsent();
    },
    onUnexpectedClose: () => {
      if (modeRef.current !== 'stream') return;
      readyRef.current = false;
      if (!isRecordingRef.current) {
        if (!hadReadyRef.current) streamFailedRef.current = true;
        return;
      }
      if (!hadReadyRef.current) {
        fallbackToBrowser();
        return;
      }
      scheduleReconnect();
    },
    onError: (code, message) => {
      if (modeRef.current !== 'stream') return;
      console.warn(`[STT] ${code}: ${message}`);
      if (!hadReadyRef.current) {
        streamFailedRef.current = true;
        if (isRecordingRef.current) fallbackToBrowser();
        return;
      }
      readyRef.current = false;
      scheduleReconnect();
    },
  });
  startSessionRef.current = startSession;
  sendAudioRef.current = sendAudio;
  stopSessionRef.current = stopSession;

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
      if (document.visibilityState === 'hidden') {
        saveOnLeave();
        if (modeRef.current === 'stream') {
          setSttWarning('Keep this tab open. The microphone pauses in the background, and those minutes are not transcribed.');
        }
      } else {
        void resumeCapture();
        if (modeRef.current === 'stream' && readyRef.current) setSttWarning(null);
      }
    };

    window.addEventListener('pagehide', saveOnLeave);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      unsub();
      clearInterval(heartbeat);
      window.removeEventListener('pagehide', saveOnLeave);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [recordingStatus, flushPersist, schedulePersist, readSnapshot, resumeCapture]);

  // ── Start recording ────────────────────────────────────────────────────

  const startRecording = useCallback(async (): Promise<void> => {
    if (recordingStatus !== 'idle' && recordingStatus !== 'error') return;

    const micSupported = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
    if (!micSupported && !isSupported) {
      setError('not-supported');
      setRecordingStatus('error');
      return;
    }

    setError(null);
    setSttWarning(null);
    setCoveredThroughSeconds(0);
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
    modeRef.current = 'stream';
    readyRef.current = false;
    hadReadyRef.current = false;
    reconnectAttemptRef.current = 0;
    streamFailedRef.current = false;
    lastFinalTextRef.current = '';
    timelineRef.current.reset();
    clearStreamTimers();
    streamConfigRef.current = {
      sessionId,
      userUuid: userId,
      languageCode: resolveSpeechLanguage(),
    };
    startSession({ ...streamConfigRef.current, audioOffsetMs: 0 });

    const captureError = await startCapture();
    if (captureError) {
      modeRef.current = null;
      isRecordingRef.current = false;
      clearStreamTimers();
      void stopSession();
      setError(captureError === 'not-supported' ? 'not-supported' : captureError);
      setRecordingStatus('error');
      return;
    }

    isRecordingRef.current = true;
    setRecordingStatus('recording');
    startTimer();
    if (streamFailedRef.current) {
      fallbackToBrowser();
    } else if (!hadReadyRef.current) {
      fallbackTimerRef.current = setTimeout(() => {
        fallbackTimerRef.current = null;
        if (modeRef.current === 'stream' && !hadReadyRef.current) fallbackToBrowser();
      }, 8000);
    }
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
    recordingStatus,
    userId,
    startSession,
    startCapture,
    stopSession,
    clearStreamTimers,
    fallbackToBrowser,
  ]);

  // ── Stop recording ─────────────────────────────────────────────────────

  const stopRecording = useCallback(async (): Promise<void> => {
    if (recordingStatus !== 'recording') return;

    setRecordingStatus('stopping');
    setLiveTranscript('');
    isRecordingRef.current = false;
    stopTimer();
    clearStreamTimers();

    if (modeRef.current === 'browser') {
      await stopSTT();
      commitStitchedUtterance();
    } else {
      stopCapture();
      flushUnsent();
      await stopSession();
      timelineRef.current.reset();
    }
    modeRef.current = null;
    readyRef.current = false;

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
  }, [recordingStatus, stopSTT, commitStitchedUtterance, clearStreamTimers, stopCapture, flushUnsent, stopSession]);

  return {
    recordingStatus,
    liveTranscript,
    elapsedSeconds,
    coveredThroughSeconds,
    error,
    sttWarning,
    startRecording,
    stopRecording,
    autosaveStatus,
  };
}
