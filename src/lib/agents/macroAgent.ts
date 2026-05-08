/**
 * CELSOR — Macro Intelligence Agent
 *
 * The third agent in the debate. Runs INDEPENDENTLY (not just on conflict).
 * Focuses on market structure, price action, and macro context:
 *  - Price action (momentum, dip accumulation, breakout)
 *  - Volume/liquidity health
 *  - MCap vs Liquidity ratio
 *  - Buy/Sell pressure (order flow imbalance)
 *  - Whale timing patterns (early vs late)
 *  - DEX listing age vs traction velocity
 *
 * Weight: 0.25 (independent of conflict)
 * This agent never defers to the Security agent — it speaks for market structure.
 */

import type { AgentFinding } from './types';

export interface MacroData {
  price?: number;
  priceChange1h?: number;
  priceChange24h?: number;
  priceChange7d?: number;
  volume24h?: number;
  volumeChange24h?: number;    // % change vs previous 24h
  liquidity?: number;
  marketCap?: number;
  fdv?: number;               // Fully diluted valuation
  pairCreatedAt?: number;     // Unix timestamp
  txns1h?: { buys: number; sells: number };
  txns24h?: { buys: number; sells: number };
  priceHigh24h?: number;
  priceLow24h?: number;
  whaleTxValueUSD?: number;   // The whale tx that triggered this analysis
  tokenSymbol?: string;
}

interface MacroVerdict {
  score: number;          // 0-100 (higher = more bullish macro)
  trend: 'ACCUMULATION' | 'DISTRIBUTION' | 'BREAKOUT' | 'CONSOLIDATION' | 'DUMP';
  momentum: 'STRONG_BULL' | 'BULL' | 'NEUTRAL' | 'BEAR' | 'STRONG_BEAR';
  whaleTimingQuality: 'EARLY' | 'OPTIMAL' | 'LATE' | 'UNKNOWN';
}

