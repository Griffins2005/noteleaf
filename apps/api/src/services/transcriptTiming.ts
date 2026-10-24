/**
 * Turn NVIDIA word timestamps into a segment's start and end on the session clock.
 * Word times are milliseconds from the start of the current gRPC stream.
 * audioOffsetMs is the session time where that stream's audio begins, so a
 * reconnected stream does not restart the clock at zero.
 */

export interface TimedWord {
  startMs: number;
  endMs: number;
}

export interface SegmentBounds {
  audioStart: number;
  audioEnd: number;
}

const PCM_SAMPLE_RATE = 16_000;
const PCM_BYTES_PER_SAMPLE = 2;

export function pcmDurationMs(byteLength: number): number {
  if (byteLength <= 0) return 0;
  return (byteLength / PCM_BYTES_PER_SAMPLE / PCM_SAMPLE_RATE) * 1000;
}

export function readWordMs(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/**
 * This proto records word times in milliseconds. If a server sends seconds,
 * a multi-second buffer will end far earlier than the audio already sent.
 */
export function normalizeWordClock(words: TimedWord[], capturedMs: number): TimedWord[] {
  const last = words[words.length - 1];
  if (!last || capturedMs < 5_000 || last.endMs <= 0) return words;
  if (last.endMs * 10 < capturedMs) {
    return words.map((word) => ({ startMs: word.startMs * 1000, endMs: word.endMs * 1000 }));
  }
  return words;
}

export function boundsFromWords(words: TimedWord[], offsetMs: number): SegmentBounds | null {
  const timed = words.filter(
    (word) => Number.isFinite(word.startMs) && Number.isFinite(word.endMs) && word.endMs >= word.startMs,
  );
  if (timed.length === 0) return null;

  const first = timed[0]!;
  const last = timed[timed.length - 1]!;
  return {
    audioStart: first.startMs + offsetMs,
    audioEnd: last.endMs + offsetMs,
  };
}

/**
 * Prefer word times. When the engine omits them, place the line on the audio
 * already sent in this stream, continuing from the previous final.
 */
export function boundsFromCapturedAudio(options: {
  words: TimedWord[];
  offsetMs: number;
  capturedMs: number;
  lastFinalEndMs: number;
}): SegmentBounds {
  const fromWords = boundsFromWords(options.words, options.offsetMs);
  if (fromWords && fromWords.audioEnd >= fromWords.audioStart) return fromWords;

  const audioEnd = options.offsetMs + Math.max(0, options.capturedMs);
  const audioStart = Math.min(audioEnd, Math.max(options.offsetMs, options.lastFinalEndMs));
  return { audioStart, audioEnd };
}
