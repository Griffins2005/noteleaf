import { describe, expect, it } from 'vitest';
import {
  boundsFromCapturedAudio,
  boundsFromWords,
  normalizeWordClock,
  pcmDurationMs,
  readWordMs,
} from './transcriptTiming.js';

describe('transcriptTiming', () => {
  it('measures 16 kHz 16-bit PCM in milliseconds', () => {
    expect(pcmDurationMs(32_000)).toBe(1000);
    expect(pcmDurationMs(0)).toBe(0);
  });

  it('reads proto int64 word times that arrive as strings', () => {
    expect(readWordMs('1500')).toBe(1500);
    expect(readWordMs(0)).toBe(0);
    expect(readWordMs('')).toBeNull();
  });

  it('places word times on the session clock after a reconnect', () => {
    const bounds = boundsFromWords(
      [
        { startMs: 120, endMs: 400 },
        { startMs: 400, endMs: 980 },
      ],
      90_000,
    );
    expect(bounds).toEqual({ audioStart: 90_120, audioEnd: 90_980 });
  });

  it('scales second-based word times up to milliseconds', () => {
    expect(normalizeWordClock([{ startMs: 1.2, endMs: 4.8 }], 12_000)).toEqual([
      { startMs: 1200, endMs: 4800 },
    ]);
    expect(normalizeWordClock([{ startMs: 1200, endMs: 4800 }], 12_000)).toEqual([
      { startMs: 1200, endMs: 4800 },
    ]);
  });

  it('falls back to bytes already sent when the engine omits word times', () => {
    const bounds = boundsFromCapturedAudio({
      words: [],
      offsetMs: 10_000,
      capturedMs: 2_500,
      lastFinalEndMs: 11_200,
    });
    expect(bounds).toEqual({ audioStart: 11_200, audioEnd: 12_500 });
  });
});
