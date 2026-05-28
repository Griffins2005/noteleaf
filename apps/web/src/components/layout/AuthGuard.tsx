'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth.store';

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { token, isInitialized } = useAuthStore();
  const router = useRouter();

  useEffect(() => {
    if (isInitialized && !token) {
      router.replace('/auth');
    }
  }, [token, isInitialized, router]);

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

  if (!token) return null;

  return <>{children}</>;
}
