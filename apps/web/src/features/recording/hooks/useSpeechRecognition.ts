/**
 * @file useSpeechRecognition.ts
 * @description Thin wrapper around the browser's Web Speech API.
 *
 * Long sessions: Chrome's backend often throws `network` after a few minutes.
 * We recover automatically (restart on end) and proactively rotate the recognition
 * instance every ~90s so sessions can run for an hour+.
 */

import { useRef, useCallback } from 'react';

// ─── Web Speech API type declarations ────────────────────────────────────────

interface ISpeechRecognitionAlternative {
  readonly transcript: string;
  readonly confidence: number;
}

interface ISpeechRecognitionResult {
  readonly isFinal: boolean;
  readonly length: number;
  item(index: number): ISpeechRecognitionAlternative;
  [index: number]: ISpeechRecognitionAlternative;
}

interface ISpeechRecognitionResultList {
  readonly length: number;
  item(index: number): ISpeechRecognitionResult;
  [index: number]: ISpeechRecognitionResult;
}

interface ISpeechRecognitionEvent extends Event {
  readonly resultIndex: number;
  readonly results: ISpeechRecognitionResultList;
}

interface ISpeechRecognitionErrorEvent extends Event {
  readonly error: string;
}

interface ISpeechRecognition extends EventTarget {
  continuous:      boolean;
  interimResults:  boolean;
  lang:            string;
  maxAlternatives: number;
  onresult: ((event: ISpeechRecognitionEvent) => void) | null;
  onerror:  ((event: ISpeechRecognitionErrorEvent) => void) | null;
  onend:    (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

interface ISpeechRecognitionConstructor {
  new(): ISpeechRecognition;
}

declare global {
  interface Window {
    SpeechRecognition?:       ISpeechRecognitionConstructor;
    webkitSpeechRecognition?: ISpeechRecognitionConstructor;
  }
}

/** Errors that should restart recognition, not end the session. */
const RECOVERABLE_ERRORS = new Set([
  'network',
  'service-not-available',
  'audio-capture',
  'aborted',
]);

/** Proactively restart before Chrome's ~4–5 min network timeout. */
const PROACTIVE_RESTART_MS = 90_000;

// ─── Hook ─────────────────────────────────────────────────────────────────────

export interface UseSpeechRecognitionOptions {
  onPartialTranscript: (text: string) => void;
  onFinalTranscript: (
    text: string,
    startOffsetSeconds: number,
    endOffsetSeconds: number,
    confidence: number,
  ) => void;
  /** Fatal — stops recording. */
  onError: (code: string, message: string) => void;
  /** Transient — session continues, UI may show a brief warning. */
  onRecoverableError?: (code: string) => void;
}

export interface UseSpeechRecognitionReturn {
  isSupported: boolean;
  start: (lang: string) => void;
  stop: () => Promise<void>;
}

export function useSpeechRecognition(
  options: UseSpeechRecognitionOptions,
): UseSpeechRecognitionReturn {
  const recognitionRef       = useRef<ISpeechRecognition | null>(null);
  const sessionStartRef      = useRef<number>(0);
  const activeRef            = useRef(false);
  const stopResolveRef       = useRef<(() => void) | null>(null);
  const langRef              = useRef('en-US');
  const proactiveRestartRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const restartBackoffRef    = useRef(80);

  const onPartialRef     = useRef(options.onPartialTranscript);
  const onFinalRef       = useRef(options.onFinalTranscript);
  const onErrorRef       = useRef(options.onError);
  const onRecoverableRef = useRef(options.onRecoverableError);
  onPartialRef.current     = options.onPartialTranscript;
  onFinalRef.current       = options.onFinalTranscript;
  onErrorRef.current       = options.onError;
  onRecoverableRef.current = options.onRecoverableError;

  const getAPI = (): ISpeechRecognitionConstructor | null => {
    if (typeof window === 'undefined') return null;
    return window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null;
  };

  const isSupported = !!getAPI();

  const clearProactiveRestart = () => {
    if (proactiveRestartRef.current) {
      clearInterval(proactiveRestartRef.current);
      proactiveRestartRef.current = null;
    }
  };

  const scheduleProactiveRestart = useCallback(() => {
    clearProactiveRestart();
    proactiveRestartRef.current = setInterval(() => {
      if (!activeRef.current || !recognitionRef.current) return;
      try {
        recognitionRef.current.stop();
      } catch {
        /* onend restarts */
      }
    }, PROACTIVE_RESTART_MS);
  }, []);

  const createAndStart = useCallback(() => {
    const API = getAPI();
    if (!activeRef.current || !API) return;

    const recognition = new API();
    recognitionRef.current = recognition;

    recognition.continuous      = true;
    recognition.interimResults  = true;
    recognition.lang            = langRef.current;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event: ISpeechRecognitionEvent) => {
      restartBackoffRef.current = 80;
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (!result) continue;
        const alt = result[0];
        if (!alt) continue;

        if (result.isFinal) {
          const endOffset   = (Date.now() - sessionStartRef.current) / 1000;
          const startOffset = Math.max(0, endOffset - 3);
          onFinalRef.current(alt.transcript, startOffset, endOffset, alt.confidence || 1.0);
        } else {
          onPartialRef.current(alt.transcript);
        }
      }
    };

    recognition.onerror = (event: ISpeechRecognitionErrorEvent) => {
      if (event.error === 'no-speech') return;

      if (event.error === 'not-allowed') {
        activeRef.current = false;
        clearProactiveRestart();
        onErrorRef.current('permission-denied', 'Microphone access denied.');
        return;
      }

      if (RECOVERABLE_ERRORS.has(event.error)) {
        onRecoverableRef.current?.(event.error);
        try { recognition.stop(); } catch { /* onend will restart */ }
        return;
      }

      activeRef.current = false;
      clearProactiveRestart();
      onErrorRef.current('STT_ERROR', `Speech recognition error: ${event.error}`);
    };

    recognition.onend = () => {
      if (activeRef.current) {
        const delay = restartBackoffRef.current;
        restartBackoffRef.current = Math.min(delay * 1.5, 3000);
        setTimeout(createAndStart, delay);
      } else {
        stopResolveRef.current?.();
        stopResolveRef.current = null;
      }
    };

    try {
      recognition.start();
    } catch {
      if (activeRef.current) {
        setTimeout(createAndStart, restartBackoffRef.current);
      }
    }
  }, []);

  const start = useCallback(
    (lang: string) => {
      langRef.current         = lang;
      activeRef.current       = true;
      restartBackoffRef.current = 80;
      sessionStartRef.current = Date.now();
      createAndStart();
      scheduleProactiveRestart();
    },
    [createAndStart, scheduleProactiveRestart],
  );

  const stop = useCallback((): Promise<void> => {
    activeRef.current = false;
    clearProactiveRestart();
    return new Promise<void>((resolve) => {
      if (!recognitionRef.current) { resolve(); return; }
      stopResolveRef.current = resolve;
      try { recognitionRef.current.stop(); } catch { resolve(); }
    });
  }, []);

  return { isSupported, start, stop };
}
