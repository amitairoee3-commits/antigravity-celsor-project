'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { CachedSignal } from '@/lib/cache/signalCache';

// ─── Query Keys ───────────────────────────────────────────────────────────────

export const signalKeys = {
  all:    () => ['signals'] as const,
  list:   (chain: string, minScore: number, highOnly: boolean) =>
    ['signals', 'list', chain, minScore, highOnly] as const,
};

// ─── Fetcher ──────────────────────────────────────────────────────────────────

async function fetchSignals(
  chain: string,
  minScore: number,
  highOnly: boolean,
  count: number,
): Promise<{ signals: CachedSignal[]; timestamp: number; count: number; plan: string }> {
  const params = new URLSearchParams({
    count:    String(count),
    chain,
    minScore: String(minScore),
    highOnly: String(highOnly),
  });
  const res = await fetch(`/api/signals?${params}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function triggerScanFn(chain: string) {
  const res = await fetch('/api/signals', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ chain }),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error ?? 'Scan failed');
  return data;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

interface UseSignalFeedOptions {
  count?:          number;
  chain?:          string;
  minScore?:       number;
  highOnly?:       boolean;
  pollIntervalMs?: number;
}

export function useSignalFeed(opts: UseSignalFeedOptions = {}) {
  const {
    count          = 50,
    chain          = 'all',
    minScore       = 0,
    highOnly       = false,
    pollIntervalMs = 30_000,
  } = opts;

  const queryClient = useQueryClient();

  // Main signals query — TanStack handles caching, deduplication, background refetch
  const {
    data,
    isLoading,
    isRefetching,
    error,
    refetch,
    dataUpdatedAt,
  } = useQuery({
    queryKey: signalKeys.list(chain, minScore, highOnly),
    queryFn:  () => fetchSignals(chain, minScore, highOnly, count),

    // Auto-refresh every 30s by default
    refetchInterval: pollIntervalMs,

    // Refetch when window regains focus (user comes back to tab)
    refetchOnWindowFocus: true,

    // Keep previous data visible while fetching new data (no flash of empty)
    placeholderData: (previousData) => previousData,

    // Data is considered fresh for 15s — won't refetch within that window
    staleTime: 15_000,

    // Keep data in cache for 5 minutes after component unmounts
    gcTime: 5 * 60 * 1000,

    // Retry failed requests twice with exponential backoff
    retry:      2,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10_000),
  });

  // Scan mutation — triggers a fresh on-chain scan then invalidates the cache
  const scanMutation = useMutation({
    mutationFn: triggerScanFn,
    onSuccess: () => {
      // Wait for pipeline to finish (avg 5-8s) then refetch
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: signalKeys.all() });
      }, 7_000);
    },
  });

  const triggerScan = (scanChain = 'all') => scanMutation.mutate(scanChain);

  return {
    signals:     data?.signals  ?? [],
    totalCount:  data?.count    ?? 0,
    plan:        data?.plan     ?? 'free',
    isLoading,
    isRefetching,
    isScanning:  scanMutation.isPending,
    error:       error ? String((error as Error).message) : null,
    lastUpdated: dataUpdatedAt || null,
    refetch,
    triggerScan,
  };
}
