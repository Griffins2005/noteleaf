/**
 * @file page.tsx
 * @description Root page — the app entry point.
 *
 * This is a Server Component. Its only job is to render the NotepadShell
 * client component. All interactive logic lives in NotepadShell.
 *
 * The page intentionally has no server-side data fetching. Session data
 * is loaded client-side (from localStorage or the API) because:
 *   1. Sessions are user-specific and require the UUID from localStorage.
 *   2. The UUID is not available server-side (no auth, no cookies).
 *   3. SSR for session data would require cookies or URL params — unnecessary
 *      complexity for a v1 product.
 */

import type { Metadata } from 'next';
import { NotepadShell } from '@/components/layout/NotepadShell';

export const metadata: Metadata = {
  title: 'Noteleaf',
  description: 'Ambient AI notetaker. Listens locally, never joins your meeting.',
};

export default function HomePage() {
  return <NotepadShell />;
}
