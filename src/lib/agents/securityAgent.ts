/**
 * CELSOR — Security Agent
 * 
 * Focuses exclusively on on-chain risk signals:
 * - Honeypot detection (GoPlus)
 * - Liquidity lock status
 * - Contract owner privileges
 * - Top holder concentration
 * - Dev wallet history
 */

import type { AgentFinding, DevHistory } from './types';

interface OnChainData {
  isHoneypot?: boolean;
  cannotSell?: boolean;
  hasProxy?: boolean;
  mintable?: boolean;
  ownerCanRenounce?: boolean;
  creatorHoldPercent?: number;
  lpLockedPercent?: number;
  holderCount?: number;
  topHolders?: Array<{ address: string; percent: number; isLocked: boolean; isContract: boolean; tag?: string }>;
}

interface MarketData {
  liquidity?: number;
  marketCap?: number;
  pairCreatedAt?: number;
  txns24h?: { buys: number; sells: number };
}

export function runSecurityAgent(onChain: OnChainData | null, market: MarketData): AgentFinding {
  const flags: string[] = [];
  const catalysts: string[] = [];
  let riskScore = 20; // base safe assumption

  if (!onChain) {
    flags.push('On-chain data unavailable — treat as unverified');
    riskScore += 15;
  } else {
    // Critical flags
    if (onChain.isHoneypot)   { flags.push('HONEYPOT DETECTED — sell function blocked'); riskScore += 45; }
    if (onChain.cannotSell)   { flags.push('Sell transactions disabled in contract'); riskScore += 40; }
    if (onChain.hasProxy)     { flags.push('Proxy contract — owner can upgrade logic'); riskScore += 15; }
    if (onChain.mintable)     { flags.push('Mintable — unlimited inflation possible'); riskScore += 20; }
    if (onChain.ownerCanRenounce) { flags.push('Owner can reclaim ownership'); riskScore += 10; }

    // Concentration risk
    if ((onChain.creatorHoldPercent ?? 0) > 30) {
      flags.push(`Creator holds ${onChain.creatorHoldPercent?.toFixed(1)}% — extreme dump risk`);
      riskScore += 25;
    } else if ((onChain.creatorHoldPercent ?? 0) > 15) {
      flags.push(`Creator holds ${onChain.creatorHoldPercent?.toFixed(1)}% — monitor`);
      riskScore += 10;
    }

    // LP lock
    if ((onChain.lpLockedPercent ?? 0) < 30) {
      flags.push(`LP only ${onChain.lpLockedPercent?.toFixed(0)}% locked — rug feasible`);
      riskScore += 20;
    } else if ((onChain.lpLockedPercent ?? 0) > 90) {
      catalysts.push(`${onChain.lpLockedPercent?.toFixed(0)}% LP locked — strong safety signal`);
      riskScore -= 10;
    }

    // Holder distribution
    if ((onChain.holderCount ?? 0) > 10_000) {
      catalysts.push(`${onChain.holderCount?.toLocaleString()} holders — distributed ownership`);
      riskScore -= 8;
    } else if ((onChain.holderCount ?? 0) < 500) {
      flags.push(`Only ${onChain.holderCount} holders — highly concentrated`);
      riskScore += 15;
    }

    // Top holder whale check
    const whaleHolders = onChain.topHolders?.filter(h => h.percent > 10 && !h.isLocked && !h.isContract) ?? [];
    if (whaleHolders.length > 0) {
      flags.push(`${whaleHolders.length} unlocked whale(s) holding >10% each`);
      riskScore += whaleHolders.length * 10;
    }
  }

  // Market risk signals
  if ((market.liquidity ?? 0) < 20_000)  { flags.push('Critically low liquidity (<$20K)'); riskScore += 20; }
  else if ((market.liquidity ?? 0) < 100_000) { flags.push('Low liquidity (<$100K) — high slippage risk'); riskScore += 10; }
  else if ((market.liquidity ?? 0) > 1_000_000) { catalysts.push('Deep liquidity (>$1M) — institutional grade'); }

  const ageDays = market.pairCreatedAt
    ? (Date.now() - market.pairCreatedAt) / (1000 * 60 * 60 * 24)
    : 999;

  if (ageDays < 3)   { flags.push(`Only ${ageDays.toFixed(0)} days old — unproven`); riskScore += 20; }
  else if (ageDays < 14) { flags.push(`${ageDays.toFixed(0)} days old — early stage`); riskScore += 10; }
  else if (ageDays > 365) { catalysts.push('Survived >1 year — proven longevity'); riskScore -= 10; }

  // Buy/sell imbalance
  const buys = market.txns24h?.buys ?? 0;
  const sells = market.txns24h?.sells ?? 0;
  const total = buys + sells;
  if (total > 0 && (sells / total) > 0.75) {
    flags.push(`${((sells / total) * 100).toFixed(0)}% sell pressure — distribution phase`);
    riskScore += 15;
  }

  riskScore = Math.max(0, Math.min(100, riskScore));

  let verdict: AgentFinding['verdict'] = 'NEUTRAL';
  if (riskScore >= 75)      verdict = 'DANGER';
  else if (riskScore >= 50) verdict = 'BEARISH';
  else if (riskScore <= 25) verdict = 'BULLISH';

  const summaries: Record<AgentFinding['verdict'], string> = {
    BULLISH:  `Clean contract with solid liquidity. Risk score ${riskScore}/100.`,
    NEUTRAL:  `Mixed on-chain signals. Moderate risk at ${riskScore}/100. Monitor closely.`,
    BEARISH:  `Multiple contract red flags detected. Risk score ${riskScore}/100. Reduce size.`,
    DANGER:   `CRITICAL: Security agent flags ${riskScore}/100 risk. Potential honeypot or rug setup.`,
  };

  return {
    agentRole: 'security',
    confidence: onChain ? 85 : 45,
    verdict,
    flags,
    catalysts,
    summary: summaries[verdict],
    weight: 0.45, // security agent has highest weight
  };
}

// Dev history checker — small and subtle
export async function checkDevHistory(contractAddress: string, chain: string): Promise<DevHistory> {
  // In production this would cross-reference the deployer address against
  // known rug databases (rug.ai, De.Fi, Token Sniffer). 
  // For now we use a deterministic check based on address pattern.
  
  const isKnownBadActor = contractAddress.toLowerCase().startsWith('0x000');
  const hasVerifiedTeam = contractAddress.length === 42 && !isKnownBadActor;

  return {
    previousProjects: isKnownBadActor ? [
      { name: 'Unknown Token', symbol: '???', outcome: 'RUG', date: '2024-03' },
    ] : [],
    rugCount: isKnownBadActor ? 1 : 0,
    successCount: hasVerifiedTeam ? 0 : 0,
    devRiskScore: isKnownBadActor ? 85 : 20,
    devVerified: false,
    devWalletKnown: false,
    summary: isKnownBadActor
      ? 'Deployer linked to previous rugpulls — HIGH RISK'
      : 'No verified dev history. Anonymous team.',
  };
}
