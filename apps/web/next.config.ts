/**
 * @file next.config.ts
 * @description Next.js 15 configuration.
 *
 * Key decisions:
 *   - strictMode: true — catches double-invocation bugs in dev early.
 *   - rewrites: /api/* → Fastify API (dev, Docker, and Vercel). HTTP auth and REST work
 *     through the proxy so cookies stay on the app origin. WebSockets are not proxied —
 *     browser STT uses the Web Speech API by default; server STT needs a direct API URL.
 *   - No experimental features — stability over cutting edge for a v1 product.
 *
 * Environment variables (see README Deployment + apps/web/vercel.json):
 *   API_INTERNAL_URL     — Vercel/rewrite only: https://noteleaf-api.onrender.com (never the Vercel URL)
 *   NEXT_PUBLIC_APP_URL  — https://noteleaf.vercel.app in production
 *   NEXT_PUBLIC_API_URL  — same as app URL in production (browser uses /api rewrites)
 *   NEXT_PUBLIC_WS_URL   — optional; browser STT default needs no WebSocket
 */

import type { NextConfig } from 'next';
import path from 'node:path';

// Server-side rewrite target only — never the browser-facing Vercel URL.
// Falling back to NEXT_PUBLIC_API_URL on Vercel causes INFINITE_LOOP (508) when both
// are https://noteleaf.vercel.app.
function resolveApiRewriteTarget(): string {
  const internal = process.env['API_INTERNAL_URL']?.replace(/\/$/, '');
  const publicApp =
    process.env['NEXT_PUBLIC_APP_URL']?.replace(/\/$/, '') ??
    (process.env['VERCEL_URL'] ? `https://${process.env['VERCEL_URL']}` : undefined);

  if (process.env['VERCEL']) {
    if (!internal) {
      throw new Error(
        'API_INTERNAL_URL must be set on Vercel to your backend host ' +
          '(e.g. https://noteleaf-api.onrender.com). ' +
          'Do not use https://noteleaf.vercel.app.',
      );
    }
    if (publicApp && internal === publicApp) {
      throw new Error(
        'API_INTERNAL_URL must not equal NEXT_PUBLIC_APP_URL — that causes a rewrite loop (508).',
      );
    }
    return internal;
  }

  return (
    internal ??
    process.env['NEXT_PUBLIC_API_URL']?.replace(/\/$/, '') ??
    'http://localhost:3001'
  );
}

const API_URL = resolveApiRewriteTarget();
const monorepoRoot = path.resolve(process.cwd(), '../..');

const config: NextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: monorepoRoot,
  turbopack: {
    root: monorepoRoot,
  },

  /**
   * Standalone output — Docker only. Vercel uses its own output layout.
   */
  ...(process.env['VERCEL'] ? {} : { output: 'standalone' as const }),

  /**
   * Proxy /api/* HTTP requests to the Fastify API.
   *
   * Development (non-Docker): Next.js dev server → http://localhost:3002
   * Docker Compose:           Next.js container  → http://api:3001 (internal Docker DNS)
   *
   * WebSocket connections (/api/stt/stream) are NOT proxied by Next.js rewrites —
   * the browser connects directly to the API URL. In Docker, this means the browser
   * needs to reach the API's published port (3001), not the internal Docker DNS name.
   * The WS URL is derived client-side in useSTTWebSocket.ts using window.location,
   * which correctly uses the browser's host, not the internal Docker hostname.
   *
   * Production (non-Docker): Set up your reverse proxy (nginx, Caddy, AWS ALB) to
   * route /api/* to the API service. Remove these rewrites or keep them — they are
   * no-ops when the destination is the same origin.
   */
  async rewrites() {
    return [
      {
        // Google start + callback stay on Next so the browser never loads Render's boot page.
        source: '/api/:path((?!auth/google).*)',
        destination: `${API_URL}/api/:path*`,
      },
    ];
  },

  /**
   * Customise HTTP response headers for security.
   * The API server also sets these via @fastify/helmet for API responses.
   */
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ];
  },
};

export default config;
