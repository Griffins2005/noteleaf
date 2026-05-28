// User store — holds UI preferences that are persisted to localStorage.
// Session data and user identity live in session.store and auth.store respectively.

import { create } from 'zustand';
import type { UserPreferences } from '@noteleaf/shared-types';
import { defaultUserPreferences } from '@noteleaf/shared-types';

const LS_PREFS = 'nl_prefs';

function readString(key: string): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(key);
}

function writeString(key: string, value: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(key, value);
}

interface UserState {
  preferences: UserPreferences;
}

interface UserActions {
  initUserStore: () => void;
  setPreference: <K extends keyof UserPreferences>(key: K, value: UserPreferences[K]) => void;
}

export const useUserStore = create<UserState & UserActions>((set) => ({
  preferences: defaultUserPreferences,

  initUserStore: () => {
    const rawPrefs = readString(LS_PREFS);
    let preferences = defaultUserPreferences;
    if (rawPrefs) {
      try {
        preferences = { ...defaultUserPreferences, ...(JSON.parse(rawPrefs) as Partial<UserPreferences>) };
      } catch {
        // Corrupt data — use defaults.
      }
    }
    // Migrate legacy underscore locale codes (e.g. "en_us" → "en-US").
    if (preferences.speechLanguage.includes('_')) {
      preferences = {
        ...preferences,
        speechLanguage: preferences.speechLanguage
          .replace('_', '-')
          .replace(/([a-z]{2})-([a-z]{2})/i, (_, l: string, r: string) => `${l.toLowerCase()}-${r.toUpperCase()}`),
      };
      writeString(LS_PREFS, JSON.stringify(preferences));
    }
    set({ preferences });
  },

  setPreference: (key, value) => {
    set((state) => {
      const updated = { ...state.preferences, [key]: value };
      writeString(LS_PREFS, JSON.stringify(updated));
      return { preferences: updated };
    });
  },
}));
