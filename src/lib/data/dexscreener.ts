/**
 * CELSOR — DexScreener Live Market Data
 *
 * Provides real-time price context to the signal scorer so it can:
 *   - Detect momentum breakouts vs. stale moves
 *   - Calculate real buy/sell pressure (order flow)
 *   - Determine whale timing quality (buying dip vs. buying top)
 *   - Score volume anomalies against actual recent averages
 *
 * DexScreener is free, no API key required for basic endpoints.
 */

export interface DexPairData {
  pairAddress: string;
  tokenSymbol: string;
  tokenName: string;
  tokenAddress: string;
  chain: string;
  price: number;
  priceChange1h: number;
  priceChange24h: number;
  priceChange7d?: number;
  volume24h: number;
  volumeChange24h?: number;
  liquidity: number;
  marketCap?: number;
  fdv?: number;
  pairCreatedAt?: number;
  txns1h?: { buys: number; sells: number };
  txns24h?: { buys: number; sells: number };
  priceHigh24h?: number;
  priceLow24h?: number;
}

const DEXSCREENER_BASE = 'https://api.dexscreener.com/latest/dex';

// Chain name mapping for DexScreener
const CHAIN_MAP: Record<string, string> = {
  eth:  'ethereum',
  arb:  'arbitrum',
  base: 'base',
  bsc:  'bsc',
  op:   'optimism',
};

/**
 * Fetch live pair data for a token address.
 * Returns null on failure (pipeline continues with degraded scoring).
 */
export async function getPairData(
  tokenAddressOrSymbol: string,
  chain: string,
): Promise<DexPairData | null> {
  try {
    const dexChain = CHAIN_MAP[chain] ?? chain;

    // Try by address first (most accurate)
    if (tokenAddressOrSymbol.startsWith('0x') && tokenAddressOrSymbol.length === 42) {
      const url = `${DEXSCREENER_BASE}/tokens/${tokenAddressOrSymbol}`;
      const res = await fetch(url, {
        headers: { 'User-Agent': 'celsor-nexus/1.0' },
        next: { revalidate: 30 }, // 30s cache
      });
      if (res.ok) {
        const data = await res.json();
        const pairs = (data.pairs ?? []) as any[];
        // Find the best pair on the correct chain by liquidity
        const match = pairs
          .filter((p: any) => p.chainId === dexChain)
          .sort((a: any, b: any) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))[0];
        if (match) return parsePair(match, chain);
      }
    }

    // Search by symbol
    const url = `${DEXSCREENER_BASE}/search?q=${encodeURIComponent(tokenAddressOrSymbol)}`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'celsor-nexus/1.0' },
      next: { revalidate: 30 },
    });
    if (!res.ok) return null;

    const data = await res.json();
    const pairs = (data.pairs ?? []) as any[];
    const match = pairs
      .filter((p: any) => p.chainId === dexChain)
      .sort((a: any, b: any) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))[0];

    return match ? parsePair(match, chain) : null;
  } catch {
    return null;
  }
}

function parsePair(p: any, chain: string): DexPairData {
  return {
    pairAddress:   p.pairAddress,
    tokenSymbol:   p.baseToken?.symbol ?? 'UNKNOWN',
    tokenName:     p.baseToken?.name ?? 'Unknown',
    tokenAddress:  p.baseToken?.address ?? '',
    chain,
    price:         parseFloat(p.priceUsd ?? '0'),
    priceChange1h: p.priceChange?.h1 ?? 0,
    priceChange24h: p.priceChange?.h24 ?? 0,
    priceChange7d:  p.priceChange?.d7,
    volume24h:     p.volume?.h24 ?? 0,
    liquidity:     p.liquidity?.usd ?? 0,
    marketCap:     p.marketCap ?? undefined,
    fdv:           p.fdv ?? undefined,
    pairCreatedAt: p.pairCreatedAt ? parseInt(p.pairCreatedAt) : undefined,
    txns1h:  p.txns?.h1  ? { buys: p.txns.h1.buys,  sells: p.txns.h1.sells  } : undefined,
    txns24h: p.txns?.h24 ? { buys: p.txns.h24.buys, sells: p.txns.h24.sells } : undefined,
    priceHigh24h: p.priceChange?.h24 !== undefined && p.priceUsd
      ? parseFloat(p.priceUsd) * (1 + Math.abs(p.priceChange.h24 ?? 0) / 100) : undefined,
    priceLow24h: p.priceChange?.h24 !== undefined && p.priceUsd
      ? parseFloat(p.priceUsd) * (1 - Math.abs(p.priceChange.h24 ?? 0) / 100) : undefined,
  };
}

