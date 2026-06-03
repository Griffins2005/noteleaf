'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth.store';

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, isInitialized } = useAuthStore();
  const router = useRouter();

  useEffect(() => {
    if (isInitialized && !user) {
      router.replace('/auth');
    }
  }, [user, isInitialized, router]);

  if (!isInitialized) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-[var(--nl-color-paper-bg)]">
        <div
          className="text-sm text-[var(--nl-color-ink-tertiary)]"
          style={{ fontFamily: 'var(--nl-font-mono)' }}
        >
          Loading…
        </div>
      </div>
    );
  }

  if (!user) return null;

  return <>{children}</>;
}
