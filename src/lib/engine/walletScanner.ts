/**
 * CELSOR — Smart Money Discovery Engine
 *
 * Scans multiple public intelligence sources to discover wallets of big players:
 *   1. On-chain: Etherscan large tx feed per chain
 *   2. DexScreener: Top token profiles → largest holders
 *   3. Nansen-style pattern: Wallets that appear in multiple large txns
 *   4. Known CEX/Protocol/Fund hot wallets (public knowledge)
 *   5. DeBank public portfolio API (no key needed for public data)
 *
 * All discovered wallets are scored, classified, and added to the watchlist.
 * The watchlist feeds the intelligence pipeline — better wallet list = better signals.
 */

import { cacheGet, cacheSet } from '@/lib/db/redis';
import { classifyFromTxns } from '@/lib/engine/walletClassifier';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DiscoveredWallet {
  address:          string;
  chain:            string;
  label:            string;           // e.g. "Jump Trading", "Unknown Whale #4"
  discoverySource:  string;           // where we found them
  estimatedAUM:     number;           // USD estimate
  activityScore:    number;           // 0-100 how active recently
  tags:             string[];
  discoveredAt:     number;
}

// ─── Known Institutional Wallets (public knowledge) ──────────────────────────
// These are wallets publicly attributed to known players via on-chain data,
// Etherscan labels, or blockchain analytics reports

const KNOWN_PLAYERS: DiscoveredWallet[] = [
  // ETH — Exchanges & Market Makers
  { address: '0x3f5CE5FBFe3E9af3971dD833D26bA9b5C936f0bE', chain: 'eth', label: 'Binance 7',        discoverySource: 'known', estimatedAUM: 10_000_000_000, activityScore: 90, tags: ['cex', 'binance', 'high-volume'], discoveredAt: 0 },
  { address: '0x28C6c06298d514Db089934071355E5743bf21d60', chain: 'eth', label: 'Binance 14',       discoverySource: 'known', estimatedAUM: 5_000_000_000,  activityScore: 85, tags: ['cex', 'binance', 'high-volume'], discoveredAt: 0 },
  { address: '0x47ac0Fb4F2D84898e4D9E7b4DaB3C24507a6D503', chain: 'eth', label: 'Jump Trading',    discoverySource: 'known', estimatedAUM: 2_000_000_000,  activityScore: 80, tags: ['market-maker', 'institutional'], discoveredAt: 0 },
  { address: '0xBE0eB53F46cd790Cd13851d5EFf43D12404d33E8', chain: 'eth', label: 'Binance Cold',    discoverySource: 'known', estimatedAUM: 8_000_000_000,  activityScore: 60, tags: ['cex', 'binance', 'cold-wallet'], discoveredAt: 0 },
  { address: '0x6cC5F688a315f3dC28A7781717a9A798a59fDA7b', chain: 'eth', label: 'OKX Hot',         discoverySource: 'known', estimatedAUM: 3_000_000_000,  activityScore: 88, tags: ['cex', 'okx', 'high-volume'],   discoveredAt: 0 },
  { address: '0x56Eddb7aa87536c09CCc2793473599fD21A8b17F', chain: 'eth', label: 'Coinbase Prime',  discoverySource: 'known', estimatedAUM: 5_000_000_000,  activityScore: 75, tags: ['cex', 'coinbase', 'institutional'], discoveredAt: 0 },
  { address: '0x2faf487a4414fe77e2327f0bf4ae2a264a776ad2', chain: 'eth', label: 'FTX Estate',       discoverySource: 'known', estimatedAUM: 500_000_000,   activityScore: 40, tags: ['notable', 'ftx'], discoveredAt: 0 },
  { address: '0x40B38765696e3d5d8d9d834D8AaD4bB6e418E489', chain: 'eth', label: 'Robinhood',       discoverySource: 'known', estimatedAUM: 1_000_000_000,  activityScore: 65, tags: ['broker', 'retail-institutional'], discoveredAt: 0 },
  // DeFi Protocol Treasuries
  { address: '0x0716a17FBAeE714f1E6aB0f9d59edbC5f09815C0', chain: 'eth', label: 'Aave Treasury',   discoverySource: 'known', estimatedAUM: 400_000_000,   activityScore: 50, tags: ['defi', 'aave', 'treasury'], discoveredAt: 0 },
  { address: '0x9B6443b0fB9C241A7fdAC375595cEa13e6B7807A', chain: 'eth', label: 'Uniswap Treasury', discoverySource: 'known', estimatedAUM: 3_000_000_000, activityScore: 45, tags: ['defi', 'uniswap', 'treasury'], discoveredAt: 0 },
  // ARB
  { address: '0x489ee077994B6658eAfA855C308275EAd8097C4A', chain: 'arb', label: 'Arbitrum Foundation', discoverySource: 'known', estimatedAUM: 2_000_000_000, activityScore: 70, tags: ['foundation', 'arbitrum'], discoveredAt: 0 },
  // BSC
  { address: '0x8894E0a0c962CB723c1976a4421c95949bE2D4E3', chain: 'bsc', label: 'Binance BSC',      discoverySource: 'known', estimatedAUM: 4_000_000_000,  activityScore: 85, tags: ['cex', 'binance', 'bsc'], discoveredAt: 0 },
  { address: '0xf977814e90da44bfa03b6295a0616a897441acec', chain: 'bsc', label: 'Binance BSC 2',   discoverySource: 'known', estimatedAUM: 2_000_000_000,  activityScore: 80, tags: ['cex', 'binance', 'bsc'], discoveredAt: 0 },
];

