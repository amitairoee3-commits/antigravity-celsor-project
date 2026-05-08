/**
 * CELSOR — Fear & Greed Macro Controller
 *
 * A master agent that reads total market conditions and adjusts the
 * signal pipeline's aggression level. This is the "brain of the brain":
 *
 *   EXTREME_GREED  → Pipeline is defensive. Only take highest-conviction (>80) longs.
 *   GREED          → Normal operation. Standard thresholds.
 *   NEUTRAL        → Slightly more aggressive. Lower conviction threshold (>55).
 *   FEAR           → Aggressive long bias — dip-buying. Flag all SHORT signals.
 *   EXTREME_FEAR   → Maximum aggression on dip-buys. This is historically best entry zone.
 *
 * Data sources (no API key required):
 *   1. Alternative.me Fear & Greed Index (crypto specific)
 *   2. BTC dominance from CoinGecko (free tier)
 *   3. Total market cap momentum from DexScreener aggregate
 *
 * Architecture: Multi-Agent Macro Controller pattern
 *   - Polls on every scan cycle
 *   - Caches for 30 minutes (macro conditions don't change minute-to-minute)
 *   - Exposes getPipelineMode() for the pipeline to consume
 */

import { cacheGet, cacheSet } from '@/lib/db/redis';

// ─── Types ─────────────────────────────────────────────────────────────────────

export type MarketSentiment = 'EXTREME_FEAR' | 'FEAR' | 'NEUTRAL' | 'GREED' | 'EXTREME_GREED';

export interface MacroSnapshot {
  sentiment:           MarketSentiment;
  fearGreedIndex:      number;          // 0-100 (Alternative.me)
  fearGreedLabel:      string;          // "Extreme Fear", "Fear", etc.
  btcDominance:        number;          // % BTC market dominance
  btcChange24h:        number;          // BTC 24h price change %
  altcoinBias:         'BULLISH' | 'BEARISH' | 'NEUTRAL';
  totalMarketCapBias:  'EXPANDING' | 'CONTRACTING' | 'NEUTRAL';

  // Pipeline directives
  pipelineMode:        PipelineMode;
  minConvictionOverride: number;       // override minimum conviction for this cycle
  longBias:            number;         // +1 = aggressively long, -1 = aggressively short, 0 = neutral
  narrative:           string;         // human-readable macro briefing
  updatedAt:           number;
  dataSource:          string;         // which source provided the data
}

