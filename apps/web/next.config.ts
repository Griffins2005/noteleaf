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
 * Environment variables (see DEPLOY.local.md or Vercel / Render dashboards):
 *   NEXT_PUBLIC_API_URL  — Fastify API base URL. Default: http://localhost:3002
 *                          In Docker: http://api:3001 (service name resolves via Docker DNS)
 *   NEXT_PUBLIC_WS_URL   — WebSocket URL override. Leave empty for auto-derivation.
 *   NEXT_PUBLIC_APP_URL  — Public-facing app URL for metadata.
 */

import type { NextConfig } from 'next';
import path from 'node:path';

// Server-side rewrite target.
// API_INTERNAL_URL is set by Docker Compose to the Docker-internal service name
// (http://api:3001) so rewrites work inside the container network.
// Outside Docker, falls back to NEXT_PUBLIC_API_URL or localhost.
const API_URL =
  process.env['API_INTERNAL_URL'] ??
  process.env['NEXT_PUBLIC_API_URL'] ??
  'http://localhost:3001';
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
        source: '/api/:path*',
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
