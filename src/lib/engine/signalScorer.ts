/**
 * CELSOR NEXUS — Signal Scorer v2
 *
 * Scores raw on-chain events into conviction signals.
 * Pure function — no I/O, always fast.
 *
 * HARD RULES:
 *  1. Stablecoins = score 0 = BANNED. Filtered before pipeline.
 *  2. Unknown tokens with no metadata = low baseline.
 *  3. Small-cap tokens with whale accumulation = bonus.
 */

import type { WhaleTx } from '@/lib/data/etherscan';
import { isStablecoin } from '@/lib/data/etherscan';

export interface ScoredSignal {
  id: string;
  walletAddress: string;
  chain: string;
  tokenSymbol: string;
  tokenName: string;
  txHash: string;
  valueUSD: number;
  convictionScore: number;   // 0-100
  anomalyReasons: string[];
  isHighConviction: boolean; // >= 75
  direction: 'LONG' | 'SHORT' | 'WATCH';
  scoredAt: number;
  isStablecoin: false;       // stablecoins never reach this point
}

export interface SignalScoringContext {
  recentAvgVolumeUSD?: number;
  priceChange1h?: number;
  priceChange24h?: number;
  walletConvictionScore?: number;
  tokenMarketCap?: number;
}

// ─── Banned tokens (extended stablecoin list) ─────────────────────────────────

const BANNED_SYMBOLS = new Set([
  // Stablecoins
  'USDT', 'USDC', 'DAI', 'BUSD', 'TUSD', 'FRAX', 'USDD', 'USDP', 'LUSD',
  'SUSD', 'GUSD', 'CUSD', 'MIM', 'UST', 'USDB', 'EURC', 'EURT', 'PYUSD',
  'FDUSD', 'CRVUSD', 'GHO', 'DOLA', 'HUSD', 'OUSD', 'RAI', 'USDX',
  // Wrapped stablecoins
  'AUSDC', 'AUSDT', 'CUDAI', 'CDAI',
  // LP tokens that track stablecoins
  'USDC-LP', 'USDT-LP', 'DAI-LP',
]);

