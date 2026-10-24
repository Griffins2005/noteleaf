import { describe, expect, it } from 'vitest';
import { PcmTimeline, pcmDurationMs, slicePcmFrom } from '../pcmTimeline';

function pcmBase64(byteLength: number): string {
  return btoa(String.fromCharCode(...new Uint8Array(byteLength)));
}

describe('pcmTimeline', () => {
  it('measures captured audio on a 16 kHz clock', () => {
    expect(pcmDurationMs(8192)).toBe(256);
  });

  it('keeps a contiguous session clock across chunks', () => {
    const timeline = new PcmTimeline();
    const first = timeline.push(pcmBase64(8192), 8192);
    const second = timeline.push(pcmBase64(8192), 8192);
    expect(first).toMatchObject({ startMs: 0, endMs: 256 });
    expect(second).toMatchObject({ startMs: 256, endMs: 512 });
    expect(timeline.capturedThroughMs).toBe(512);
  });

  it('drops finalized audio and replays only the gap, trimmed to the clock', () => {
    const timeline = new PcmTimeline();
    timeline.push(pcmBase64(8192), 8192);
    timeline.push(pcmBase64(8192), 8192);
    timeline.markSent(512);
    timeline.markFinalized(300);
    timeline.rewindSentToFinalized();

    const pieces = timeline.unsentPieces();
    expect(timeline.finalizedThroughMs).toBe(300);
    expect(pieces).toHaveLength(1);
    expect(pieces[0]?.endMs).toBe(512);
    const replayed = Uint8Array.from(atob(pieces[0]!.pcmBase64), (char) => char.charCodeAt(0));
    expect(replayed.length).toBe(8192 - Math.floor(((300 - 256) * 32) / 2) * 2);
  });

  it('slices on a sample boundary', () => {
    const sliced = slicePcmFrom(pcmBase64(64), 1);
    expect(Uint8Array.from(atob(sliced), (char) => char.charCodeAt(0)).length).toBe(32);
  });
});
