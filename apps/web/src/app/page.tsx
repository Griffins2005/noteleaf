// Root page. Wraps NotepadShell in AuthGuard so unauthenticated users
// are redirected to /auth before any session data is fetched.

import type { Metadata } from 'next';
import { NotepadShell } from '@/components/layout/NotepadShell';
import { AuthGuard } from '@/components/layout/AuthGuard';

export const metadata: Metadata = {
  title: 'Noteleaf',
  description: 'Be fully present and focus on the conversation. Ambient AI notetaker — capture notes from any meeting on your device. No bot required.',
};

export default function HomePage() {
  return (
    <AuthGuard>
      <NotepadShell />
    </AuthGuard>
  );
}
