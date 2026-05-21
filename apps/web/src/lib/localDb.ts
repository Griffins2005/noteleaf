/**
 * @file localDb.ts
 * @description IndexedDB storage layer for local-mode sessions.
 *
 * Replaces localStorage for two reasons:
 *   1. localStorage has a hard 5 MB per-origin limit shared with everything
 *      else (prefs, sessions list, …). A heavy user hits it in ~300 sessions.
 *   2. localStorage writes are synchronous and block the main thread.
 *
 * IndexedDB storage is allocated from available disk space (~60 % of free
 * space in Chrome). In practice it is effectively unlimited for text data.
 *
 * Schema (database "noteleaf-local", version 1):
 *   kv           — general key/value pairs; used by the Zustand persist
 *                  middleware as a drop-in replacement for localStorage.
 *   session-data — one record per local session keyed by session UUID;
 *                  stores notes, transcript, transcript segments, and
 *                  AI summary when present.
 *
 * All public functions return Promises; callers must await them or fire
 * and forget (void fn().catch(console.error)).
 */

import type { AiSummary, Note, TranscriptSegment } from '@noteleaf/shared-types';
import type { StateStorage } from 'zustand/middleware';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface LocalSessionData {
  notes: Note[];
  transcript: string;
  transcriptSegments: TranscriptSegment[];
  durationSeconds: number;
  aiSummary?: AiSummary;
}

// ─── Database ─────────────────────────────────────────────────────────────────

const DB_NAME    = 'noteleaf-local';
const DB_VERSION = 1;

let _db: IDBDatabase | null = null;

function openDb(): Promise<IDBDatabase> {
  if (_db) return Promise.resolve(_db);

  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains('kv')) {
        db.createObjectStore('kv');
      }
      if (!db.objectStoreNames.contains('session-data')) {
        db.createObjectStore('session-data', { keyPath: 'id' });
      }
    };

    req.onsuccess = () => { _db = req.result; resolve(req.result); };
    req.onerror   = () => reject(req.error);
  });
}

// ─── Key/value helpers (used by idbStorage below) ────────────────────────────

async function kvGet(key: string): Promise<string | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction('kv', 'readonly').objectStore('kv').get(key);
    req.onsuccess = () => resolve((req.result as string | undefined) ?? null);
    req.onerror   = () => reject(req.error);
  });
}

async function kvSet(key: string, value: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction('kv', 'readwrite').objectStore('kv').put(value, key);
    req.onsuccess = () => resolve();
    req.onerror   = () => reject(req.error);
  });
}

async function kvDelete(key: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction('kv', 'readwrite').objectStore('kv').delete(key);
    req.onsuccess = () => resolve();
    req.onerror   = () => reject(req.error);
  });
}

// ─── Zustand storage adapter ──────────────────────────────────────────────────

/**
 * Drop-in replacement for the `localStorage` storage engine used by Zustand's
 * persist middleware. Pass this to `createJSONStorage(() => idbStorage)`.
 *
 * Zustand's persist middleware accepts Promises from all three methods.
 */
export const idbStorage: StateStorage = {
  getItem:    (name) => kvGet(name),
  setItem:    (name, value) => kvSet(name, value),
  removeItem: (name) => kvDelete(name),
};

// ─── Session data ─────────────────────────────────────────────────────────────

export async function saveSessionData(
  id: string,
  data: LocalSessionData,
): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = db
      .transaction('session-data', 'readwrite')
      .objectStore('session-data')
      .put({ id, ...data });
    req.onsuccess = () => resolve();
    req.onerror   = () => reject(req.error);
  });
}

export async function loadSessionData(id: string): Promise<LocalSessionData | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = db
      .transaction('session-data', 'readonly')
      .objectStore('session-data')
      .get(id);
    req.onsuccess = () => {
      const row = req.result as (LocalSessionData & { id: string }) | undefined;
      if (!row) { resolve(null); return; }
      const { id: _id, ...data } = row;
      resolve(data);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function deleteSessionData(id: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = db
      .transaction('session-data', 'readwrite')
      .objectStore('session-data')
      .delete(id);
    req.onsuccess = () => resolve();
    req.onerror   = () => reject(req.error);
  });
}
