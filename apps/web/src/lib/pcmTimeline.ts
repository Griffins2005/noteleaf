/**
 * Session clock for 16 kHz 16-bit mono PCM.
 * Holds only audio the speech engine has not finalized yet, so a dropped
 * socket can be replayed without sending the whole meeting again.
 */

const PCM_BYTES_PER_MS = 32;

export interface UnsentPiece {
  pcmBase64: string;
  endMs: number;
}

interface TimelineChunk {
  startMs: number;
  endMs: number;
  pcmBase64: string;
}

export function pcmDurationMs(byteLength: number): number {
  if (byteLength <= 0) return 0;
  return byteLength / PCM_BYTES_PER_MS;
}

function decodeBase64(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function encodeBase64(bytes: Uint8Array): string {
  let binary = '';
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) {
    binary += String.fromCharCode(...bytes.subarray(i, i + step));
  }
  return btoa(binary);
}

/** Drop whole samples so a replay starts on the session clock, not mid-sample. */
export function slicePcmFrom(base64: string, skipMs: number): string {
  if (skipMs <= 0) return base64;
  const bytes = decodeBase64(base64);
  const skipBytes = Math.floor((skipMs * PCM_BYTES_PER_MS) / 2) * 2;
  if (skipBytes <= 0) return base64;
  if (skipBytes >= bytes.length) return '';
  return encodeBase64(bytes.subarray(skipBytes));
}

export class PcmTimeline {
  private chunks: TimelineChunk[] = [];
  private nextStartMs = 0;
  finalizedThroughMs = 0;
  sentThroughMs = 0;

  reset(): void {
    this.chunks = [];
    this.nextStartMs = 0;
    this.finalizedThroughMs = 0;
    this.sentThroughMs = 0;
  }

  get capturedThroughMs(): number {
    return this.nextStartMs;
  }

  push(pcmBase64: string, byteLength: number): TimelineChunk {
    const durationMs = pcmDurationMs(byteLength);
    const chunk: TimelineChunk = {
      startMs: this.nextStartMs,
      endMs: this.nextStartMs + durationMs,
      pcmBase64,
    };
    this.nextStartMs = chunk.endMs;
    this.chunks.push(chunk);
    return chunk;
  }

  markFinalized(endMs: number): void {
    if (endMs > this.finalizedThroughMs) this.finalizedThroughMs = endMs;
    this.chunks = this.chunks.filter((chunk) => chunk.endMs > this.finalizedThroughMs);
  }

  /** A new socket must resend audio that never received a final. */
  rewindSentToFinalized(): void {
    this.sentThroughMs = this.finalizedThroughMs;
  }

  unsentPieces(): UnsentPiece[] {
    const from = this.sentThroughMs;
    const pieces: UnsentPiece[] = [];

    for (const chunk of this.chunks) {
      if (chunk.endMs <= from) continue;
      if (chunk.startMs >= from) {
        pieces.push({ pcmBase64: chunk.pcmBase64, endMs: chunk.endMs });
        continue;
      }

      const sliced = slicePcmFrom(chunk.pcmBase64, from - chunk.startMs);
      if (sliced) pieces.push({ pcmBase64: sliced, endMs: chunk.endMs });
    }

    return pieces;
  }

  markSent(endMs: number): void {
    if (endMs > this.sentThroughMs) this.sentThroughMs = endMs;
  }
}