function analyzeMacroStructure(data: MacroData): MacroVerdict {
  let score = 50; // neutral baseline
  const flags: string[] = [];
  const catalysts: string[] = [];

  // ── Price action analysis ─────────────────────────────────────────────────
  const p1h  = data.priceChange1h  ?? 0;
  const p24h = data.priceChange24h ?? 0;
  const p7d  = data.priceChange7d  ?? 0;

  // Momentum checks
  if (p1h > 20)       { score += 15; catalysts.push(`+${p1h.toFixed(1)}% 1h breakout`); }
  else if (p1h > 10)  { score += 10; catalysts.push(`+${p1h.toFixed(1)}% 1h momentum`); }
  else if (p1h > 3)   { score += 5;  catalysts.push(`+${p1h.toFixed(1)}% 1h move`); }
  else if (p1h < -20) { score -= 15; flags.push(`-${Math.abs(p1h).toFixed(1)}% 1h crash`); }
  else if (p1h < -10) { score -= 8;  flags.push(`-${Math.abs(p1h).toFixed(1)}% 1h drop`); }

  // 24h context
  if (p24h > 50)       { score += 8;  catalysts.push(`+${p24h.toFixed(0)}% 24h parabolic`); }
  else if (p24h > 20)  { score += 5;  catalysts.push(`+${p24h.toFixed(0)}% 24h gain`); }
  else if (p24h < -30) { score -= 10; flags.push(`${p24h.toFixed(0)}% 24h decline`); }

  // Weekly trend (context for whale positioning)
  if (p7d > 100)      { score -= 5;  flags.push(`+${p7d.toFixed(0)}% 7d — late in run`); }
  else if (p7d > 30)  { score += 5;  catalysts.push(`+${p7d.toFixed(0)}% 7d healthy trend`); }
  else if (p7d < -50) { score += 8;  catalysts.push(`${p7d.toFixed(0)}% 7d down — whale accumulating at lows`); }
  else if (p7d < -20) { score += 4;  }

  // ── MCap / Liquidity health ───────────────────────────────────────────────
  const liq  = data.liquidity  ?? 0;
  const mcap = data.marketCap  ?? 0;
  const fdv  = data.fdv        ?? mcap;

  if (liq > 0 && mcap > 0) {
    const ratio = mcap / liq;
    if (ratio > 100)    { score -= 20; flags.push(`MCap/Liq: ${ratio.toFixed(0)}x — extreme rug risk`); }
    else if (ratio > 50){ score -= 12; flags.push(`MCap/Liq: ${ratio.toFixed(0)}x — overvalued vs liquidity`); }
    else if (ratio > 20){ score -= 5;  flags.push(`MCap/Liq: ${ratio.toFixed(0)}x — elevated`); }
    else if (ratio < 5) { score += 12; catalysts.push(`MCap/Liq: ${ratio.toFixed(1)}x — deep liquidity`); }
    else if (ratio < 10){ score += 6;  catalysts.push(`Healthy MCap/Liq: ${ratio.toFixed(1)}x`); }
  }

  // FDV vs MCap (dilution risk)
  if (mcap > 0 && fdv > mcap * 3) {
    score -= 8;
    flags.push(`FDV is ${(fdv / mcap).toFixed(0)}x MCap — heavy future dilution`);
  }

  // Absolute liquidity gates
  if (liq < 20_000)     { score -= 20; flags.push('Critical liquidity (<$20K)'); }
  else if (liq < 100_000){ score -= 8; flags.push('Thin liquidity (<$100K)'); }
  else if (liq > 1_000_000) { score += 8; catalysts.push('Deep liquidity (>$1M)'); }
  else if (liq > 500_000)   { score += 4; }

  // ── Volume analysis ────────────────────────────────────────────────────────
  const vol24h = data.volume24h ?? 0;
  const volChange = data.volumeChange24h ?? 0;

  if (liq > 0 && vol24h > 0) {
    const volToLiq = vol24h / liq;
    if (volToLiq > 10)    { score += 12; catalysts.push(`Volume ${volToLiq.toFixed(0)}x liquidity — explosive`); }
    else if (volToLiq > 3){ score += 6;  catalysts.push(`Volume ${volToLiq.toFixed(1)}x liquidity — active`); }
    else if (volToLiq < 0.1){ score -= 5; flags.push('Volume very low vs liquidity'); }
  }

  if (volChange > 200)      { score += 10; catalysts.push(`Volume up ${volChange.toFixed(0)}%`); }
  else if (volChange > 50)  { score += 5; }
  else if (volChange < -60) { score -= 8; flags.push(`Volume declining ${Math.abs(volChange).toFixed(0)}%`); }

  // ── Order flow (buy/sell pressure) ────────────────────────────────────────
  const buys1h  = data.txns1h?.buys  ?? 0;
  const sells1h = data.txns1h?.sells ?? 0;
  const total1h = buys1h + sells1h;

  if (total1h > 0) {
    const buyPressure1h = buys1h / total1h;
    if (buyPressure1h > 0.75)      { score += 12; catalysts.push(`${(buyPressure1h * 100).toFixed(0)}% buy pressure 1h`); }
    else if (buyPressure1h > 0.60) { score += 6;  catalysts.push(`Bullish flow: ${(buyPressure1h * 100).toFixed(0)}% buys`); }
    else if (buyPressure1h < 0.30) { score -= 15; flags.push(`${((1 - buyPressure1h) * 100).toFixed(0)}% sell pressure — distribution`); }
    else if (buyPressure1h < 0.45) { score -= 8;  flags.push(`Bearish flow: ${((1 - buyPressure1h) * 100).toFixed(0)}% sells`); }
  }

  // 24h order flow
  const buys24h  = data.txns24h?.buys  ?? 0;
  const sells24h = data.txns24h?.sells ?? 0;
  const total24h = buys24h + sells24h;
  if (total24h > 0) {
    const buyPressure24h = buys24h / total24h;
    if (buyPressure24h > 0.70) { score += 5; }
    else if (buyPressure24h < 0.35) { score -= 8; flags.push(`24h: ${((1 - buyPressure24h) * 100).toFixed(0)}% sell dominated`); }
  }

  // ── Whale timing quality ───────────────────────────────────────────────────
  // Is the whale buying early (deep in dip) or late (parabolic)?
  let whaleTimingQuality: MacroVerdict['whaleTimingQuality'] = 'UNKNOWN';
  if (data.whaleTxValueUSD && data.whaleTxValueUSD > 50_000) {
    if (p24h < -20 && p7d < -30) {
      whaleTimingQuality = 'EARLY'; // buying at lows
      score += 8;
      catalysts.push('Whale accumulating at multi-day lows — early timing');
    } else if (p24h > 50 && p7d > 100) {
      whaleTimingQuality = 'LATE'; // buying at highs
      score -= 10;
      flags.push('Whale buying at parabolic top — late timing risk');
    } else if (p24h > 0 && p24h < 30) {
      whaleTimingQuality = 'OPTIMAL'; // buying healthy uptrend
      score += 5;
    } else {
      whaleTimingQuality = 'OPTIMAL';
    }
  }

  // ── Token age velocity ─────────────────────────────────────────────────────
  if (data.pairCreatedAt) {
    const ageDays = (Date.now() - data.pairCreatedAt) / (1000 * 60 * 60 * 24);
    if (ageDays < 1)        { score -= 20; flags.push('Listed <24h ago — extremely high risk'); }
    else if (ageDays < 7)   { score -= 10; flags.push(`Only ${ageDays.toFixed(0)} days old — unproven`); }
    else if (ageDays < 30)  { score -= 4;  }
    else if (ageDays > 365) { score += 6;  catalysts.push('Survived >1 year — battle-tested'); }
    else if (ageDays > 90)  { score += 3;  }
  }

  // ── Determine trend and momentum ──────────────────────────────────────────
  let trend: MacroVerdict['trend'];
  if (buys1h > sells1h * 1.5 && p1h > 5)          trend = 'BREAKOUT';
  else if (sells1h > buys1h * 1.5 || p1h < -10)   trend = 'DUMP';
  else if (p24h < -20 && buys1h > sells1h)         trend = 'ACCUMULATION';
  else if (p24h > 20 && sells1h > buys1h)          trend = 'DISTRIBUTION';
  else                                              trend = 'CONSOLIDATION';

  let momentum: MacroVerdict['momentum'];
  if (p1h > 15 && p24h > 30)      momentum = 'STRONG_BULL';
  else if (p1h > 5 || p24h > 10)  momentum = 'BULL';
  else if (p1h < -15 && p24h < -20) momentum = 'STRONG_BEAR';
  else if (p1h < -5 || p24h < -10) momentum = 'BEAR';
  else                              momentum = 'NEUTRAL';

  score = Math.max(0, Math.min(100, score));

  return { score, trend, momentum, whaleTimingQuality };
}

