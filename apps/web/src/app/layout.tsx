/**
 * @file layout.tsx
 * @description Next.js root layout — applied to every page in the app.
 *
 * Server component. Responsibilities:
 *   - Load Google Fonts (DM Mono + Fraunces) via Next.js font optimisation.
 *   - Import global CSS tokens and resets.
 *   - Wrap the app in client-side Providers (React Query, store hydration).
 *   - Set HTML lang attribute and document metadata.
 *
 * Font choices:
 *   - DM Mono: The app's primary typeface. Monospace conveys precision and
 *     structure — appropriate for a note-taking tool that classifies speech.
 *   - Fraunces: Optical-size variable serif used for the logo, session titles,
 *     and the recording timer. Creates a warm, editorial contrast to the mono.
 */

import type { Metadata, Viewport } from 'next';
import { DM_Mono, Fraunces } from 'next/font/google';
import { Providers } from '@/components/layout/Providers';
import '@/styles/tokens.css';
import '@/styles/globals.css';

// ─── Fonts ────────────────────────────────────────────────────────────────────

const dmMono = DM_Mono({
  subsets: ['latin'],
  weight: ['300', '400', '500'],
  style: ['normal', 'italic'],
  variable: '--font-dm-mono',
  display: 'swap',
});

const fraunces = Fraunces({
  subsets: ['latin'],
  weight: ['300', '500', '700'],
  style: ['normal', 'italic'],
  variable: '--font-fraunces',
  display: 'swap',
});

// ─── Metadata ─────────────────────────────────────────────────────────────────

export const metadata: Metadata = {
  title: {
    template: '%s — Noteleaf',
    default: 'Noteleaf',
  },
  description: 'Capture. Understand. Grow. Ambient AI notetaker that listens, classifies, and summarises your meetings.',
  keywords: ['meeting notes', 'speech to text', 'AI notetaker', 'local', 'ambient'],
  icons: {
    icon: '/logo.png',
    apple: '/logo.png',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

// ─── Layout ───────────────────────────────────────────────────────────────────

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${dmMono.variable} ${fraunces.variable}`}
    >
      <body className="font-mono bg-[var(--nl-color-paper-bg)] text-[var(--nl-color-ink-primary)] antialiased overflow-hidden">
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
