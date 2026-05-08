'use client';

import { useState, useEffect, useCallback } from 'react';

interface EngineStatus {
  status: 'online' | 'offline' | 'loading';
  chainsMonitored: number;
  chains: string[];
  uptime: number | null;
  totalScansRun: number;
  lastScanAt: number | null;
  cache: {
    usingFallback: boolean;
    totalSignalsCached: number;
    highConvictionSignals: number;
    chainBreakdown: Record<string, number>;
  };
}

export function useEngineStatus(pollIntervalMs = 15_000) {
  const [status, setStatus] = useState<EngineStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetch = useCallback(async () => {
    try {
      const res = await window.fetch('/api/engine');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setStatus({
        status: 'online',
        chainsMonitored: data.engine?.chainsMonitored ?? 5,
        chains: data.engine?.chains ?? [],
        uptime: data.engine?.uptime ?? null,
        totalScansRun: data.engine?.totalScansRun ?? 0,
        lastScanAt: data.engine?.lastScanAt ?? null,
        cache: data.cache ?? {
          usingFallback: true,
          totalSignalsCached: 0,
          highConvictionSignals: 0,
          chainBreakdown: {},
        },
      });
    } catch {
      setStatus(prev => prev ? { ...prev, status: 'offline' } : null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { fetch(); }, [fetch]);
  useEffect(() => {
    const interval = setInterval(fetch, pollIntervalMs);
    return () => clearInterval(interval);
  }, [fetch, pollIntervalMs]);

  const triggerScan = useCallback(async () => {
    await window.fetch('/api/engine', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'scan' }),
    });
    setTimeout(fetch, 5000);
  }, [fetch]);

  return { status, isLoading, triggerScan, refetch: fetch };
}