export function scoreTransaction(
  tx: WhaleTx,
  ctx: SignalScoringContext = {},
): ScoredSignal | null {
  // ── HARD BAN — stablecoins never generate signals ─────────────────────────
  if (isStablecoin(tx.tokenSymbol, tx.contractAddress)) return null;
  if (BANNED_SYMBOLS.has((tx.tokenSymbol ?? '').toUpperCase())) return null;

  // ── Unknown token guard ───────────────────────────────────────────────────
  const symbol = tx.tokenSymbol ?? 'UNKNOWN';
  const baseScore = symbol === 'UNKNOWN' ? 15 : 30;

  let score = baseScore;
  const reasons: string[] = [];

  // ── Value-based scoring (USD equivalent) ─────────────────────────────────
  const usdValue = tx.valueEth; // valueEth is already dollar-equivalent
  if (usdValue > 5_000_000)      { score += 35; reasons.push(`$${(usdValue / 1e6).toFixed(1)}M transaction — mega whale`); }
  else if (usdValue > 1_000_000) { score += 28; reasons.push(`$${(usdValue / 1e6).toFixed(1)}M transaction — institutional`); }
  else if (usdValue > 500_000)   { score += 22; reasons.push(`$${(usdValue / 1000).toFixed(0)}K transaction`); }
  else if (usdValue > 100_000)   { score += 15; reasons.push(`$${(usdValue / 1000).toFixed(0)}K tracked wallet accumulation`); }
  else if (usdValue > 50_000)    { score += 8;  }
  else if (usdValue > 10_000)    { score += 3;  }

  // ── Wallet conviction score ───────────────────────────────────────────────
  const walletScore = ctx.walletConvictionScore ?? 40;
  const walletContrib = Math.floor((walletScore - 40) * 0.35);
  score += walletContrib;
  if (walletScore > 85) { reasons.push('Known smart money wallet'); }
  else if (walletScore > 75) { reasons.push('High-conviction wallet'); }

  // ── Price action alignment ────────────────────────────────────────────────
  let direction: 'LONG' | 'SHORT' | 'WATCH' = 'WATCH';

  if (ctx.priceChange1h !== undefined) {
    if (ctx.priceChange1h > 15) {
      score += 12; direction = 'LONG';
      reasons.push(`+${ctx.priceChange1h.toFixed(1)}% momentum breakout`);
    } else if (ctx.priceChange1h > 5) {
      score += 6; direction = 'LONG';
      reasons.push(`+${ctx.priceChange1h.toFixed(1)}% price action`);
    } else if (ctx.priceChange1h < -15) {
      score += 10; direction = 'LONG';
      reasons.push(`Whale accumulating into -${Math.abs(ctx.priceChange1h).toFixed(1)}% dip`);
    } else if (ctx.priceChange1h < -5) {
      score += 5; direction = 'LONG';
      reasons.push(`Smart money buying dip (-${Math.abs(ctx.priceChange1h).toFixed(1)}%)`);
    }
  }

  // ── Volume anomaly (spike detection) ─────────────────────────────────────
  if (ctx.recentAvgVolumeUSD && ctx.recentAvgVolumeUSD > 0) {
    const spike = usdValue / ctx.recentAvgVolumeUSD;
    if (spike > 20)      { score += 22; reasons.push(`${spike.toFixed(0)}x volume spike — extreme anomaly`); }
    else if (spike > 10) { score += 16; reasons.push(`${spike.toFixed(0)}x volume spike`); }
    else if (spike > 5)  { score += 10; reasons.push(`${spike.toFixed(1)}x volume spike`); }
    else if (spike > 3)  { score += 5;  reasons.push(`${spike.toFixed(1)}x above avg`); }
  }

  // ── Small-cap bonus (moves are proportionally larger) ────────────────────
  if (ctx.tokenMarketCap) {
    if (ctx.tokenMarketCap < 10_000_000) {
      score += 15; reasons.push('Micro-cap — whale impact is outsized');
    } else if (ctx.tokenMarketCap < 100_000_000) {
      score += 8; reasons.push('Small-cap — high impact potential');
    }
  }

  // ── Native chain token bonus (ETH, BNB moves are always significant) ─────
  if (tx.isNative) {
    score += 5;
    if (usdValue > 500_000) reasons.push('Native ETH/BNB movement — institutional');
  }

  // ── Direction default based on value ─────────────────────────────────────
  if (direction === 'WATCH' && score >= 60) direction = 'LONG';

  // ── Cap and floor ─────────────────────────────────────────────────────────
  score = Math.max(5, Math.min(100, score));

  return {
    id: `sig_${tx.hash.slice(2, 12)}_${Date.now()}`,
    walletAddress: tx.from,
    chain: tx.chain,
    tokenSymbol: symbol,
    tokenName: tx.tokenName ?? 'Unknown Token',
    txHash: tx.hash,
    valueUSD: usdValue,
    convictionScore: score,
    anomalyReasons: reasons.length > 0 ? reasons : [`$${(usdValue / 1000).toFixed(0)}K ${symbol} transaction`],
    isHighConviction: score >= 75,
    direction,
    scoredAt: Date.now(),
    isStablecoin: false,
  };
}

/**
 * Score a batch of transactions.
 * Null results (stablecoins) are automatically filtered out.
 */
export function scoreBatch(
  txns: WhaleTx[],
  ctx: SignalScoringContext = {},
  topN = 10,
): ScoredSignal[] {
  return txns
    .map(tx => scoreTransaction(tx, ctx))
    .filter((s): s is ScoredSignal => s !== null) // strips stablecoins
    .sort((a, b) => b.convictionScore - a.convictionScore)
    .slice(0, topN);
}