/**
 * Batch fetch live data for multiple tokens.
 * Used by the pipeline to enrich scored signals before AI generation.
 */
export async function batchGetPairData(
  tokens: Array<{ symbol: string; address?: string; chain: string }>,
  concurrency = 3,
): Promise<Map<string, DexPairData>> {
  const results = new Map<string, DexPairData>();

  // Process in small batches to avoid rate limiting
  for (let i = 0; i < tokens.length; i += concurrency) {
    const batch = tokens.slice(i, i + concurrency);
    const fetched = await Promise.allSettled(
      batch.map(t => getPairData(t.address ?? t.symbol, t.chain))
    );

    fetched.forEach((result, j) => {
      if (result.status === 'fulfilled' && result.value) {
        const token = batch[j];
        const key = `${token.chain}:${token.symbol}`;
        results.set(key, result.value);
      }
    });

    // Polite rate limiting — DexScreener has no keys but is rate limited
    if (i + concurrency < tokens.length) {
      await new Promise(r => setTimeout(r, 150));
    }
  }

  return results;
}

/**
 * Get trending pairs on a chain — used by the autonomous scanner
 * to find tokens with anomalous volume before any whale tx is needed.
 */
export async function getTrendingPairs(chain: string, limit = 20): Promise<DexPairData[]> {
  try {
    const dexChain = CHAIN_MAP[chain] ?? chain;
    const url = `${DEXSCREENER_BASE}/pairs/${dexChain}`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'celsor-nexus/1.0' },
      next: { revalidate: 60 },
    });
    if (!res.ok) return [];

    const data = await res.json();
    const pairs = (data.pairs ?? []) as any[];

    return pairs
      .filter((p: any) => (p.liquidity?.usd ?? 0) > 50_000) // min $50K liquidity
      .sort((a: any, b: any) => {
        // Rank by volume spike potential: vol/liquidity ratio
        const aRatio = (a.volume?.h1 ?? 0) / Math.max(a.liquidity?.usd ?? 1, 1);
        const bRatio = (b.volume?.h1 ?? 0) / Math.max(b.liquidity?.usd ?? 1, 1);
        return bRatio - aRatio;
      })
      .slice(0, limit)
      .map((p: any) => parsePair(p, chain));
  } catch {
    return [];
  }
}

// ─── Memecoin-specific types (used by /api/memecoins) ─────────────────────────

export interface MemeSignal {
  symbol:         string;
  name:           string;
  chain:          string;
  address:        string;
  price:          number;
  priceChange1h:  number;
  priceChange24h: number;
  volume24h:      number;
  liquidity:      number;
  marketCap?:     number;
  convictionScore: number;
  isNew:          boolean;
  buyPressure:    number; // 0-100
  narrative:      string;
  tags:           string[];
}

