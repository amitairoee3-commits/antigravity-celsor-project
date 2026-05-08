// CELSOR ML Signal Scorer
// Weighted ensemble: tx size + wallet age + token velocity + timing + chain weight

export interface OnChainEvent {
  chain: 'eth' | 'sol' | 'bsc' | 'arb' | 'base' | 'op';
  wallet: string;
  tokenSymbol: string;
  tokenAddress: string;
  usdValue: number;
  txHash: string;
  timestamp: number;
  type: 'buy' | 'sell' | 'transfer' | 'mint';
  walletAgeDays?: number;
  walletTxCount?: number;
  priceChangePercent1h?: number;
  volumeSpike?: number; // current vol / avg vol
}

export interface ScoredSignal {
  event: OnChainEvent;
  score: number; // 0-100
  archetype: WalletArchetype;
  anomalyFlag: boolean;
  reasons: string[];
}

export type WalletArchetype = 'smart_money' | 'insider' | 'degen' | 'vc_unlock' | 'bot' | 'whale' | 'unknown';

// Chain weights — higher = more signal value
const CHAIN_WEIGHTS: Record<OnChainEvent['chain'], number> = {
  eth: 1.0,
  arb: 0.9,
  base: 0.85,
  op: 0.8,
  bsc: 0.75,
  sol: 0.95,
};

export function scoreSignal(event: OnChainEvent): ScoredSignal {
  let score = 0;
  const reasons: string[] = [];

  // 1. USD Value component (0-30 pts)
  if (event.usdValue >= 1_000_000) { score += 30; reasons.push('Whale-size position ($1M+)'); }
  else if (event.usdValue >= 100_000) { score += 22; reasons.push('Large position ($100K+)'); }
  else if (event.usdValue >= 10_000) { score += 14; reasons.push('Significant position ($10K+)'); }
  else if (event.usdValue >= 1_000) { score += 6; }

  // 2. Wallet age (0-20 pts) — older wallets = smarter money
  const age = event.walletAgeDays ?? 0;
  if (age > 730) { score += 20; reasons.push('Veteran wallet (2y+)'); }
  else if (age > 365) { score += 14; reasons.push('Established wallet (1y+)'); }
  else if (age > 90) { score += 8; }
  else if (age < 7) { score -= 5; reasons.push('New wallet — elevated risk'); }

  // 3. Volume spike (0-20 pts)
  const spike = event.volumeSpike ?? 1;
  if (spike >= 10) { score += 20; reasons.push(`Volume spike ${spike.toFixed(0)}x above average`); }
  else if (spike >= 5) { score += 14; reasons.push(`Volume spike ${spike.toFixed(0)}x`); }
  else if (spike >= 2) { score += 7; }

  // 4. Price momentum (0-15 pts)
  const pc = event.priceChangePercent1h ?? 0;
  if (Math.abs(pc) >= 20) { score += 15; reasons.push(`Price ${pc > 0 ? '+' : ''}${pc.toFixed(1)}% in 1h`); }
  else if (Math.abs(pc) >= 10) { score += 9; }
  else if (Math.abs(pc) >= 5) { score += 4; }

  // 5. Chain weight multiplier (0-15 pts)
  score += Math.round(15 * CHAIN_WEIGHTS[event.chain]);

  // Apply chain weight as final multiplier
  score = Math.round(score * CHAIN_WEIGHTS[event.chain]);
  score = Math.min(100, Math.max(0, score));

  return {
    event,
    score,
    archetype: classifyArchetype(event),
    anomalyFlag: detectAnomaly(event),
    reasons,
  };
}

function classifyArchetype(event: OnChainEvent): WalletArchetype {
  const age = event.walletAgeDays ?? 0;
  const txCount = event.walletTxCount ?? 0;
  const usd = event.usdValue;

  if (usd >= 500_000 && age > 365) return 'whale';
  if (age > 365 && txCount < 100 && usd >= 10_000) return 'insider';
  if (age > 730 && txCount > 500 && usd >= 50_000) return 'smart_money';
  if (txCount > 2000) return 'bot';
  if (age < 30 && usd >= 5_000) return 'degen';
  if (event.type === 'transfer' && usd >= 100_000) return 'vc_unlock';
  return 'unknown';
}

function detectAnomaly(event: OnChainEvent): boolean {
  const age = event.walletAgeDays ?? 0;
  const txCount = event.walletTxCount ?? 0;
  const spike = event.volumeSpike ?? 1;

  // Dormant wallet suddenly active
  if (age > 180 && txCount < 5 && event.usdValue > 5_000) return true;
  // Extreme volume spike
  if (spike >= 8) return true;
  // Large buy on new token
  if (event.usdValue >= 50_000 && (event.walletAgeDays ?? 0) > 365) return true;
  return false;
}
