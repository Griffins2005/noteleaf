/**
 * @file useSTTWebSocket.ts
 * @description React hook that manages the WebSocket connection to the
 * Noteleaf API's STT proxy (/api/stt/stream).
 *
 * Responsibilities:
 *   - Open and maintain the WebSocket connection.
 *   - Send session_start, audio_chunk, and session_end messages.
 *   - Receive and dispatch partial_transcript, final_transcript, and error events.
 *   - Expose a typed event callback interface to the recording feature.
 *
 * WebSocket lifecycle:
 *   connect() → send session_start → [send audio_chunk]* → send session_end → disconnect()
 *
 * Connection strategy:
 *   - The WebSocket is opened lazily when startSession() is called.
 *   - It is closed when stopSession() is called or on component unmount.
 *   - Automatic reconnection is NOT implemented in v1. If the connection drops,
 *     the user must stop and restart recording. A future version can add
 *     exponential backoff reconnection with session resume.
 *
 * Usage:
 *   const { startSession, stopSession, sendAudio, connectionState } = useSTTWebSocket({
 *     onPartialTranscript: (text) => setLiveText(text),
 *     onFinalTranscript: (text, offset) => classifyAndAddNote(text, offset),
 *     onError: (code, msg) => showError(msg),
 *   });
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import type { ClientToServerWsMessage, ServerToClientWsMessage } from '@noteleaf/shared-types';

// ─── Types ────────────────────────────────────────────────────────────────────

export type WebSocketConnectionState =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'error';

export interface UseSTTWebSocketOptions {
  /** Called when a partial (interim) transcript arrives. Display-only; do not classify. */
  onPartialTranscript: (text: string) => void;

  /**
   * Called when a FINAL, immutable transcript segment arrives from NVIDIA NIM.
   * This is the event that should trigger the note classifier.
   *
   * @param text - The finalised transcript text.
   * @param startOffsetSeconds - Time from session start when this segment began.
   * @param endOffsetSeconds - Time from session start when this segment ended.
   * @param confidence - NVIDIA NIM confidence score (0.0–1.0).
   */
  onFinalTranscript: (
    text: string,
    startOffsetSeconds: number,
    endOffsetSeconds: number,
    confidence: number,
  ) => void;

  /** Called when the STT proxy reports an error. */
  onError: (code: string, message: string) => void;

  /** Called when the session has ended and the server confirms the duration. */
  onSessionEnded?: (durationMs: number) => void;
}

export interface UseSTTWebSocketReturn {
  /** Current state of the WebSocket connection. */
  connectionState: WebSocketConnectionState;

  /**
   * Opens the WebSocket and sends session_start.
   * Must be called before sendAudio.
   */
  startSession: (sessionId: string, userUuid: string, languageCode: string) => void;

  /**
   * Sends a base64-encoded audio chunk to the STT proxy.
   * No-op if the connection is not in 'connected' state.
   */
  sendAudio: (base64Chunk: string) => void;

  /**
   * Sends session_end and closes the WebSocket gracefully.
   */
  stopSession: () => void;
}

// ─── WebSocket URL ────────────────────────────────────────────────────────────

/**
 * Derives the WebSocket URL for the STT proxy.
 *
 * Priority:
 *   1. NEXT_PUBLIC_WS_URL env var — explicit override for production deployments
 *      where the API is on a different domain (e.g. wss://api.noteleaf.app/api/stt/stream).
 *   2. NEXT_PUBLIC_API_URL — converts the public HTTP API URL to ws/wss.
 *   3. Auto-derived from window.location as a same-origin fallback.
 *
 * Docker note: Next.js rewrites do not proxy WebSocket upgrades, so the browser
 * must connect directly to the API's published host port.
 */
function getWsUrl(): string {
  // Server-side render guard
  if (typeof window === 'undefined') return '';

  // Explicit override via env var (production multi-domain deployments)
  const envOverride = process.env['NEXT_PUBLIC_WS_URL'];
  if (envOverride) return envOverride;

  const apiUrl = process.env['NEXT_PUBLIC_API_URL'];
  if (apiUrl) {
    const url = new URL(apiUrl);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    url.pathname = '/api/stt/stream';
    url.search = '';
    url.hash = '';
    return url.toString();
  }

  // Same-origin fallback: swap http→ws, https→wss.
  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${protocol}://${window.location.host}/api/stt/stream`;
}

const WS_URL = getWsUrl();

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useSTTWebSocket(options: UseSTTWebSocketOptions): UseSTTWebSocketReturn {
  const { onPartialTranscript, onFinalTranscript, onError, onSessionEnded } = options;

  const [connectionState, setConnectionState] = useState<WebSocketConnectionState>('disconnected');
  const wsRef = useRef<WebSocket | null>(null);

  // Track session start time to compute sessionOffsetSeconds from audioEnd ms.
  const sessionStartTimeRef = useRef<number>(0);

  // ── Send helper ────────────────────────────────────────────────────────

  const sendMessage = useCallback((message: ClientToServerWsMessage): void => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    }
  }, []);

  // ── Start session ──────────────────────────────────────────────────────

  const startSession = useCallback(
    (sessionId: string, userUuid: string, languageCode: string): void => {
      if (wsRef.current) {
        wsRef.current.close();
      }

      setConnectionState('connecting');
      sessionStartTimeRef.current = Date.now();

      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnectionState('connected');
        sendMessage({ type: 'session_start', sessionId, userUuid, languageCode });
      };

      ws.onmessage = (event: MessageEvent<string>) => {
        let message: ServerToClientWsMessage;
        try {
          message = JSON.parse(event.data) as ServerToClientWsMessage;
        } catch {
          return; // Ignore malformed messages
        }

        switch (message.type) {
          case 'partial_transcript':
            onPartialTranscript(message.text);
            break;

          case 'final_transcript': {
            // Convert audioEnd (milliseconds from session start) to seconds offset.
            const startOffsetSeconds = message.audioStart / 1000;
            const endOffsetSeconds = message.audioEnd / 1000;
            onFinalTranscript(
              message.text,
              startOffsetSeconds,
              endOffsetSeconds,
              message.confidence,
            );
            break;
          }

          case 'session_ended':
            onSessionEnded?.(message.durationMs);
            break;

          case 'error':
            onError(message.code, message.message);
            setConnectionState('error');
            break;

          case 'session_ready':
            // Server confirms NVIDIA NIM gRPC session is open.
            break;
        }
      };

      ws.onerror = () => {
        setConnectionState('error');
        onError('WS_ERROR', 'Connection to speech recognition lost. Please try again.');
      };

      ws.onclose = () => {
        setConnectionState('disconnected');
        wsRef.current = null;
      };
    },
    [sendMessage, onPartialTranscript, onFinalTranscript, onError, onSessionEnded],
  );

  // ── Send audio ─────────────────────────────────────────────────────────

  const sendAudio = useCallback(
    (base64Chunk: string): void => {
      sendMessage({ type: 'audio_chunk', data: base64Chunk });
    },
    [sendMessage],
  );

  // ── Stop session ───────────────────────────────────────────────────────

  const stopSession = useCallback((): void => {
    sendMessage({ type: 'session_end' });
    // Give the server 1s to send session_ended before we close.
    setTimeout(() => {
      wsRef.current?.close();
    }, 1000);
  }, [sendMessage]);

  // ── Cleanup on unmount ─────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      wsRef.current?.close();
    };
  }, []);

  return { connectionState, startSession, sendAudio, stopSession };
}
