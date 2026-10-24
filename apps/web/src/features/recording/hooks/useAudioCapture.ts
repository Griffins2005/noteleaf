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
  onAudioChunk: (base64Chunk: string, byteLength: number) => void;

  /** Unused — kept for API compatibility. Chunk size is fixed in the worklet. */
  chunkIntervalMs?: number;
}

export interface UseAudioCaptureReturn {
  isRecording: boolean;
  error: AudioCaptureError | null;
  /** Resolves to null when the microphone is running, or an error code. */
  startCapture: () => Promise<AudioCaptureError | null>;
  stopCapture: () => void;
  /** Browsers suspend the audio graph when the tab is in the background. */
  resumeCapture: () => Promise<void>;
  clearError: () => void;
}

export function useAudioCapture(options: UseAudioCaptureOptions): UseAudioCaptureReturn {
  const onChunkRef = useRef(options.onAudioChunk);
  onChunkRef.current = options.onAudioChunk;

  const [isRecording, setIsRecording] = useState(false);
  const [error, setError]             = useState<AudioCaptureError | null>(null);
  const recordingRef = useRef(false);

  const audioContextRef = useRef<AudioContext | null>(null);
  const workletNodeRef  = useRef<AudioWorkletNode | null>(null);
  const streamRef       = useRef<MediaStream | null>(null);

  const startCapture = useCallback(async (): Promise<AudioCaptureError | null> => {
    if (recordingRef.current) {
      setError('already-recording');
      return 'already-recording';
    }

    if (typeof window === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setError('not-supported');
      return 'not-supported';
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
        const step = 0x8000;
        for (let i = 0; i < bytes.byteLength; i += step) {
          binary += String.fromCharCode(...bytes.subarray(i, i + step));
        }
        onChunkRef.current(btoa(binary), bytes.byteLength);
      };

      const source = audioContext.createMediaStreamSource(stream);
      source.connect(workletNode);
      // Must connect to destination so the audio graph pull model schedules
      // the worklet for processing. The worklet doesn't write to its output
      // buffers, so the connected output is silent — no mic playback.
      workletNode.connect(audioContext.destination);

      recordingRef.current = true;
      setIsRecording(true);
      setError(null);
      return null;

    } catch (err) {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      void audioContextRef.current?.close();
      audioContextRef.current = null;
      let code: AudioCaptureError = 'unknown';
      if (err instanceof DOMException) {
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          code = 'permission-denied';
        } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
          code = 'no-microphone';
        }
      }
      setError(code);
      return code;
    }
  }, []);

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

    recordingRef.current = false;
    setIsRecording(false);
  }, []);

  const resumeCapture = useCallback(async (): Promise<void> => {
    const context = audioContextRef.current;
    if (context && context.state === 'suspended') {
      try {
        await context.resume();
      } catch {
        /* The browser may refuse until the tab is visible. */
      }
    }
  }, []);

  useEffect(() => {
    return () => { stopCapture(); };
  }, [stopCapture]);

  const clearError = useCallback((): void => setError(null), []);

  return { isRecording, error, startCapture, stopCapture, resumeCapture, clearError };
}
