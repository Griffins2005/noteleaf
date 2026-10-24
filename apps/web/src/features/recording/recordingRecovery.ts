/**
 * Unfinalized microphone audio, kept in this browser so a closed tab
 * can still be transcribed. Finalized audio is not stored.
 */

import type { PcmTimelineSnapshot } from '@/lib/pcmTimeline';

const DB_NAME = 'noteleaf-recovery';
const STORE = 'audio';

export interface RecoveryRecord {
  sessionId: string;
  savedAt: string;
  snapshot: PcmTimelineSnapshot;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveUnfinalizedAudio(record: RecoveryRecord): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(record, record.sessionId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function loadUnfinalizedAudio(sessionId: string): Promise<RecoveryRecord | null> {
  const db = await openDb();
  const record = await new Promise<RecoveryRecord | null>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const request = tx.objectStore(STORE).get(sessionId);
    request.onsuccess = () => resolve((request.result as RecoveryRecord | undefined) ?? null);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return record;
}

export async function clearUnfinalizedAudio(sessionId: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(sessionId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}