export interface PipelineMode {
  name:                'AGGRESSIVE_DIP_BUY' | 'DIP_BUY' | 'NORMAL' | 'SELECTIVE' | 'DEFENSIVE';
  minConviction:       number;
  preferDirection:     'LONG' | 'SHORT' | 'BOTH';
  riskMultiplier:      number;         // multiplied against SL/TP in PnL tracker
  description:         string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MACRO_CACHE_KEY = 'celsor:macro:snapshot';
const CACHE_TTL       = 30 * 60; // 30 minutes

const PIPELINE_MODES: Record<MarketSentiment, PipelineMode> = {
  EXTREME_FEAR: {
    name:            'AGGRESSIVE_DIP_BUY',
    minConviction:   50,  // Lower bar — fear = opportunity
    preferDirection: 'LONG',
    riskMultiplier:  1.2, // Wider stops — expect volatility
    description:     'Extreme Fear: maximum long opportunity. Historically best entry zone. Taking all quality LONG signals.',
  },
  FEAR: {
    name:            'DIP_BUY',
    minConviction:   55,
    preferDirection: 'LONG',
    riskMultiplier:  1.1,
    description:     'Fear regime: dip-buying mode active. Prioritizing LONG signals with smart money accumulation.',
  },
  NEUTRAL: {
    name:            'NORMAL',
    minConviction:   60,
    preferDirection: 'BOTH',
    riskMultiplier:  1.0,
    description:     'Neutral conditions: standard operation. Taking signals by conviction without directional bias.',
  },
  GREED: {
    name:            'SELECTIVE',
    minConviction:   70, // Raise bar — crowded market
    preferDirection: 'BOTH',
    riskMultiplier:  0.9,
    description:     'Greed detected: raising conviction threshold. Market crowded — only highest-quality signals pass.',
  },
  EXTREME_GREED: {
    name:            'DEFENSIVE',
    minConviction:   80, // Very selective
    preferDirection: 'SHORT', // Start looking for exit opportunities
    riskMultiplier:  0.8,
    description:     'Extreme Greed: defensive mode. Market euphoric = distribution risk. Favoring SHORT signals and protecting capital.',
  },
};

// ─── Data Fetchers ────────────────────────────────────────────────────────────

async function fetchAlternativeMeFearGreed(): Promise<{ value: number; label: string } | null> {
  try {
    const res = await fetch('https://api.alternative.me/fng/?limit=1', {
      headers: { 'User-Agent': 'celsor-nexus/1.0' },
      next: { revalidate: 1800 }, // 30 min Next.js cache
    });
    if (!res.ok) return null;
    const data = await res.json();
    const entry = data.data?.[0];
    if (!entry) return null;
    return {
      value: parseInt(entry.value),
      label: entry.value_classification,
    };
  } catch {
    return null;
  }
}

async function fetchBTCData(): Promise<{ dominance: number; change24h: number } | null> {
  try {
    // CoinGecko free tier (no key) — global market data
    const res = await fetch(
      'https://api.coingecko.com/api/v3/global',
      {
        headers: { 'User-Agent': 'celsor-nexus/1.0' },
        next: { revalidate: 1800 },
      }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const dominance = data.data?.market_cap_percentage?.btc ?? 50;
    const btcChange = data.data?.market_cap_change_percentage_24h_usd ?? 0;
    return { dominance: parseFloat(dominance.toFixed(1)), change24h: parseFloat(btcChange.toFixed(2)) };
  } catch {
    return null;
  }
}

// ─── Sentiment classifier ─────────────────────────────────────────────────────

function classifySentiment(fearGreedIndex: number): MarketSentiment {
  if (fearGreedIndex <= 20) return 'EXTREME_FEAR';
  if (fearGreedIndex <= 40) return 'FEAR';
  if (fearGreedIndex <= 60) return 'NEUTRAL';
  if (fearGreedIndex <= 80) return 'GREED';
  return 'EXTREME_GREED';
}

function classifyAltcoinBias(btcDominance: number, btcChange: number): 'BULLISH' | 'BEARISH' | 'NEUTRAL' {
  // High BTC dominance + falling BTC = bad for alts (rotation into BTC safe haven)
  if (btcDominance > 55 && btcChange < -3) return 'BEARISH';
  // Low BTC dominance + rising BTC = potential alt season
  if (btcDominance < 45 && btcChange > 2) return 'BULLISH';
  // Rising alts during flat/falling BTC = alt season signal
  if (btcDominance < 48 && btcChange < 0) return 'BULLISH';
  return 'NEUTRAL';
}

// ─── Fallback snapshot when APIs fail ────────────────────────────────────────

function buildFallbackSnapshot(): MacroSnapshot {
  // Conservative neutral default — don't be aggressive without real data
  const sentiment: MarketSentiment = 'NEUTRAL';
  return {
    sentiment,
    fearGreedIndex:     50,
    fearGreedLabel:     'Neutral',
    btcDominance:       50,
    btcChange24h:       0,
    altcoinBias:        'NEUTRAL',
    totalMarketCapBias: 'NEUTRAL',
    pipelineMode:       PIPELINE_MODES[sentiment],
    minConvictionOverride: PIPELINE_MODES[sentiment].minConviction,
    longBias:           0,
    narrative:          'Macro data unavailable. Operating in neutral mode with standard conviction thresholds.',
    updatedAt:          Date.now(),
    dataSource:         'fallback',
  };
}

// ─── Main function ────────────────────────────────────────────────────────────

export async function getMacroSnapshot(forceRefresh = false): Promise<MacroSnapshot> {
  // Serve from cache unless forced
  if (!forceRefresh) {
    const cached = await cacheGet<MacroSnapshot>(MACRO_CACHE_KEY);
    if (cached && Date.now() - cached.updatedAt < CACHE_TTL * 1000) {
      return cached;
    }
  }

  // Fetch in parallel — partial data is better than no data
  const [fng, btc] = await Promise.allSettled([
    fetchAlternativeMeFearGreed(),
    fetchBTCData(),
  ]);

  const fearGreedData = fng.status === 'fulfilled' ? fng.value : null;
  const btcData       = btc.status === 'fulfilled' ? btc.value : null;

  if (!fearGreedData) {
    const fallback = buildFallbackSnapshot();
    await cacheSet(MACRO_CACHE_KEY, fallback, CACHE_TTL);
    return fallback;
  }

  const fearGreedIndex = fearGreedData.value;
  const fearGreedLabel = fearGreedData.label;
  const btcDominance   = btcData?.dominance ?? 50;
  const btcChange24h   = btcData?.change24h ?? 0;

  const sentiment     = classifySentiment(fearGreedIndex);
  const altcoinBias   = classifyAltcoinBias(btcDominance, btcChange24h);
  const mode          = PIPELINE_MODES[sentiment];

  // Adjust long bias
  let longBias = 0;
  if (sentiment === 'EXTREME_FEAR')  longBias =  1;
  if (sentiment === 'FEAR')          longBias =  0.5;
  if (sentiment === 'EXTREME_GREED') longBias = -0.5;
  if (altcoinBias === 'BULLISH')     longBias += 0.3;
  if (altcoinBias === 'BEARISH')     longBias -= 0.3;

  // Market cap bias from BTC change (proxy)
  const totalMarketCapBias: MacroSnapshot['totalMarketCapBias'] =
    btcChange24h > 3 ? 'EXPANDING' : btcChange24h < -3 ? 'CONTRACTING' : 'NEUTRAL';

  // Build macro narrative
  const narrative = buildNarrative(sentiment, fearGreedIndex, btcDominance, btcChange24h, altcoinBias, mode);

  const snapshot: MacroSnapshot = {
    sentiment,
    fearGreedIndex,
    fearGreedLabel,
    btcDominance,
    btcChange24h,
    altcoinBias,
    totalMarketCapBias,
    pipelineMode:          mode,
    minConvictionOverride: mode.minConviction,
    longBias:              parseFloat(longBias.toFixed(2)),
    narrative,
    updatedAt:             Date.now(),
    dataSource:            'alternative.me + coingecko',
  };

  await cacheSet(MACRO_CACHE_KEY, snapshot, CACHE_TTL);

  const moodEmoji = { EXTREME_FEAR: '🔴', FEAR: '🟠', NEUTRAL: '⚪', GREED: '🟡', EXTREME_GREED: '🟢' };
  console.log(`[CELSOR Macro] ${moodEmoji[sentiment]} ${sentiment} (${fearGreedIndex}) | Mode: ${mode.name} | MinConviction: ${mode.minConviction}`);

  return snapshot;
}

// ─── Narrative builder ────────────────────────────────────────────────────────

function buildNarrative(
  sentiment: MarketSentiment,
  fgi:       number,
  btcDom:    number,
  btcChg:    number,
  altBias:   string,
  mode:      PipelineMode,
): string {
  const lines = [
    `Fear & Greed: ${fgi}/100 (${sentiment.replace('_', ' ')}).`,
    `BTC dominance: ${btcDom}% | BTC 24h: ${btcChg >= 0 ? '+' : ''}${btcChg}%.`,
    `Altcoin bias: ${altBias}.`,
    `Pipeline directive: ${mode.description}`,
  ];

  if (sentiment === 'EXTREME_FEAR') {
    lines.push('⚠️ Historical data shows EXTREME FEAR = best long entry zones. Smart money accumulates while retail panics.');
  } else if (sentiment === 'EXTREME_GREED') {
    lines.push('⚠️ EXTREME GREED = distribution risk. Late retail entering = smart money exit liquidity. Caution on new longs.');
  }

  return lines.join(' ');
}

// ─── Pipeline-facing helpers ──────────────────────────────────────────────────

export async function getPipelineMode(): Promise<PipelineMode> {
  const snapshot = await getMacroSnapshot();
  return snapshot.pipelineMode;
}

export async function getMinConvictionThreshold(): Promise<number> {
  const snapshot = await getMacroSnapshot();
  return snapshot.minConvictionOverride;
}

export async function getLongBias(): Promise<number> {
  const snapshot = await getMacroSnapshot();
  return snapshot.longBias;
}