function pairToMemeSignal(p: DexPairData): MemeSignal {
  const buys  = p.txns1h?.buys  ?? 0;
  const sells = p.txns1h?.sells ?? 0;
  const total = buys + sells;
  const buyPressure = total > 0 ? Math.round((buys / total) * 100) : 50;

  // Conviction: momentum + volume + buy pressure composite
  let conviction = 30;
  if (p.priceChange1h > 20)  conviction += 25;
  else if (p.priceChange1h > 10) conviction += 15;
  else if (p.priceChange1h > 5)  conviction += 8;
  if (buyPressure > 70)  conviction += 20;
  else if (buyPressure > 60) conviction += 10;
  if (p.volume24h > 1_000_000) conviction += 15;
  else if (p.volume24h > 100_000) conviction += 8;
  if (p.liquidity > 500_000) conviction += 10;
  else if (p.liquidity < 50_000) conviction -= 15; // thin liq = risky

  const isNew = p.pairCreatedAt
    ? (Date.now() / 1000 - p.pairCreatedAt) < 86400 * 3 // < 3 days
    : false;

  let narrative = `${p.priceChange1h >= 0 ? '+' : ''}${p.priceChange1h.toFixed(1)}% 1h`;
  if (isNew) narrative = 'New Launch · ' + narrative;
  if (buyPressure > 70) narrative += ` · ${buyPressure}% buy pressure`;

  return {
    symbol:         p.tokenSymbol,
    name:           p.tokenName,
    chain:          p.chain,
    address:        p.tokenAddress,
    price:          p.price,
    priceChange1h:  p.priceChange1h,
    priceChange24h: p.priceChange24h,
    volume24h:      p.volume24h,
    liquidity:      p.liquidity,
    marketCap:      p.marketCap,
    convictionScore: Math.min(99, Math.max(10, conviction)),
    isNew,
    buyPressure,
    narrative,
    tags: [
      isNew ? 'new-launch' : null,
      buyPressure > 70 ? 'high-buy-pressure' : null,
      p.priceChange1h > 15 ? 'momentum' : null,
      p.liquidity < 100_000 ? 'low-liquidity' : null,
    ].filter(Boolean) as string[],
  };
}

/** Trending memecoins — ranked by momentum+volume spike */
export async function fetchTrendingMemecoins(chains = ['ethereum', 'base', 'bsc', 'solana']): Promise<MemeSignal[]> {
  const results: MemeSignal[] = [];
  for (const chain of chains) {
    const pairs = await getTrendingPairs(chain, 15);
    results.push(...pairs.map(p => pairToMemeSignal(p)));
  }
  return results.sort((a, b) => b.convictionScore - a.convictionScore).slice(0, 50);
}

/** Boosted tokens from DexScreener paid promotions */
export async function fetchBoostedTokens(): Promise<MemeSignal[]> {
  try {
    const res = await fetch('https://api.dexscreener.com/token-boosts/latest/v1', {
      headers: { 'User-Agent': 'celsor-nexus/1.0' },
      next: { revalidate: 120 },
    });
    if (!res.ok) return [];
    const data = await res.json();
    const boosts = Array.isArray(data) ? data : [];
    return boosts.slice(0, 20).map((b: any): MemeSignal => ({
      symbol:          b.tokenAddress?.slice(0, 6) ?? 'BOOST',
      name:            b.description?.slice(0, 40) ?? 'Boosted Token',
      chain:           b.chainId ?? 'unknown',
      address:         b.tokenAddress ?? '',
      price:           0,
      priceChange1h:   0,
      priceChange24h:  0,
      volume24h:       0,
      liquidity:       0,
      convictionScore: 35, // boosted but unknown fundamentals
      isNew:           true,
      buyPressure:     50,
      narrative:       'Paid boost active — verify fundamentals before entering',
      tags:            ['boosted', 'verify'],
    }));
  } catch {
    return [];
  }
}

/** Search a token by symbol/address */
export async function searchToken(query: string): Promise<MemeSignal[]> {
  try {
    const url = `${DEXSCREENER_BASE}/search?q=${encodeURIComponent(query)}`;
    const res = await fetch(url, { headers: { 'User-Agent': 'celsor-nexus/1.0' } });
    if (!res.ok) return [];
    const data = await res.json();
    const pairs = (data.pairs ?? []).slice(0, 10) as any[];
    return pairs.map((p: any) => pairToMemeSignal(parsePair(p, p.chainId ?? 'ethereum')));
  } catch {
    return [];
  }
}

