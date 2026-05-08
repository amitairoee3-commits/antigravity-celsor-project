/**
 * CELSOR — /api/signals
 * GET:  Plan-gated signal feed (Redis → Supabase fallback)
 * POST: Trigger manual scan (non-blocking background execution)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getRecentSignals, getHighConvictionSignals, getSignalsForUser } from '@/lib/db/signalRepository';
import { rateLimit } from '@/lib/db/redis';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const count    = Math.min(parseInt(searchParams.get('count')   ?? '50'), 200);
    const minScore = parseInt(searchParams.get('minScore')          ?? '0');
    const chain    = searchParams.get('chain')                      ?? 'all';
    const highOnly = searchParams.get('highOnly')                   === 'true';

    // Read plan from middleware header (set by middleware.ts after session check)
    const userId = req.headers.get('x-celsor-user-id');
    const plan   = (req.headers.get('x-celsor-plan') ?? 'free') as 'free' | 'basic' | 'pro';

    let signals;

    if (userId && plan) {
      // Authenticated: apply plan gating
      signals = await getSignalsForUser(userId, plan, { chain, minScore, count });
    } else if (highOnly) {
      signals = await getHighConvictionSignals(75, count);
    } else {
      signals = await getRecentSignals(count);
    }

    // Apply filters if not already applied by getSignalsForUser
    if (!userId) {
      if (chain !== 'all') signals = signals.filter(s => s.chain === chain);
      if (minScore > 0)    signals = signals.filter(s => s.convictionScore >= minScore);
    }

    return NextResponse.json({
      ok: true,
      count: signals.length,
      signals,
      timestamp: Date.now(),
      plan: plan ?? 'public',
    });
  } catch (error) {
    console.error('[/api/signals GET]', error);
    return NextResponse.json({ ok: false, error: 'Internal error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    // Rate limit: 1 manual scan per IP per 30 seconds
    const ip  = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? 'unknown';
    const rl  = await rateLimit(`celsor:scan:rl:${ip}`, 2, 30);

    if (!rl.allowed) {
      return NextResponse.json(
        { ok: false, error: 'Rate limited. Please wait 30s between manual scans.', remaining: 0 },
        { status: 429 }
      );
    }

    const body  = await req.json().catch(() => ({}));
    const chain = body.chain ?? 'all';

    // Fire pipeline in background (non-blocking)
    const { runAllChains, runSignalPipeline } = await import('@/lib/engine/signalPipelineV2');
    const _background = chain === 'all'
      ? runAllChains().catch(console.error)
      : runSignalPipeline(chain).catch(console.error);

    return NextResponse.json({
      ok: true,
      message: `Scan started for ${chain}. Results will appear in your feed within 15-30 seconds.`,
      chain,
      remaining: rl.remaining,
    });
  } catch (error) {
    console.error('[/api/signals POST]', error);
    return NextResponse.json({ ok: false, error: 'Internal error' }, { status: 500 });
  }
}