export function runMacroAgent(data: MacroData): AgentFinding {
  const { score, trend, momentum, whaleTimingQuality } = analyzeMacroStructure(data);

  const flags: string[] = [];
  const catalysts: string[] = [];

  // Re-run analysis to populate flags/catalysts for the report
  const p24h = data.priceChange24h ?? 0;
  const liq  = data.liquidity ?? 0;
  const mcap = data.marketCap ?? 0;

  if (trend === 'DUMP')         { flags.push(`Market structure: DUMP in progress`); }
  if (trend === 'DISTRIBUTION') { flags.push(`Distribution pattern detected — smart money exiting`); }
  if (trend === 'ACCUMULATION') { catalysts.push(`ACCUMULATION phase — whales absorbing supply`); }
  if (trend === 'BREAKOUT')     { catalysts.push(`BREAKOUT structure — momentum buy signal`); }
  if (trend === 'CONSOLIDATION'){ catalysts.push(`Tight consolidation — energy coiling`); }

  if (whaleTimingQuality === 'EARLY') { catalysts.push('Whale timing: EARLY accumulation'); }
  if (whaleTimingQuality === 'LATE')  { flags.push('Whale timing: LATE (top-of-run risk)'); }
  if (whaleTimingQuality === 'OPTIMAL') { catalysts.push('Whale timing: optimal entry zone'); }

  if (momentum === 'STRONG_BULL') { catalysts.push('Strong bullish momentum across timeframes'); }
  if (momentum === 'STRONG_BEAR') { flags.push('Strong bearish momentum — avoid'); }

  if (liq > 0 && mcap > 0) {
    const ratio = mcap / liq;
    if (ratio < 10) catalysts.push(`Healthy MCap/Liq: ${ratio.toFixed(1)}x`);
    else if (ratio > 50) flags.push(`Dangerous MCap/Liq: ${ratio.toFixed(0)}x`);
  }

  // Verdict
  let verdict: AgentFinding['verdict'];
  if (score >= 70)      verdict = 'BULLISH';
  else if (score >= 50) verdict = 'NEUTRAL';
  else if (score >= 30) verdict = 'BEARISH';
  else                  verdict = 'DANGER';

  const trendLabel = {
    ACCUMULATION: 'Smart money accumulating',
    DISTRIBUTION: 'Distribution detected',
    BREAKOUT:     'Breakout structure confirmed',
    CONSOLIDATION: 'Consolidating',
    DUMP:         'Active dump in progress',
  }[trend];

  return {
    agentRole: 'economic',
    confidence: data.price !== undefined ? 80 : 50,
    verdict,
    flags: flags.slice(0, 4),
    catalysts: catalysts.slice(0, 4),
    summary: `Macro score: ${score}/100. ${trendLabel}. Momentum: ${momentum}. Whale timing: ${whaleTimingQuality}. MCap: $${(mcap / 1_000_000).toFixed(2)}M.`,
    weight: 0.25,
  };
}
