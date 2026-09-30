'use client';

import { useEffect } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth.store';

function BootScreen() {
  return (
    <div
      className="h-screen w-screen bg-[var(--nl-color-paper-bg)]"
      aria-busy="true"
      aria-label="Loading"
    />
  );
}

const NotepadShell = dynamic(
  () => import('@/components/layout/NotepadShell').then((m) => ({ default: m.NotepadShell })),
  { ssr: false, loading: () => <BootScreen /> },
);

export function HomeApp() {
  const { user, isInitialized } = useAuthStore();
  const router = useRouter();

  useEffect(() => {
    void import('@/components/layout/NotepadShell');
  }, []);

  useEffect(() => {
    if (isInitialized && !user) {
      router.replace('/auth');
    }
  }, [user, isInitialized, router]);

  if (!isInitialized || !user) {
    return <BootScreen />;
  }

  return <NotepadShell />;
}
