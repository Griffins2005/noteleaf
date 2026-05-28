// Root client providers. Boots React Query and hydrates both Zustand stores
// (auth first, then user prefs) from localStorage on the first client render.

'use client';

import { useState, useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useUserStore } from '@/store/user.store';
import { useAuthStore } from '@/store/auth.store';


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

function StoreHydrator() {
  const initUserStore = useUserStore((state) => state.initUserStore);
  const initAuthStore = useAuthStore((state) => state.initAuthStore);

  useEffect(() => {
    initAuthStore();
    initUserStore();
  }, [initAuthStore, initUserStore]);

  return null;
}


export interface ProvidersProps {
  children: React.ReactNode;
}

export function Providers({ children }: ProvidersProps) {
  const [queryClient] = useState(() => makeQueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <StoreHydrator />
      {children}
    </QueryClientProvider>
  );
}
