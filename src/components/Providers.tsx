'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { useAutonomousAlerts } from '@/hooks/usePushAlerts';
import { UserProvider } from '@/contexts/UserContext';

// Silent background engine — runs on every page, fires alerts automatically
function AutonomousEngine() {
  useAutonomousAlerts(); // 24/7 scanning, no UI
  return null;
}

export default function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60 * 1000,
        refetchOnWindowFocus: false,
      },
    },
  }));

  return (
    <QueryClientProvider client={queryClient}>
      <UserProvider>
        <AutonomousEngine />
        {children}
      </UserProvider>
    </QueryClientProvider>
  );
}

