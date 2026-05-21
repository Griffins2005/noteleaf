/**
 * @file http.client.ts
 * @description Base HTTP client for all Noteleaf API calls.
 *
 * Design decisions:
 *   - Uses native fetch (no Axios) — available in Node 18+ and all modern browsers.
 *   - Automatically injects the x-user-uuid header from the user store.
 *   - Unwraps ApiResponse<T> envelopes so callers receive T directly.
 *   - Throws typed HttpError on non-2xx responses.
 *   - All methods are generic and type-safe.
 *
 * Usage:
 *   import { http } from '@/lib/http.client';
 *   const sessions = await http.get<SessionListItem[]>('/api/sessions');
 *   const session = await http.post<Session>('/api/sessions', { id, title });
 *
 * Error handling:
 *   All methods throw HttpError on failure. Callers should catch and handle.
 *   React Query will automatically retry failed requests based on its config.
 */

import type { ApiResponse, ApiError } from '@noteleaf/shared-types';

// ─── Error type ───────────────────────────────────────────────────────────────

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

// ─── Base URL ─────────────────────────────────────────────────────────────────

const BASE_URL = '';  // Relative URLs — Next.js rewrites handle /api/* proxying

// ─── UUID injection ───────────────────────────────────────────────────────────

/**
 * Reads the user's UUID from localStorage.
 * We read directly instead of from the Zustand store to avoid
 * creating a circular dependency (store → client → store).
 */
function getUserUuid(): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem('nl_uuid') ?? '';
}

// ─── Core request function ────────────────────────────────────────────────────

async function request<T>(
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  path: string,
  body?: unknown,
): Promise<T> {
  const uuid = getUserUuid();

  const headers: Record<string, string> = {
    'Accept': 'application/json',
  };

  // Only send Content-Type when there is a body to parse.
  // Sending Content-Type: application/json with an empty body causes
  // Fastify's JSON parser to reject the request with FST_ERR_CTP_EMPTY_JSON_BODY.
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  if (uuid) {
    headers['x-user-uuid'] = uuid;
  }

  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

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

  // data should always be present when success === true.
  return json.data as T;
}

// ─── Typed methods ────────────────────────────────────────────────────────────

export const http = {
  get: <T>(path: string): Promise<T> => request<T>('GET', path),
  post: <T>(path: string, body: unknown): Promise<T> => request<T>('POST', path, body),
  patch: <T>(path: string, body: unknown): Promise<T> => request<T>('PATCH', path, body),
  delete: <T>(path: string): Promise<T> => request<T>('DELETE', path),
};
