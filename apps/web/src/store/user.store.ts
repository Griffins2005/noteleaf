/**
 * @file user.store.ts
 * @description Zustand store for user identity and preferences.
 *
 * Handles:
 *   - UUID generation and persistence (localStorage)
 *   - Storage mode preference (cloud vs local)
 *   - User preferences (classify, tags, transcript, language)
 *   - Onboarding completion state
 *
 * Persistence strategy:
 *   All state in this store is persisted to localStorage immediately on change.
 *   On app load, initUserStore() reads from localStorage and hydrates the store.
 *   This is synchronous — no async/await, no loading state needed.
 *
 * Key naming convention for localStorage:
 *   nl_uuid           → The user's UUID
 *   nl_storage_mode   → 'cloud' | 'local'
 *   nl_local_mode     → 'download' | 'folder'
 *   nl_prefs          → JSON-serialised UserPreferences
 *   nl_onboarded      → 'true' when onboarding is complete
 */

import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import type { StorageMode, LocalSaveMode, UserPreferences } from '@noteleaf/shared-types';
import { defaultUserPreferences } from '@noteleaf/shared-types';

// ─── LocalStorage keys ────────────────────────────────────────────────────────

const LS_KEYS = {
  UUID:         'nl_uuid',
  STORAGE_MODE: 'nl_storage_mode',
  LOCAL_MODE:   'nl_local_mode',
  PREFERENCES:  'nl_prefs',
  ONBOARDED:    'nl_onboarded',
  EMAIL:        'nl_email',
} as const;

// ─── State shape ──────────────────────────────────────────────────────────────

interface UserState {
  /** The user's UUID. Generated once on first launch. */
  uuid: string;

  /** Whether the user has completed onboarding. */
  hasOnboarded: boolean;

  /** Cloud or local storage. */
  storageMode: StorageMode | null;

  /** How local users export notes. Only relevant when storageMode === 'local'. */
  localSaveMode: LocalSaveMode | null;

  /** User-configurable app behaviour preferences. */
  preferences: UserPreferences;

  /** Verified email linked to this UUID for cross-device recovery. Null if not yet linked. */
  email: string | null;
}

interface UserActions {
  /**
   * Hydrates the store from localStorage.
   * Call once on app startup (in the root layout's useEffect).
   */
  initUserStore: () => void;

  /**
   * Complete onboarding: set storageMode, localSaveMode, and persist.
   */
  completeOnboarding: (storageMode: StorageMode, localSaveMode: LocalSaveMode | null) => void;

  /**
   * Update the storage mode (called from Settings page).
   */
  setStorageMode: (mode: StorageMode, localSaveMode?: LocalSaveMode) => void;

  /**
   * Update a single preference key.
   */
  setPreference: <K extends keyof UserPreferences>(key: K, value: UserPreferences[K]) => void;

  /** Persist a verified email that was just linked to this UUID. */
  setEmail: (email: string) => void;

  /**
   * Called after successful email verification when the server returns a
   * UUID that differs from the current one (cross-device recovery).
   * Updates the UUID and email in both store and localStorage.
   * The caller is responsible for clearing the session list afterwards.
   */
  applyRecoveredUuid: (uuid: string, email: string) => void;

  /**
   * Reset everything — used by the "re-onboard" danger zone action.
   */
  resetIdentity: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function readString(key: string): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(key);
}

function writeString(key: string, value: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(key, value);
}

function removeKey(key: string): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(key);
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useUserStore = create<UserState & UserActions>((set) => ({
  // ── Initial state (before hydration) ──────────────────────────────────

  uuid: '',
  hasOnboarded: false,
  storageMode: null,
  localSaveMode: null,
  preferences: defaultUserPreferences,
  email: null,

  // ── Actions ────────────────────────────────────────────────────────────

  initUserStore: () => {
    // Generate or retrieve UUID.
    let uuid = readString(LS_KEYS.UUID);
    if (!uuid) {
      uuid = uuidv4();
      writeString(LS_KEYS.UUID, uuid);
    }

    // Read storage preference.
    const rawStorageMode = readString(LS_KEYS.STORAGE_MODE);
    const storageMode = (rawStorageMode === 'cloud' || rawStorageMode === 'local')
      ? rawStorageMode as StorageMode
      : null;

    const rawLocalMode = readString(LS_KEYS.LOCAL_MODE);
    const localSaveMode = (rawLocalMode === 'download' || rawLocalMode === 'folder')
      ? rawLocalMode as LocalSaveMode
      : null;

    // Read preferences.
    const rawPrefs = readString(LS_KEYS.PREFERENCES);
    let preferences = defaultUserPreferences;
    if (rawPrefs) {
      try {
        preferences = { ...defaultUserPreferences, ...(JSON.parse(rawPrefs) as Partial<UserPreferences>) };
      } catch {
        // Corrupt data — use defaults.
      }
    }
    // Migrate legacy underscore locale codes (e.g. "en_us") to BCP-47 (e.g. "en-US").
    if (preferences.speechLanguage.includes('_')) {
      preferences = { ...preferences, speechLanguage: preferences.speechLanguage.replace('_', '-').replace(/([a-z]{2})-([a-z]{2})/i, (_, l, r) => `${l.toLowerCase()}-${r.toUpperCase()}`) };
      writeString(LS_KEYS.PREFERENCES, JSON.stringify(preferences));
    }

    const hasOnboarded = readString(LS_KEYS.ONBOARDED) === 'true';
    const email        = readString(LS_KEYS.EMAIL);

    set({ uuid, storageMode, localSaveMode, preferences, hasOnboarded, email });
  },

  completeOnboarding: (storageMode, localSaveMode) => {
    writeString(LS_KEYS.STORAGE_MODE, storageMode);
    writeString(LS_KEYS.ONBOARDED, 'true');
    if (localSaveMode) writeString(LS_KEYS.LOCAL_MODE, localSaveMode);
    else removeKey(LS_KEYS.LOCAL_MODE);

    set({ storageMode, localSaveMode, hasOnboarded: true });
  },

  setStorageMode: (mode, localSaveMode) => {
    writeString(LS_KEYS.STORAGE_MODE, mode);
    if (localSaveMode) writeString(LS_KEYS.LOCAL_MODE, localSaveMode);
    else removeKey(LS_KEYS.LOCAL_MODE);

    set({ storageMode: mode, localSaveMode: localSaveMode ?? null });
  },

  setPreference: (key, value) => {
    set((state) => {
      const updated = { ...state.preferences, [key]: value };
      writeString(LS_KEYS.PREFERENCES, JSON.stringify(updated));
      return { preferences: updated };
    });
  },

  setEmail: (email) => {
    writeString(LS_KEYS.EMAIL, email);
    set({ email });
  },

  applyRecoveredUuid: (uuid, email) => {
    writeString(LS_KEYS.UUID, uuid);
    writeString(LS_KEYS.EMAIL, email);
    set({ uuid, email });
  },

  resetIdentity: () => {
    Object.values(LS_KEYS).forEach(removeKey);
    const newUuid = uuidv4();
    writeString(LS_KEYS.UUID, newUuid);
    set({
      uuid: newUuid,
      hasOnboarded: false,
      storageMode: null,
      localSaveMode: null,
      preferences: defaultUserPreferences,
      email: null,
    });
  },
}));
