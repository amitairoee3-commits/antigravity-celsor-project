/**
 * CELSOR — Memecoin Scanner API
 * GET  /api/memecoins           — trending memecoins from DexScreener
 * POST /api/memecoins           — search a specific token
 */
import { NextRequest, NextResponse } from 'next/server';
import { fetchTrendingMemecoins, fetchBoostedTokens, searchToken, getMockMemeSignals } from '@/lib/data/dexscreener';
import { notifyEliteSignal } from '@/lib/notifications/webhookService';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const includeBoosts = searchParams.get('boosts') === 'true';
  const minScore = parseInt(searchParams.get('minScore') ?? '0', 10);

  try {
    const [trending, boosted] = await Promise.allSettled([
      fetchTrendingMemecoins(),
      includeBoosts ? fetchBoostedTokens() : Promise.resolve([]),
    ]);

    let signals = [
      ...(trending.status === 'fulfilled' ? trending.value : getMockMemeSignals()),
      ...(boosted.status === 'fulfilled' ? boosted.value : []),
    ];

    // Deduplicate by symbol+chain
    const seen = new Set<string>();
    signals = signals.filter(s => {
      const key = `${s.symbol}:${s.chain}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // Apply min score filter
    if (minScore > 0) {
      signals = signals.filter(s => s.convictionScore >= minScore);
    }

    // Sort: new launches first, then by conviction
    signals.sort((a, b) => {
      if (a.isNew && !b.isNew) return -1;
      if (!a.isNew && b.isNew) return 1;
      return b.convictionScore - a.convictionScore;
    });

    return NextResponse.json({
      ok: true,
      count: signals.length,
      signals,
      timestamp: Date.now(),
    });
  } catch (e) {
    console.error('[CELSOR Memecoins] Error:', e);
    return NextResponse.json(
      { ok: false, error: 'Scanner error', signals: getMockMemeSignals() },
      { status: 200 } // still return mock data
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { query } = body as { query?: string };
    if (!query || query.trim().length < 2) {
      return NextResponse.json({ ok: false, error: 'query required' }, { status: 400 });
    }
    const results = await searchToken(query.trim());
    return NextResponse.json({ ok: true, count: results.length, signals: results });
  } catch (e) {
    return NextResponse.json({ ok: false, error: 'Search failed' }, { status: 500 });
  }
}
