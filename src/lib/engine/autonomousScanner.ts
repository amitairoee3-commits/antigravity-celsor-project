// CELSOR Autonomous Wallet Discovery Engine
// Scans markets continuously, auto-selects high-conviction wallets
// No human input needed — the system decides what to watch

import { getTopMovers, pairToOnChainEvent } from '@/lib/data/dexscreener';
import { scoreSignal } from '@/lib/ml/scorer';
import { classifyWallet } from '@/lib/ml/clusterer';

export interface DiscoveredWallet {
  address: string;
  chain: string;
  reason: string;           // Why this wallet was added
  convictionScore: number;  // 0-100
  archetype: string;
  detectedAt: number;
  tokenTrigger: string;     // Which token triggered discovery
  priceAction: number;      // % price change that triggered it
  tags: string[];
}

// In-memory store (persists for the lifetime of the Next.js process)
// In production this would be Supabase/Redis
let discoveredWallets: DiscoveredWallet[] = [];
let lastScanTime = 0;
const SCAN_INTERVAL_MS = 60_000; // 60s minimum between full scans

const CHAINS = ['solana', 'ethereum', 'bsc', 'arbitrum', 'base'];

// Auto-discovery criteria — wallets involved in these events get flagged
const DISCOVERY_RULES = {
  minConvictionScore: 45,
  minVolumeSpike: 2.5,         // 2.5x above average
  minPriceChange1h: 8,         // 8% move in 1h
  minUsdVolume: 10_000,       // $10K minimum
  maxWatchlistSize: 100,      // Auto-prune oldest entries
};

// Synthetic wallet addresses from on-chain event data
// In production: derived from actual tx senders via RPC
function deriveWalletFromPair(pairAddress: string, chainId: string): string {
  // Deterministic pseudo-address from pair data (until real RPC tx parsing added)
  const hash = pairAddress.slice(2, 42).padEnd(40, '0');
  return `0x${hash}`;
}

export async function runAutonomousScan(): Promise<{
  newWallets: DiscoveredWallet[];
  totalWatching: number;
  scannedPairs: number;
}> {
  const now = Date.now();
  
  // Rate-limit full scans
  if (now - lastScanTime < SCAN_INTERVAL_MS) {
    return { newWallets: [], totalWatching: discoveredWallets.length, scannedPairs: 0 };
  }
  lastScanTime = now;

  const newWallets: DiscoveredWallet[] = [];
  let totalPairs = 0;

  // Scan all chains in parallel
  const chainResults = await Promise.allSettled(
    CHAINS.map(chain => getTopMovers(chain))
  );

  for (const result of chainResults) {
    if (result.status !== 'fulfilled') continue;
    const pairs = result.value;
    totalPairs += pairs.length;

    for (const pair of pairs) {
      const event = pairToOnChainEvent(pair);
      const scored = scoreSignal(event);

      // Apply discovery rules
      const meetsThreshold =
        scored.score >= DISCOVERY_RULES.minConvictionScore &&
        (event.volumeSpike ?? 0) >= DISCOVERY_RULES.minVolumeSpike &&
        Math.abs(event.priceChangePercent1h ?? 0) >= DISCOVERY_RULES.minPriceChange1h &&
        event.usdValue >= DISCOVERY_RULES.minUsdVolume;

      if (!meetsThreshold) continue;

      const walletAddress = deriveWalletFromPair(pair.pairAddress, pair.chainId);
      
      // Skip if already watching
      const alreadyTracked = discoveredWallets.some(w => w.address === walletAddress);
      if (alreadyTracked) continue;

      // Build reason string
      const reasons: string[] = [];
      if ((event.volumeSpike ?? 0) >= DISCOVERY_RULES.minVolumeSpike) {
        reasons.push(`${Math.round(event.volumeSpike ?? 0)}x volume spike`);
      }
      if (Math.abs(event.priceChangePercent1h ?? 0) >= DISCOVERY_RULES.minPriceChange1h) {
        const pct = event.priceChangePercent1h ?? 0;
        reasons.push(`${pct > 0 ? '+' : ''}${pct.toFixed(1)}% in 1h`);
      }
      if (scored.anomalyFlag) reasons.push('Anomalous pattern detected');

      // Classify the wallet
      const profile = classifyWallet(
        walletAddress,
        Math.floor(Math.random() * 500 + 30), // age proxy until RPC lookup
        Math.floor(Math.random() * 200 + 10), // tx count proxy
        event.usdValue,
        Math.floor(Math.random() * 30 + 5),
        Math.floor(Math.random() * 10),
        event.chain,
      );

      const wallet: DiscoveredWallet = {
        address: walletAddress,
        chain: event.chain,
        reason: reasons.join(' · '),
        convictionScore: scored.score,
        archetype: profile.archetype,
        detectedAt: now,
        tokenTrigger: event.tokenSymbol,
        priceAction: event.priceChangePercent1h ?? 0,
        tags: [...scored.reasons.slice(0, 2), ...profile.tags.slice(0, 2)],
      };

      newWallets.push(wallet);
      discoveredWallets.push(wallet);
    }
  }

  // Auto-prune oldest entries beyond max size
  if (discoveredWallets.length > DISCOVERY_RULES.maxWatchlistSize) {
    discoveredWallets = discoveredWallets
      .sort((a, b) => b.convictionScore - a.convictionScore) // keep highest conviction
      .slice(0, DISCOVERY_RULES.maxWatchlistSize);
  }

  return {
    newWallets,
    totalWatching: discoveredWallets.length,
    scannedPairs: totalPairs,
  };
}

export function getDiscoveredWallets(): DiscoveredWallet[] {
  return [...discoveredWallets].sort((a, b) => b.convictionScore - a.convictionScore);
}

export function clearDiscoveredWallets(): void {
  discoveredWallets = [];
}
