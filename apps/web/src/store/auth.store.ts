// Auth store — holds the current user and token expiry in memory only.
// Tokens live in httpOnly cookies managed by the server; the client never reads them.
// On init, GET /api/auth/me is called to restore session from an existing cookie.
// A proactive refresh fires 60 seconds before the access token expires.

import { create } from 'zustand';
import { useUserStore } from './user.store';

export interface AuthUser {
  id:     string;
  email:  string | null;
  name:   string | null;
  avatar?: string | null;
}

interface AuthState {
  user:           AuthUser | null;
  tokenExpiresAt: number | null;   // unix ms when the access token expires
  isInitialized:  boolean;
}

interface AuthActions {
  initAuthStore:      () => Promise<void>;
  setAuth:            (user: AuthUser, tokenExpiresAt: number) => void;
  clearAuth:          () => void;
  refreshAccessToken: () => Promise<boolean>;
  signOut:            () => Promise<void>;
}

let refreshTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleProactiveRefresh(expiresAt: number, refresh: () => Promise<boolean>): void {
  if (refreshTimer) clearTimeout(refreshTimer);
  const delay = expiresAt - Date.now() - 60_000; // fire 60s before expiry
  if (delay > 0) {
    refreshTimer = setTimeout(() => { void refresh(); }, delay);
  }
}

export const useAuthStore = create<AuthState & AuthActions>((set, get) => ({
  user:           null,
  tokenExpiresAt: null,
  isInitialized:  false,

  initAuthStore: async () => {
    try {
      const res = await fetch('/api/auth/me', { credentials: 'include' });

      if (res.ok) {
        const json = (await res.json()) as {
          success: boolean;
          data?: {
            id: string; email: string | null; name: string | null;
            avatar?: string | null; retentionDays?: number | null; tokenExpiresAt: number;
          };
        };

        if (json.success && json.data) {
          const { tokenExpiresAt, retentionDays, ...user } = json.data;
          if (retentionDays !== undefined) {
            useUserStore.getState().setPreference('retentionDays', retentionDays);
          }
          set({ user, tokenExpiresAt, isInitialized: true });
          scheduleProactiveRefresh(tokenExpiresAt, get().refreshAccessToken);
          return;
        }
      }

      // Access token expired — attempt a silent refresh via the refresh cookie.
      if (res.status === 401) {
        const refreshed = await get().refreshAccessToken();
        if (refreshed) return; // setAuth inside refreshAccessToken sets isInitialized
      }
    } catch { /* network error — treat as signed out */ }

    set({ user: null, tokenExpiresAt: null, isInitialized: true });
  },

  setAuth: (user, tokenExpiresAt) => {
    set({ user, tokenExpiresAt, isInitialized: true });
    scheduleProactiveRefresh(tokenExpiresAt, get().refreshAccessToken);
  },

  clearAuth: () => {
    if (refreshTimer) { clearTimeout(refreshTimer); refreshTimer = null; }
    set({ user: null, tokenExpiresAt: null, isInitialized: true });
  },

  signOut: async () => {
    const { clearAuth } = get();
    try {
      await fetch('/api/auth/signout', { method: 'POST', credentials: 'include' });
    } catch { /* non-fatal — clear locally regardless */ }
    clearAuth();
  },

  refreshAccessToken: async () => {
    const { setAuth, clearAuth } = get();
    try {
      const res = await fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' });

      if (!res.ok) {
        clearAuth();
        return false;
      }

      const json = (await res.json()) as {
        success: boolean;
        data?: {
          user: { id: string; email: string | null; name: string | null };
          tokenExpiresAt: number;
        };
      };

      if (!json.success || !json.data) {
        clearAuth();
        return false;
      }

      setAuth(json.data.user, json.data.tokenExpiresAt);
      return true;
    } catch {
      clearAuth();
      return false;
    }
  },
}));
