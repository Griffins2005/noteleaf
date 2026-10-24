/**
 * @file useSTTWebSocket.ts
 * @description WebSocket client for the Noteleaf speech proxy (/api/stt/stream).
 *
 * The socket stays open for the meeting. Partials update the live line.
 * Finals carry word timestamps in milliseconds from the start of the session.
 * If the socket drops, the caller opens another one with audioOffsetMs set to
 * the last finalized time and replays the audio that never received a final.
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import type { ClientToServerWsMessage, ServerToClientWsMessage } from '@noteleaf/shared-types';

export type WebSocketConnectionState =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'error';

export interface StartSttSessionOptions {
  sessionId: string;
  userUuid: string;
  languageCode: string;
  audioOffsetMs: number;
}

export interface UseSTTWebSocketOptions {
  onPartialTranscript: (text: string) => void;
  onFinalTranscript: (
    text: string,
    startOffsetSeconds: number,
    endOffsetSeconds: number,
    confidence: number,
  ) => void;
  onSessionReady: () => void;
  onUnexpectedClose: () => void;
  onError: (code: string, message: string) => void;
  onSessionEnded?: (durationMs: number) => void;
}

export interface UseSTTWebSocketReturn {
  connectionState: WebSocketConnectionState;
  startSession: (options: StartSttSessionOptions) => void;
  /** Returns false when the socket is not open. The caller keeps that audio for replay. */
  sendAudio: (base64Chunk: string) => boolean;
  stopSession: () => Promise<void>;
}

function getWsUrl(): string {
  if (typeof window === 'undefined') return '';

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

  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${protocol}://${window.location.host}/api/stt/stream`;
}

export function useSTTWebSocket(options: UseSTTWebSocketOptions): UseSTTWebSocketReturn {
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const [connectionState, setConnectionState] = useState<WebSocketConnectionState>('disconnected');
  const wsRef = useRef<WebSocket | null>(null);
  const endedWaitRef = useRef<(() => void) | null>(null);

  const startSession = useCallback((session: StartSttSessionOptions): void => {
    const previous = wsRef.current;
    wsRef.current = null;
    previous?.close();

    setConnectionState('connecting');
    const ws = new WebSocket(getWsUrl());
    wsRef.current = ws;

    ws.onopen = () => {
      if (wsRef.current !== ws) return;
      setConnectionState('connected');
      const message: ClientToServerWsMessage = {
        type: 'session_start',
        sessionId: session.sessionId,
        userUuid: session.userUuid,
        languageCode: session.languageCode,
        audioOffsetMs: session.audioOffsetMs,
      };
      ws.send(JSON.stringify(message));
    };

    ws.onmessage = (event: MessageEvent<string>) => {
      let message: ServerToClientWsMessage;
      try {
        message = JSON.parse(event.data) as ServerToClientWsMessage;
      } catch {
        return;
      }

      switch (message.type) {
        case 'partial_transcript':
          optionsRef.current.onPartialTranscript(message.text);
          break;

        case 'final_transcript':
          optionsRef.current.onFinalTranscript(
            message.text,
            message.audioStart / 1000,
            message.audioEnd / 1000,
            message.confidence,
          );
          break;

        case 'session_ended':
          optionsRef.current.onSessionEnded?.(message.durationMs);
          endedWaitRef.current?.();
          endedWaitRef.current = null;
          break;

        case 'error':
          optionsRef.current.onError(message.code, message.message);
          setConnectionState('error');
          break;

        case 'session_ready':
          optionsRef.current.onSessionReady();
          break;
      }
    };

    ws.onerror = () => {
      if (wsRef.current !== ws) return;
      optionsRef.current.onError('WS_ERROR', 'Connection to speech recognition lost. Please try again.');
    };

    ws.onclose = () => {
      if (wsRef.current !== ws) return;
      wsRef.current = null;
      setConnectionState('disconnected');
      optionsRef.current.onUnexpectedClose();
    };
  }, []);

  const sendAudio = useCallback((base64Chunk: string): boolean => {
    const ws = wsRef.current;
    if (ws?.readyState !== WebSocket.OPEN) return false;
    ws.send(JSON.stringify({ type: 'audio_chunk', data: base64Chunk } satisfies ClientToServerWsMessage));
    return true;
  }, []);

  const stopSession = useCallback((): Promise<void> => {
    const ws = wsRef.current;
    if (!ws) return Promise.resolve();

    return new Promise((resolve) => {
      const finish = () => {
        endedWaitRef.current = null;
        if (wsRef.current === ws) wsRef.current = null;
        if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
          ws.close();
        }
        resolve();
      };

      if (ws.readyState !== WebSocket.OPEN) {
        finish();
        return;
      }

      const timer = setTimeout(finish, 1500);
      endedWaitRef.current = () => {
        clearTimeout(timer);
        finish();
      };
      ws.send(JSON.stringify({ type: 'session_end' } satisfies ClientToServerWsMessage));
    });
  }, []);

  useEffect(() => {
    return () => {
      const ws = wsRef.current;
      wsRef.current = null;
      ws?.close();
    };
  }, []);

  return { connectionState, startSession, sendAudio, stopSession };
}
