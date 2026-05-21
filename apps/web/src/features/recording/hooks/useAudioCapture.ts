/**
 * @file useAudioCapture.ts
 * @description React hook that manages microphone access and audio capture.
 *
 * Captures raw PCM audio via AudioContext + AudioWorkletNode and emits
 * base64-encoded LINEAR_PCM chunks ready for NVIDIA NIM Riva ASR via gRPC.
 *
 * Audio format: 16-bit signed little-endian PCM, 16kHz mono.
 * Chunk size: 4096 samples ≈ 256ms per chunk (buffered in the worklet).
 *
 * The worklet processor lives at /public/pcm-processor.js and is loaded
 * lazily on the first startCapture() call.
 */

import { useState, useRef, useCallback, useEffect } from 'react';

export type AudioCaptureError =
  | 'permission-denied'
  | 'no-microphone'
  | 'not-supported'
  | 'already-recording'
  | 'unknown';

export interface UseAudioCaptureOptions {
  /** Called with each base64-encoded LINEAR_PCM chunk (~256ms of audio). */
  onAudioChunk: (base64Chunk: string) => void;

  /** Unused — kept for API compatibility. Chunk size is fixed in the worklet. */
  chunkIntervalMs?: number;
}

export interface UseAudioCaptureReturn {
  isRecording: boolean;
  error: AudioCaptureError | null;
  startCapture: () => Promise<boolean>;
  stopCapture: () => void;
  clearError: () => void;
}

export function useAudioCapture(options: UseAudioCaptureOptions): UseAudioCaptureReturn {
  const { onAudioChunk } = options;

  const [isRecording, setIsRecording] = useState(false);
  const [error, setError]             = useState<AudioCaptureError | null>(null);

  const audioContextRef = useRef<AudioContext | null>(null);
  const workletNodeRef  = useRef<AudioWorkletNode | null>(null);
  const streamRef       = useRef<MediaStream | null>(null);

  const startCapture = useCallback(async (): Promise<boolean> => {
    if (isRecording) {
      setError('already-recording');
      return false;
    }

    if (typeof window === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setError('not-supported');
      return false;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          channelCount: 1,
        },
      });

      streamRef.current = stream;

      // AudioContext at 16kHz — Riva's native sample rate.
      // The browser resamples from the device's native rate automatically.
      const audioContext = new AudioContext({ sampleRate: 16000 });
      audioContextRef.current = audioContext;

      // Load the worklet processor once per AudioContext.
      await audioContext.audioWorklet.addModule('/pcm-processor.js');

      const workletNode = new AudioWorkletNode(audioContext, 'pcm-processor');
      workletNodeRef.current = workletNode;

      workletNode.port.onmessage = (event: MessageEvent<ArrayBuffer>) => {
        const bytes = new Uint8Array(event.data);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) {
          binary += String.fromCharCode(bytes[i] ?? 0);
        }
        onAudioChunk(btoa(binary));
      };

      const source = audioContext.createMediaStreamSource(stream);
      source.connect(workletNode);
      // Must connect to destination so the audio graph pull model schedules
      // the worklet for processing. The worklet doesn't write to its output
      // buffers, so the connected output is silent — no mic playback.
      workletNode.connect(audioContext.destination);

      setIsRecording(true);
      setError(null);
      return true;

    } catch (err) {
      if (err instanceof DOMException) {
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          setError('permission-denied');
        } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
          setError('no-microphone');
        } else {
          setError('unknown');
        }
      } else {
        setError('unknown');
      }
      return false;
    }
  }, [isRecording, onAudioChunk]);

  const stopCapture = useCallback((): void => {
    workletNodeRef.current?.port.close();
    workletNodeRef.current?.disconnect();
    workletNodeRef.current = null;

    void audioContextRef.current?.close();
    audioContextRef.current = null;

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    setIsRecording(false);
  }, []);

  useEffect(() => {
    return () => { stopCapture(); };
  }, [stopCapture]);

  const clearError = useCallback((): void => setError(null), []);

  return { isRecording, error, startCapture, stopCapture, clearError };
}
