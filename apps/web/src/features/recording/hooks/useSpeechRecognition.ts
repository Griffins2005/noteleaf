/**
 * @file useSpeechRecognition.ts
 * @description Thin wrapper around the browser's Web Speech API.
 *
 * Replaces the NVIDIA NIM WebSocket + AudioWorklet pipeline for STT.
 * Works in Chrome, Edge, and Safari with no server configuration.
 *
 * Behaviour:
 *   - Interim results feed the live transcript bar.
 *   - Final results go to the note classifier.
 *   - SpeechRecognition stops after silence; onend auto-restarts it so
 *     recording feels continuous.
 *   - stop() awaits the final onend so all results are flushed before
 *     the caller reads session state.
 */

import { useRef, useCallback } from 'react';

// ─── Web Speech API type declarations ────────────────────────────────────────
// TypeScript's built-in DOM lib does not fully expose these yet.

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

// ─── Hook ─────────────────────────────────────────────────────────────────────

export interface UseSpeechRecognitionOptions {
  onPartialTranscript: (text: string) => void;
  onFinalTranscript: (
    text: string,
    startOffsetSeconds: number,
    endOffsetSeconds: number,
    confidence: number,
  ) => void;
  onError: (code: string, message: string) => void;
}

export interface UseSpeechRecognitionReturn {
  isSupported: boolean;
  start: (lang: string) => void;
  stop: () => Promise<void>;
}

export function useSpeechRecognition(
  options: UseSpeechRecognitionOptions,
): UseSpeechRecognitionReturn {
  const recognitionRef  = useRef<ISpeechRecognition | null>(null);
  const sessionStartRef = useRef<number>(0);
  const activeRef       = useRef(false);
  const stopResolveRef  = useRef<(() => void) | null>(null);
  const langRef         = useRef('en-US');

  // Stable refs for callbacks — avoids stale closures without dep churn.
  const onPartialRef = useRef(options.onPartialTranscript);
  const onFinalRef   = useRef(options.onFinalTranscript);
  const onErrorRef   = useRef(options.onError);
  onPartialRef.current = options.onPartialTranscript;
  onFinalRef.current   = options.onFinalTranscript;
  onErrorRef.current   = options.onError;

  const getAPI = (): ISpeechRecognitionConstructor | null => {
    if (typeof window === 'undefined') return null;
    return window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null;
  };

  const isSupported = !!getAPI();

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
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (!result) continue;
        const alt = result[0];
        if (!alt) continue;

        if (result.isFinal) {
          const endOffset   = (Date.now() - sessionStartRef.current) / 1000;
          const startOffset = Math.max(0, endOffset - 3); // approximate
          onFinalRef.current(alt.transcript, startOffset, endOffset, alt.confidence || 1.0);
        } else {
          onPartialRef.current(alt.transcript);
        }
      }
    };

    recognition.onerror = (event: ISpeechRecognitionErrorEvent) => {
      if (event.error === 'no-speech' || event.error === 'aborted') return;
      const code = event.error === 'not-allowed' ? 'permission-denied' : 'STT_ERROR';
      onErrorRef.current(code, `Speech recognition error: ${event.error}`);
    };

    recognition.onend = () => {
      if (activeRef.current) {
        // Auto-restart to maintain continuous listening.
        setTimeout(createAndStart, 80);
      } else {
        stopResolveRef.current?.();
        stopResolveRef.current = null;
      }
    };

    try {
      recognition.start();
    } catch {
      // Ignore "already started" errors on rapid start/stop.
    }
  }, []); // no deps — reads everything from refs

  const start = useCallback(
    (lang: string) => {
      langRef.current        = lang;
      activeRef.current      = true;
      sessionStartRef.current = Date.now();
      createAndStart();
    },
    [createAndStart],
  );

  const stop = useCallback((): Promise<void> => {
    activeRef.current = false;
    return new Promise<void>((resolve) => {
      if (!recognitionRef.current) { resolve(); return; }
      stopResolveRef.current = resolve;
      try { recognitionRef.current.stop(); } catch { resolve(); }
    });
  }, []);

  return { isSupported, start, stop };
}
