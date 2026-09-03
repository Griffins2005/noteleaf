// Root layout. Loads fonts, global CSS tokens, and wraps every page in
// the React Query + Zustand provider tree.

import type { Metadata, Viewport } from 'next';
import { DM_Mono, Fraunces } from 'next/font/google';
import { Providers } from '@/components/layout/Providers';
import '@/styles/tokens.css';
import '@/styles/globals.css';


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


export const metadata: Metadata = {
  title: {
    template: '%s — Noteleaf',
    default: 'Noteleaf',
  },
  description: 'Be fully present and focus on the conversation. Ambient AI notetaker that listens through your mic — no bot joins your meeting.',
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


export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${dmMono.variable} ${fraunces.variable}`}
    >
      <body className="font-mono bg-[var(--nl-color-paper-bg)] text-[var(--nl-color-ink-primary)] antialiased">
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