/** Mock memecoin signals for dev/fallback */
export function getMockMemeSignals(): MemeSignal[] {
  const MOCK: Omit<MemeSignal, 'narrative'>[] = [
    { symbol: 'PEPE',    name: 'Pepe',       chain: 'ethereum', address: '0x6982508145454ce325ddbef7a951f0f2ecd04cf', price: 0.00001042, priceChange1h: 8.4,  priceChange24h: 22.1, volume24h: 4_200_000, liquidity: 8_500_000, convictionScore: 78, isNew: false, buyPressure: 74, tags: ['momentum', 'high-buy-pressure'] },
    { symbol: 'WIF',     name: 'dogwifhat',  chain: 'solana',   address: 'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm', price: 2.41,      priceChange1h: 3.2,  priceChange24h: 11.4, volume24h: 18_000_000, liquidity: 42_000_000, convictionScore: 71, isNew: false, buyPressure: 62, tags: ['momentum'] },
    { symbol: 'BRETT',   name: 'Brett',      chain: 'base',     address: '0x532f27101965dd16442e59d40670faf5ebb142e4', price: 0.0823,    priceChange1h: 12.1, priceChange24h: 34.7, volume24h: 2_800_000, liquidity: 4_200_000, convictionScore: 82, isNew: false, buyPressure: 81, tags: ['momentum', 'high-buy-pressure'] },
    { symbol: 'NORMIE',  name: 'Normie',     chain: 'base',     address: '0x7f12d13b34f5f4f0a9449c16bcd42f0da47af200', price: 0.000034,  priceChange1h: -4.2, priceChange24h: -12.3,volume24h: 380_000,  liquidity: 920_000,  convictionScore: 42, isNew: false, buyPressure: 38, tags: [] },
    { symbol: 'MOODENG', name: 'Moo Deng',   chain: 'ethereum', address: '0x28561b8a2360f463011c16b6cc0b0cbef8dbbcad', price: 0.000218,  priceChange1h: 18.6, priceChange24h: 45.2, volume24h: 6_100_000, liquidity: 3_800_000, convictionScore: 88, isNew: false, buyPressure: 86, tags: ['momentum', 'high-buy-pressure'] },
    { symbol: 'FLOKI',   name: 'FLOKI',      chain: 'bsc',      address: '0xcf0c122c6b73ff809c693db761e7baebe62b6a2e', price: 0.000142,  priceChange1h: 5.1,  priceChange24h: 8.7,  volume24h: 9_400_000, liquidity: 21_000_000, convictionScore: 65, isNew: false, buyPressure: 58, tags: ['momentum'] },
  ];

  return MOCK.map(m => ({
    ...m,
    narrative: `${m.priceChange1h >= 0 ? '+' : ''}${m.priceChange1h}% 1h · ${m.buyPressure}% buy pressure`,
  }));
}

// ─── Legacy ML pipeline compat (used by /api/ml/signals) ─────────────────────

/** Get top movers on a chain by 1h price change + volume */
export async function getTopMovers(chain: string, limit = 30): Promise<any[]> {
  try {
    const dexChain = CHAIN_MAP[chain] ?? chain;
    const url = `${DEXSCREENER_BASE}/pairs/${dexChain}`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'celsor-nexus/1.0' },
      next: { revalidate: 30 },
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.pairs ?? []).slice(0, limit);
  } catch {
    return [];
  }
}

/** Convert a raw DexScreener pair object to an on-chain event shape for the ML scorer */
export function pairToOnChainEvent(pair: any) {
  const vol1h   = pair.volume?.h1 ?? 0;
  const vol24h  = pair.volume?.h24 ?? 0;
  const avgVol1h = vol24h / 24;
  const volumeSpike = avgVol1h > 0 ? vol1h / avgVol1h : 1;
  const p1h = pair.priceChange?.h1 ?? 0;

  return {
    // New field names
    symbol:        pair.baseToken?.symbol ?? 'UNKNOWN',
    chain:         pair.chainId ?? 'unknown',
    price:         parseFloat(pair.priceUsd ?? '0'),
    priceChange1h: p1h,
    volume1h:      vol1h,
    volume24h:     vol24h,
    liquidity:     pair.liquidity?.usd ?? 0,
    buys1h:        pair.txns?.h1?.buys ?? 0,
    sells1h:       pair.txns?.h1?.sells ?? 0,
    marketCap:     pair.marketCap ?? null,
    pairAddress:   pair.pairAddress ?? '',
    tokenAddress:  pair.baseToken?.address ?? '',
    // Legacy aliases (used by autonomousScanner.ts)
    tokenSymbol:          pair.baseToken?.symbol ?? 'UNKNOWN',
    priceChangePercent1h: p1h,
    usdValue:             vol1h,
    volumeSpike,
  };
}
