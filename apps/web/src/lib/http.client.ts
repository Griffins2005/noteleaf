/**
 * @file http.client.ts
 * @description Base HTTP client for all Noteleaf API calls.
 *
 * Design decisions:
 *   - Uses native fetch (no Axios) — available in Node 18+ and all modern browsers.
 *   - Automatically injects the Authorization: Bearer header from localStorage.
 *   - On a 401 response, tries to silently refresh the access token once via the
 *     refresh token. If the refresh succeeds the original request is retried. If
 *     it fails, clearAuth() is called and the 401 error is re-thrown so the
 *     AuthGuard / router redirects the user to sign-in.
 *   - A module-level promise de-duplicates concurrent refresh calls so that
 *     multiple simultaneous 401s only trigger one refresh round-trip.
 *   - Unwraps ApiResponse<T> envelopes so callers receive T directly.
 *   - Throws typed HttpError on non-2xx responses.
 */

import type { ApiResponse, ApiError } from '@noteleaf/shared-types';
import { useAuthStore } from '@/store/auth.store';

// Error type

export class HttpError extends Error {
  public readonly statusCode: number;
  public readonly apiError: ApiError;

  constructor(statusCode: number, apiError: ApiError) {
    super(apiError.message);
    this.name = 'HttpError';
    this.statusCode = statusCode;
    this.apiError = apiError;
  }
}

// Base URL

const BASE_URL = '';  // Relative URLs — Next.js rewrites handle /api/* proxying

// Auth token helpers

function getToken(): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem('nl_token') ?? '';
}

// Token refresh (de-duplicated)

let refreshPromise: Promise<boolean> | null = null;

async function tryRefresh(): Promise<boolean> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = useAuthStore.getState().refreshAccessToken().finally(() => {
    refreshPromise = null;
  });

  return refreshPromise;
}

// Core request function

async function request<T>(
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  path: string,
  body?: unknown,
  isRetry = false,
): Promise<T> {
  const token = getToken();

  const headers: Record<string, string> = {
    'Accept': 'application/json',
  };

  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  // Transparent token refresh on 401 — attempt once, never on the refresh call itself.
  if (response.status === 401 && !isRetry && typeof window !== 'undefined') {
    const refreshed = await tryRefresh();
    if (refreshed) {
      return request<T>(method, path, body, true);
    }
    // Refresh failed — clearAuth was already called inside refreshAccessToken.
    // Throw so callers / React Query see the 401.
  }

  const json = (await response.json()) as ApiResponse<T>;

  if (!response.ok || !json.success) {
    throw new HttpError(
      response.status,
      json.error ?? {
        code: 'UNKNOWN_ERROR',
        message: `Request failed with status ${response.status}`,
      },
    );
  }

  return json.data as T;
}

// Typed methods

export const http = {
  get:    <T>(path: string)                  => request<T>('GET',    path),
  post:   <T>(path: string, body: unknown)   => request<T>('POST',   path, body),
  patch:  <T>(path: string, body: unknown)   => request<T>('PATCH',  path, body),
  delete: <T>(path: string)                  => request<T>('DELETE', path),
};
