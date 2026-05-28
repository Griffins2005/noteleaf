// Root page. Wraps NotepadShell in AuthGuard so unauthenticated users
// are redirected to /auth before any session data is fetched.

import type { Metadata } from 'next';
import { NotepadShell } from '@/components/layout/NotepadShell';
import { AuthGuard } from '@/components/layout/AuthGuard';

export const metadata: Metadata = {
  title: 'Noteleaf',
  description: 'Ambient AI notetaker. Listens locally, never joins your meeting.',
};

export default function HomePage() {
  return (
    <AuthGuard>
      <NotepadShell />
    </AuthGuard>
  );
}
