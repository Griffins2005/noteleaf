/**
 * @file useRecordingState.ts
 * @description Central orchestrator hook for the recording feature.
 *
 * Pipeline:
 *   useSpeechRecognition (browser Web Speech API → partial + final transcripts)
 *       ↓
 *   useNoteClassifier (final transcripts → classified Note objects)
 *       ↓
 *   useSessionStore (notes appended to active session state → UI re-renders)
 *
 * The Web Speech API replaced the previous NVIDIA NIM + AudioWorklet chain.
 * It works out-of-the-box in Chrome, Edge, and Safari with no server config.
 * The note classifier, session store, cloud save, and local file export are
 * unchanged — swapping the STT source had no effect on the rest of the pipeline.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useSpeechRecognition } from './useSpeechRecognition';
import { useNoteClassifier } from '@/features/notes/useNoteClassifier';
import { useSessionStore } from '@/store/session.store';
import { useUserStore } from '@/store/user.store';
import { sessionsApi } from '@/features/sessions/sessions.api';
import type { TranscriptSegment } from '@noteleaf/shared-types';

// ─── Types ────────────────────────────────────────────────────────────────────

export type RecordingStatus = 'idle' | 'connecting' | 'recording' | 'stopping' | 'error';

export interface UseRecordingStateReturn {
  recordingStatus: RecordingStatus;
  liveTranscript:  string;
  elapsedSeconds:  number;
  /** 'permission-denied' | 'not-supported' | null */
  error: string | null;
  startRecording: () => Promise<void>;
  stopRecording:  () => Promise<void>;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useRecordingState(): UseRecordingStateReturn {
  const [recordingStatus, setRecordingStatus] = useState<RecordingStatus>('idle');
  const [liveTranscript, setLiveTranscript]   = useState('');
  const [error, setError]                     = useState<string | null>(null);

  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const timerRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const elapsedRef  = useRef(0);

  // ── Stores ─────────────────────────────────────────────────────────────

  const {
    activeSessionId,
    createSession,
    appendNote,
    appendTranscript,
    appendTranscriptSegment,
  } = useSessionStore();

  const { uuid, storageMode, preferences } = useUserStore();

  // ── Note classifier ────────────────────────────────────────────────────

  const { processTranscriptSegment } = useNoteClassifier({
    sessionId:     activeSessionId ?? '',
    enableTagging: preferences.autoTagKeywords,
    onNoteCreated: (note) => appendNote(note),
  });

  // ── Speech recognition ─────────────────────────────────────────────────

  const { isSupported, start: startSTT, stop: stopSTT } = useSpeechRecognition({
    onPartialTranscript: (text) => {
      if (preferences.showLiveTranscript) setLiveTranscript(text);
    },

    onFinalTranscript: (text, startOffsetSeconds, endOffsetSeconds, confidence) => {
      setLiveTranscript('');
      appendTranscript(text);

      const activeId = useSessionStore.getState().activeSessionId;
      if (activeId) {
        const segment: TranscriptSegment = {
          id: uuidv4(),
          sessionId: activeId,
          text,
          capturedAt: new Date().toISOString(),
          startOffsetSeconds,
          endOffsetSeconds,
          confidence,
        };
        appendTranscriptSegment(segment);
      }

      processTranscriptSegment(text, endOffsetSeconds, confidence, activeId ?? undefined);
    },

    onError: (code, message) => {
      console.error(`[STT] ${code}: ${message}`);
      setError(code === 'permission-denied' ? 'permission-denied' : 'unknown');
      setRecordingStatus('error');
      stopTimer();
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

  // ── Start recording ────────────────────────────────────────────────────

  const startRecording = useCallback(async (): Promise<void> => {
    if (recordingStatus !== 'idle') return;

    if (!isSupported) {
      setError('not-supported');
      setRecordingStatus('error');
      return;
    }

    setError(null);
    setRecordingStatus('connecting');

    let sessionId = activeSessionId;
    if (!sessionId) {
      sessionId = createSession(uuid);
      if (storageMode === 'cloud') {
        try {
          await sessionsApi.create({ id: sessionId, title: '' });
        } catch (err) {
          console.error('[Session] Failed to create session before recording:', err);
          setRecordingStatus('error');
          return;
        }
      }
    }

    // SpeechRecognition requests mic permission automatically on start().
    // If denied it fires onerror('not-allowed') which sets recordingStatus='error'.
    startSTT(preferences.speechLanguage);

    setRecordingStatus('recording');
    startTimer();
  }, [
    activeSessionId,
    createSession,
    isSupported,
    recordingStatus,
    startSTT,
    storageMode,
    uuid,
    preferences.speechLanguage,
  ]);

  // ── Stop recording ─────────────────────────────────────────────────────

  const stopRecording = useCallback(async (): Promise<void> => {
    if (recordingStatus !== 'recording') return;

    setRecordingStatus('stopping');
    setLiveTranscript('');
    stopTimer();

    // stop() resolves after the final onend fires, so all pending final
    // transcripts are already in the Zustand store when we read below.
    await stopSTT();

    const {
      activeSessionId: stoppedSessionId,
      activeNotes: stoppedNotes,
      activeTranscript: stoppedTranscript,
      activeTranscriptSegments: stoppedTranscriptSegments,
      sessions: stoppedSessions,
    } = useSessionStore.getState();

    // Cloud save — local file export (with AI summary) is handled by NotepadShell
    // after generateAiNotes() resolves so the summary is included in the file.
    if (storageMode === 'cloud' && stoppedSessionId) {
      const stoppedTitle = stoppedSessions.find((s) => s.id === stoppedSessionId)?.title ?? '';
      try {
        await sessionsApi.update(stoppedSessionId, {
          title: stoppedTitle,
          notes: stoppedNotes,
          transcript: stoppedTranscript,
          transcriptSegments: stoppedTranscriptSegments,
          durationSeconds: elapsedRef.current,
          status: 'stopped',
        });
      } catch (err) {
        console.error('[Session] Failed to persist session to API:', err);
      }
    }

    setRecordingStatus('idle');
  }, [recordingStatus, stopSTT, storageMode]);

  return { recordingStatus, liveTranscript, elapsedSeconds, error, startRecording, stopRecording };
}
