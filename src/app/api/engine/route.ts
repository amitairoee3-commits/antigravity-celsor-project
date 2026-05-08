/**
 * CELSOR NEXUS — /api/engine
 * Engine status, health, and manual trigger endpoints.
 */

import { NextRequest, NextResponse } from 'next/server';
import { isUsingFallback } from '@/lib/cache/redis';
import { getRecentSignals } from '@/lib/cache/signalCache';
import { enqueueScan } from '@/lib/queue/queues';
import { ALL_CHAINS } from '@/lib/engine/signalPipeline';

// Track engine state
let engineStartedAt: number | null = null;
let totalScansRun = 0;
let lastScanAt: number | null = null;

export async function GET(_req: NextRequest) {
  try {
    const recentSignals = await getRecentSignals(200);
    const highConviction = recentSignals.filter(s => s.convictionScore >= 75);

    const chainCounts: Record<string, number> = {};
    for (const sig of recentSignals) {
      chainCounts[sig.chain] = (chainCounts[sig.chain] ?? 0) + 1;
    }

    return NextResponse.json({
      ok: true,
      engine: {
        status: 'online',
        chainsMonitored: ALL_CHAINS.length,
        chains: ALL_CHAINS,
        startedAt: engineStartedAt,
        uptime: engineStartedAt ? Date.now() - engineStartedAt : null,
        totalScansRun,
        lastScanAt,
      },
      cache: {
        usingFallback: isUsingFallback(),
        totalSignalsCached: recentSignals.length,
        highConvictionSignals: highConviction.length,
        chainBreakdown: chainCounts,
      },
      timestamp: Date.now(),
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const action = body.action ?? 'scan';

    if (action === 'scan') {
      if (!engineStartedAt) engineStartedAt = Date.now();
      totalScansRun++;
      lastScanAt = Date.now();

      const jobId = await enqueueScan('all', 'manual');
      return NextResponse.json({ ok: true, action: 'scan', jobId });
    }

    return NextResponse.json({ ok: false, error: `Unknown action: ${action}` }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
