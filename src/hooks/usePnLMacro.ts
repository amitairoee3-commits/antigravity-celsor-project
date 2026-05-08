'use client';

/**
 * CELSOR — TanStack Query hooks for PnL and Macro data
 *
 * usePnLDashboard: System alpha, open positions, trade history
 * useMacroSnapshot: Fear & Greed + pipeline mode + wallet leaderboard
 *
 * Both use:
 *  - Smart stale/cache times appropriate to data freshness
 *  - Background refetch (PnL every 60s, Macro every 5 minutes)
 *  - No loading flash (placeholderData keeps previous data visible)
 */

import { useQuery } from '@tanstack/react-query';
import type { SystemAlpha, TrackedPosition } from '@/lib/engine/pnlTracker';
import type { MacroSnapshot } from '@/lib/engine/macroController';
import type { WalletReputation } from '@/lib/engine/walletReputation';

// ─── PnL Dashboard Hook ───────────────────────────────────────────────────────

interface PnLResponse {
  ok:             boolean;
  alpha:          SystemAlpha | null;
  openPositions:  TrackedPosition[];
  recentHistory:  TrackedPosition[];
  timestamp:      number;
}

async function fetchPnL(): Promise<PnLResponse> {
  const res = await fetch('/api/pnl');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export function usePnLDashboard() {
  const { data, isLoading, isRefetching, error, refetch, dataUpdatedAt } = useQuery({
    queryKey:     ['celsor', 'pnl', 'dashboard'],
    queryFn:      fetchPnL,
    refetchInterval: 60_000,          // Check P&L every 60s
    refetchOnWindowFocus: true,
    staleTime:    30_000,
    gcTime:       10 * 60 * 1000,
    placeholderData: (prev) => prev,
    retry: 2,
    retryDelay: 2000,
  });

  return {
    alpha:          data?.alpha   ?? null,
    openPositions:  data?.openPositions  ?? [],
    recentHistory:  data?.recentHistory  ?? [],
    isLoading,
    isRefetching,
    error:          error ? (error as Error).message : null,
    lastUpdated:    dataUpdatedAt || null,
    refetch,
  };
}

// ─── Macro Snapshot Hook ──────────────────────────────────────────────────────

interface MacroResponse {
  ok:          boolean;
  macro:       MacroSnapshot | null;
  leaderboard: WalletReputation[];
  timestamp:   number;
}

async function fetchMacro(): Promise<MacroResponse> {
  const res = await fetch('/api/macro');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export function useMacroSnapshot() {
  const { data, isLoading, isRefetching, error, refetch } = useQuery({
    queryKey:     ['celsor', 'macro'],
    queryFn:      fetchMacro,
    refetchInterval:  5 * 60_000,   // Macro data refreshes every 5 minutes
    refetchOnWindowFocus: false,     // Don't spam CoinGecko on every focus
    staleTime:    4 * 60_000,
    gcTime:       15 * 60 * 1000,
    placeholderData: (prev) => prev,
    retry: 1,
  });

  return {
    macro:       data?.macro       ?? null,
    leaderboard: data?.leaderboard ?? [],
    isLoading,
    isRefetching,
    error:       error ? (error as Error).message : null,
    refetch,
  };
}
