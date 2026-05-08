import { getTopMovers, pairToOnChainEvent } from '@/lib/data/dexscreener';
import { scoreSignal, type ScoredSignal } from '@/lib/ml/scorer';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const revalidate = 30;

const CHAINS = ['solana', 'ethereum', 'bsc', 'arbitrum', 'base'];

export async function GET() {
  try {
    // Fetch top movers from all chains in parallel
    const results = await Promise.allSettled(
      CHAINS.map(chain => getTopMovers(chain))
    );

    const allPairs = results
      .flatMap(r => r.status === 'fulfilled' ? r.value : [])
      .filter(pair => 
        pair.volume?.h1 > 5000 &&      // Min $5K volume in last hour
        pair.liquidity?.usd > 10000 &&  // Min $10K liquidity
        Math.abs(pair.priceChange?.h1 ?? 0) > 3 // At least 3% move
      )
      .slice(0, 100);

    // Score each pair through ML pipeline
    const scored: ScoredSignal[] = allPairs
      .map(pair => scoreSignal(pairToOnChainEvent(pair)))
      .filter(s => s.score >= 40) // Only meaningful signals
      .sort((a, b) => b.score - a.score)
      .slice(0, 30);

    // Compute anomalies separately
    const anomalies = scored.filter(s => s.anomalyFlag);

    return NextResponse.json({
      signals: scored,
      anomalyCount: anomalies.length,
      topAnomalies: anomalies.slice(0, 5),
      totalScanned: allPairs.length,
      timestamp: Date.now(),
    });
  } catch (err) {
    return NextResponse.json({ error: 'ML pipeline error', signals: [] }, { status: 500 });
  }
}
