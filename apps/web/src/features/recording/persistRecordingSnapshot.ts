import { sessionsApi } from '@/features/sessions/sessions.api';
import type { Note, TranscriptSegment } from '@noteleaf/shared-types';

export type PersistStatus = 'recording' | 'stopped';

export interface RecordingSnapshot {
  sessionId: string;
  notes: Note[];
  transcript: string;
  transcriptSegments: TranscriptSegment[];
  durationSeconds: number;
  status: PersistStatus;
}

/** PATCH the session. `keepalive` is for tab-close so the request can outlive the page. */
export async function persistRecordingSnapshot(
  snapshot: RecordingSnapshot,
  opts?: { keepalive?: boolean },
): Promise<void> {
  const body = {
    notes: snapshot.notes,
    transcript: snapshot.transcript,
    transcriptSegments: snapshot.transcriptSegments,
    durationSeconds: snapshot.durationSeconds,
    status: snapshot.status,
  };

  if (opts?.keepalive && typeof fetch !== 'undefined') {
    await fetch(`/api/sessions/${snapshot.sessionId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      credentials: 'include',
      keepalive: true,
      body: JSON.stringify(body),
    });
    return;
  }

  await sessionsApi.update(snapshot.sessionId, body);
}