// ─── DeBank Public Portfolio Fetch ────────────────────────────────────────────

async function fetchDeBankProfile(address: string): Promise<{ totalUSD: number; chains: string[] } | null> {
  try {
    // DeBank public API — no key needed for basic portfolio
    const res = await fetch(
      `https://openapi.debank.com/v1/user/total_balance?id=${address}`,
      {
        cache: 'no-store',
        headers: { 'User-Agent': 'celsor-nexus/2.0' },
      }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return {
      totalUSD: data.total_usd_value ?? 0,
      chains:   Object.keys(data.chain_list ?? {}),
    };
  } catch {
    return null;
  }
}

// ─── Etherscan Large TX Discovery ────────────────────────────────────────────
// Finds new unknown wallets making large moves we haven't catalogued yet

async function discoverFromEtherscan(chain: string, apiKey: string): Promise<DiscoveredWallet[]> {
  const EXPLORERS: Record<string, string> = {
    eth:  'https://api.etherscan.io/api',
    arb:  'https://api.arbiscan.io/api',
    base: 'https://api.basescan.org/api',
    bsc:  'https://api.bscscan.com/api',
    op:   'https://api-optimistic.etherscan.io/api',
  };

  const base = EXPLORERS[chain];
  if (!base || !apiKey) return [];

  try {
    // Get recent large token transfers
    const url = `${base}?module=account&action=tokentx&page=1&offset=200&sort=desc&apikey=${apiKey}`;
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return [];

    const data = await res.json();
    if (data.status !== '1') return [];

    // Find wallets making multiple large txns — sign of institutional activity
    const walletActivity: Map<string, { count: number; totalUSD: number; tokens: Set<string> }> = new Map();

    for (const tx of (data.result as any[])) {
      const decimals  = parseInt(tx.tokenDecimal || '18');
      const valueUSD  = parseFloat(tx.value) / Math.pow(10, decimals);
      if (valueUSD < 100_000) continue; // Only $100K+ txns

      const from = tx.from.toLowerCase();
      const existing = walletActivity.get(from) ?? { count: 0, totalUSD: 0, tokens: new Set() };
      existing.count++;
      existing.totalUSD += valueUSD;
      existing.tokens.add(tx.tokenSymbol);
      walletActivity.set(from, existing);
    }

    // Wallets with 2+ large txns are interesting
    const discovered: DiscoveredWallet[] = [];
    for (const [address, activity] of Array.from(walletActivity.entries())) {
      if (activity.count < 2) continue;

      discovered.push({
        address,
        chain,
        label: `Active Whale (${activity.count} large txns, $${(activity.totalUSD / 1000).toFixed(0)}K)`,
        discoverySource: 'etherscan-scan',
        estimatedAUM: activity.totalUSD * 10, // rough AUM estimate
        activityScore: Math.min(100, activity.count * 20 + 40),
        tags: ['on-chain-discovered', 'multi-txn', ...Array.from(activity.tokens).slice(0, 3)],
        discoveredAt: Date.now(),
      });
    }

    return discovered.slice(0, 10);
  } catch {
    return [];
  }
}

// ─── DexScreener Top Token Holder Discovery ───────────────────────────────────

async function discoverFromDexScreener(): Promise<DiscoveredWallet[]> {
  try {
    // Get top trending real coins — find their major on-chain movers
    const res = await fetch('https://api.dexscreener.com/token-boosts/top/v1', {
      cache: 'no-store',
      headers: { 'User-Agent': 'celsor-nexus/2.0' },
    });
    if (!res.ok) return [];

    const data = await res.json();
    if (!Array.isArray(data)) return [];

    // We can't directly get holder wallets from DexScreener
    // But we can get pair data and infer large movers from volume spikes
    const discovered: DiscoveredWallet[] = [];

    for (const token of data.slice(0, 5)) {
      try {
        const pairRes = await fetch(
          `https://api.dexscreener.com/token-pairs/v1/${token.chainId ?? 'ethereum'}/${token.tokenAddress}`,
          { cache: 'no-store' }
        );
        const pairData = await pairRes.json();
        const pairs = Array.isArray(pairData) ? pairData : (pairData.pairs ?? []);
        const top = pairs[0];

        if (top && top.liquidity?.usd > 1_000_000) {
          // High-liquidity pairs with maker addresses if available
          if (top.maker?.address) {
            discovered.push({
              address:         top.maker.address,
              chain:           token.chainId ?? 'ethereum',
              label:           `${token.symbol} Maker/LP Provider`,
              discoverySource: 'dexscreener',
              estimatedAUM:    top.liquidity.usd * 2,
              activityScore:   75,
              tags:            ['lp-provider', 'dexscreener', token.symbol],
              discoveredAt:    Date.now(),
            });
          }
        }
      } catch { /* skip individual pair failures */ }
    }

    return discovered;
  } catch {
    return [];
  }
}

// ─── Main Discovery Function ──────────────────────────────────────────────────

const DISCOVERY_CACHE_KEY = 'celsor:wallet:discovery:v2';
const DISCOVERY_TTL = 3600; // 1 hour

export async function discoverWallets(forceRefresh = false): Promise<DiscoveredWallet[]> {
  // Return cached if available
  if (!forceRefresh) {
    const cached = await cacheGet<DiscoveredWallet[]>(DISCOVERY_CACHE_KEY);
    if (cached && cached.length > 0) return cached;
  }

  const allDiscovered: DiscoveredWallet[] = [
    // Start with known institutional players
    ...KNOWN_PLAYERS.map(w => ({ ...w, discoveredAt: Date.now() })),
  ];

  // Parallel discovery from all sources
  const [dexDiscovered] = await Promise.allSettled([
    discoverFromDexScreener(),
  ]);

  if (dexDiscovered.status === 'fulfilled') {
    allDiscovered.push(...dexDiscovered.value);
  }

  // Add etherscan discovery for chains that have API keys
  const chains = ['eth', 'arb', 'base', 'bsc', 'op'];
  const keyMap: Record<string, string | undefined> = {
    eth:  process.env.ETH_SCAN_API_KEY,
    arb:  process.env.ARB_SCAN_API_KEY,
    base: process.env.BASE_SCAN_API_KEY,
    bsc:  process.env.BSC_SCAN_API_KEY,
    op:   process.env.OP_SCAN_API_KEY,
  };

  for (const chain of chains) {
    const key = keyMap[chain];
    if (key && key !== 'YourApiKeyToken') {
      const ethDiscovered = await discoverFromEtherscan(chain, key).catch(() => []);
      allDiscovered.push(...ethDiscovered);
    }
  }

  // Deduplicate by address+chain
  const seen = new Set<string>();
  const unique = allDiscovered.filter(w => {
    const k = `${w.address.toLowerCase()}:${w.chain}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  // Sort by estimated AUM
  unique.sort((a, b) => b.estimatedAUM - a.estimatedAUM);

  await cacheSet(DISCOVERY_CACHE_KEY, unique, DISCOVERY_TTL);
  console.log(`[CELSOR WalletScanner] Discovered ${unique.length} wallets from all sources`);

  return unique;
}

// ─── Enrich a single wallet with DeBank data ─────────────────────────────────

export async function enrichWalletWithDeBank(address: string): Promise<{ totalUSD: number; chains: string[] } | null> {
  const cacheKey = `celsor:debank:${address.toLowerCase()}`;
  const cached = await cacheGet<{ totalUSD: number; chains: string[] }>(cacheKey);
  if (cached) return cached;

  const data = await fetchDeBankProfile(address);
  if (data) {
    await cacheSet(cacheKey, data, 3600); // cache 1h
  }
  return data;
}
