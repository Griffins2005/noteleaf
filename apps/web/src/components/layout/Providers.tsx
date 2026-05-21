/**
 * @file Providers.tsx
 * @description Root client-side providers for the Noteleaf app.
 *
 * Registered in the root layout.tsx. Provides:
 *   - TanStack Query (React Query) client for server state management.
 *   - User store hydration from localStorage on first client render.
 *
 * This must be a Client Component ('use client') because:
 *   - QueryClientProvider uses React context.
 *   - useEffect is needed to hydrate Zustand from localStorage.
 *
 * The QueryClient is created once per session (not per render) using
 * useState to prevent re-instantiation on HMR or parent re-renders.
 *
 * Default query configuration:
 *   - staleTime: 30s — session list doesn't need to refetch constantly.
 *   - retry: 1 — one retry on failure. Don't hammer the API.
 *   - refetchOnWindowFocus: false — prevents jarring refetches when
 *     the user switches tabs while recording.
 */

'use client';

import { useState, useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useUserStore } from '@/store/user.store';

// ─── Query client factory ─────────────────────────────────────────────────────

function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,          // 30 seconds before data is considered stale
        retry: 1,                   // Retry once on failure
        refetchOnWindowFocus: false, // Don't refetch when user switches tabs
      },
      mutations: {
        retry: 0,                   // Don't retry mutations — let callers handle errors
      },
    },
  });
}

// ─── User store hydrator ──────────────────────────────────────────────────────

/**
 * Hydrates the Zustand user store from localStorage on first client render.
 * This is a separate component to isolate the useEffect from the provider tree.
 */
function UserStoreHydrator() {
  const initUserStore = useUserStore((state) => state.initUserStore);

  useEffect(() => {
    // Called once on mount — reads localStorage and populates the store.
    initUserStore();
  }, [initUserStore]);

  return null;
}

// ─── Providers component ──────────────────────────────────────────────────────

export interface ProvidersProps {
  children: React.ReactNode;
}

export function Providers({ children }: ProvidersProps) {
  // useState ensures the QueryClient is created once per component lifecycle,
  // not on every render.
  const [queryClient] = useState(() => makeQueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <UserStoreHydrator />
      {children}
    </QueryClientProvider>
  );
}
