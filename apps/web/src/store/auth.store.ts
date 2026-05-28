// Auth store — holds the JWT access token, refresh token, and decoded user.
// Both tokens are persisted in localStorage so they survive page reloads.
// On init, the access token is decoded client-side to populate the user object
// without an extra API round-trip. If the token is expired, auth is cleared.

import { create } from 'zustand';

const LS_TOKEN         = 'nl_token';
const LS_REFRESH_TOKEN = 'nl_refresh_token';

export interface AuthUser {
  id:     string;
  email:  string | null;
  name:   string | null;
  avatar?: string | null;
}

interface AuthState {
  token:         string | null;
  refreshToken:  string | null;
  user:          AuthUser | null;
  isInitialized: boolean;
}

interface AuthActions {
  initAuthStore:       () => void;
  setAuth:             (token: string, refreshToken: string) => void;
  clearAuth:           () => void;
  refreshAccessToken:  () => Promise<boolean>;
  signOut:             () => Promise<void>;
}

function readToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(LS_TOKEN);
}

function readRefreshToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(LS_REFRESH_TOKEN);
}

function parseJwt(token: string): AuthUser | null {
  try {
    const raw     = token.split('.')[1] ?? '';
    const payload = JSON.parse(atob(raw.replace(/-/g, '+').replace(/_/g, '/'))) as Record<string, unknown>;
    if (!payload['userId'] || (payload['exp'] as number) * 1000 < Date.now()) return null;
    return {
      id:    payload['userId'] as string,
      email: (payload['email'] as string | null) ?? null,
      name:  (payload['name']  as string | null) ?? null,
    };
  } catch {
    return null;
  }
}

export const useAuthStore = create<AuthState & AuthActions>((set, get) => ({
  token:         null,
  refreshToken:  null,
  user:          null,
  isInitialized: false,

  initAuthStore: () => {
    const token        = readToken();
    const refreshToken = readRefreshToken();

    if (!token) {
      set({ token: null, refreshToken: null, user: null, isInitialized: true });
      return;
    }

    const user = parseJwt(token);
    if (!user) {
      localStorage.removeItem(LS_TOKEN);
      localStorage.removeItem(LS_REFRESH_TOKEN);
      set({ token: null, refreshToken: null, user: null, isInitialized: true });
      return;
    }

    set({ token, refreshToken, user, isInitialized: true });
  },

  setAuth: (token, refreshToken) => {
    const user = parseJwt(token);
    if (!user) return;
    localStorage.setItem(LS_TOKEN, token);
    localStorage.setItem(LS_REFRESH_TOKEN, refreshToken);
    set({ token, refreshToken, user });
  },

  clearAuth: () => {
    localStorage.removeItem(LS_TOKEN);
    localStorage.removeItem(LS_REFRESH_TOKEN);
    set({ token: null, refreshToken: null, user: null });
  },

  signOut: async () => {
    const { refreshToken, clearAuth } = get();
    if (refreshToken) {
      try {
        await fetch('/api/auth/signout', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ refreshToken }),
        });
      } catch { /* non-fatal — clear locally regardless */ }
    }
    clearAuth();
  },

  refreshAccessToken: async () => {
    const { refreshToken, clearAuth, setAuth } = get();
    if (!refreshToken) return false;

    try {
      const res = await fetch('/api/auth/refresh', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ refreshToken }),
      });

      if (!res.ok) {
        clearAuth();
        return false;
      }

      const json = (await res.json()) as {
        success: boolean;
        data?: { token: string; refreshToken: string };
      };

      if (!json.success || !json.data) {
        clearAuth();
        return false;
      }

      setAuth(json.data.token, json.data.refreshToken);
      return true;
    } catch {
      clearAuth();
      return false;
    }
  },
}));
