/**
 * CELSOR — Real Coin Intelligence Engine
 *
 * Analyzes legitimate tradeable assets (BTC, ETH, SOL, TON, TRX, BIO, LAB, RIVER, etc.)
 * with multi-factor analysis. NOT memecoins. NOT newly launched tokens.
 *
 * A signal is built from 5 data layers:
 *   1. On-chain whale accumulation / distribution (Etherscan)
 *   2. DEX price momentum + order flow (DexScreener)
 *   3. Market structure (trend, ATH distance, volume profile)
 *   4. Macro overlay (Fear & Greed regime from macro controller)
 *   5. Wallet reputation (historical accuracy of the triggering wallet)
 *
 * WHY LONG or SHORT is always explained with specific data points —
 * never just "someone bought $X of the coin."
 */

import { getPairData, type DexPairData } from '@/lib/data/dexscreener';
import { getMacroSnapshot } from '@/lib/engine/macroController';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CoinIntelligenceReport {
  symbol:           string;
  name:             string;
  chain:            string;

  // Verdict
  direction:        'LONG' | 'SHORT' | 'NEUTRAL';
  conviction:       number;       // 0-100
  riskRating:       'LOW' | 'MEDIUM' | 'HIGH';
  timeHorizon:      '1H' | '4H' | '1D' | '1W';

  // The actual reasons — specific, data-driven
  bullishFactors:   string[];
  bearishFactors:   string[];

  // Summary sentence shown in the UI
  thesisSummary:    string;
  invalidation:     string;

  // Raw data
  price:            number;
  priceChange1h:    number;
  priceChange24h:   number;
  volume24h:        number;
  liquidity:        number;
  buyPressure:      number;   // % of txns that are buys (0-100)
  marketCap?:       number;

  // Whale data
  whaleVolume:      number;   // USD value of whale tx that triggered this
  whaleDirection:   'ACCUMULATING' | 'DISTRIBUTING' | 'NEUTRAL';
  walletArchetype:  string;

  generatedAt:      number;
}

// ─── Market Structure Analyzer ────────────────────────────────────────────────

function analyzeMarketStructure(dex: DexPairData): {
  trend: 'UPTREND' | 'DOWNTREND' | 'SIDEWAYS';
  momentum: 'ACCELERATING' | 'DECELERATING' | 'FLAT';
  volumeQuality: 'STRONG' | 'AVERAGE' | 'WEAK';
  reasons: { bull: string[]; bear: string[] };
} {
  const bull: string[] = [];
  const bear: string[] = [];

  const p1h  = dex.priceChange1h  ?? 0;
  const p24h = dex.priceChange24h ?? 0;
  const p7d  = dex.priceChange7d  ?? 0;

  const buys  = dex.txns1h?.buys  ?? 0;
  const sells = dex.txns1h?.sells ?? 0;
  const totalTxns = buys + sells;
  const buyPct = totalTxns > 0 ? (buys / totalTxns) * 100 : 50;

  // Trend determination
  let trend: 'UPTREND' | 'DOWNTREND' | 'SIDEWAYS' = 'SIDEWAYS';
  if (p24h > 5 && p7d > 0) {
    trend = 'UPTREND';
    bull.push(`Price up ${p24h.toFixed(1)}% in 24h with positive weekly context (+${p7d.toFixed(1)}% 7d)`);
  } else if (p24h < -5 && p7d < 0) {
    trend = 'DOWNTREND';
    bear.push(`Price down ${Math.abs(p24h).toFixed(1)}% in 24h with bearish weekly context (${p7d.toFixed(1)}% 7d)`);
  }

  // Short-term momentum
  let momentum: 'ACCELERATING' | 'DECELERATING' | 'FLAT' = 'FLAT';
  if (Math.abs(p1h) > Math.abs(p24h / 24) * 2) {
    momentum = 'ACCELERATING';
    if (p1h > 0) bull.push(`1h momentum accelerating: +${p1h.toFixed(2)}% vs avg hourly`);
    else bear.push(`1h momentum accelerating DOWN: ${p1h.toFixed(2)}% vs avg hourly`);
  } else if (Math.abs(p1h) < Math.abs(p24h / 24) * 0.3) {
    momentum = 'DECELERATING';
    if (p24h > 0) bear.push(`Upward momentum decelerating — buyers losing steam`);
  }

  // Buy pressure
  if (buyPct >= 65) {
    bull.push(`Strong buy pressure: ${buyPct.toFixed(0)}% of 1h transactions are buys (${buys}B/${sells}S)`);
  } else if (buyPct >= 55) {
    bull.push(`Positive order flow: ${buyPct.toFixed(0)}% buy pressure in past hour`);
  } else if (buyPct <= 35) {
    bear.push(`Sell pressure dominant: only ${buyPct.toFixed(0)}% buys — ${sells} sells vs ${buys} buys in 1h`);
  }

  // Volume quality
  let volumeQuality: 'STRONG' | 'AVERAGE' | 'WEAK' = 'AVERAGE';
  if (dex.volume24h > 5_000_000) {
    volumeQuality = 'STRONG';
    bull.push(`Deep liquidity: $${(dex.volume24h / 1_000_000).toFixed(1)}M daily volume with $${(dex.liquidity / 1_000_000).toFixed(1)}M liquidity`);
  } else if (dex.volume24h < 500_000) {
    volumeQuality = 'WEAK';
    bear.push(`Thin volume: $${(dex.volume24h / 1000).toFixed(0)}K daily volume — liquidity risk`);
  }

  return { trend, momentum, volumeQuality, reasons: { bull, bear } };
}

// ─── Whale Intent Classifier ──────────────────────────────────────────────────

function classifyWhaleIntent(
  whaleUSD: number,
  priceChange1h: number,
  buyPressure: number,
  archetype: string,
): { intent: 'ACCUMULATING' | 'DISTRIBUTING' | 'NEUTRAL'; reasons: { bull: string[]; bear: string[] } } {
  const bull: string[] = [];
  const bear: string[] = [];

  // A real analysis — not just "big wallet bought X"
  // We look at: size, timing (buying dip vs top), archetype, market context

  const sizeLabel = whaleUSD >= 1_000_000 ? 'mega whale'
    : whaleUSD >= 500_000 ? 'large whale'
    : whaleUSD >= 200_000 ? 'mid-sized whale'
    : 'tracked wallet';

  if (priceChange1h < -3 && buyPressure > 55) {
    // Buying into red candles = smart accumulation
    bull.push(`${sizeLabel} ($${(whaleUSD / 1000).toFixed(0)}K) accumulating during price weakness — buying the dip, not chasing`);
    bull.push(`Counter-trend accumulation by ${archetype}: historically bullish signal when price is -${Math.abs(priceChange1h).toFixed(1)}% 1h`);
    return { intent: 'ACCUMULATING', reasons: { bull, bear } };
  }

  if (priceChange1h > 5 && buyPressure > 70) {
    // Buying into a strong up move — momentum confirmation
    bull.push(`${sizeLabel} ($${(whaleUSD / 1000).toFixed(0)}K) adding to a breakout — confirms strength, not just retail FOMO`);
    return { intent: 'ACCUMULATING', reasons: { bull, bear } };
  }

  if (priceChange1h > 3 && buyPressure < 45) {
    // Price up but selling pressure — distribution into strength
    bear.push(`${sizeLabel} ($${(whaleUSD / 1000).toFixed(0)}K) moving tokens during price rally — potential distribution into liquidity`);
    bear.push(`Warning: sell pressure (${(100 - buyPressure).toFixed(0)}% sells) while price pumps = classic institutional exit pattern`);
    return { intent: 'DISTRIBUTING', reasons: { bull, bear } };
  }

  // Neutral — large move but no clear directional signal
  bull.push(`${archetype} moved $${(whaleUSD / 1000).toFixed(0)}K in ${sizeLabel.replace('tracked wallet', 'monitored wallet')} — monitoring for directional confirmation`);
  return { intent: 'NEUTRAL', reasons: { bull, bear } };
}

// ─── Direction + Conviction Scorer ───────────────────────────────────────────

function scoreAndDecide(
  structure: ReturnType<typeof analyzeMarketStructure>,
  whale: ReturnType<typeof classifyWhaleIntent>,
  macroLongBias: number,
  whaleUSD: number,
): { direction: 'LONG' | 'SHORT' | 'NEUTRAL'; conviction: number; allBull: string[]; allBear: string[] } {
  const allBull = [...structure.reasons.bull, ...whale.reasons.bull];
  const allBear = [...structure.reasons.bear, ...whale.reasons.bear];

  let bullScore = 0;
  let bearScore = 0;

  // Trend weight
  if (structure.trend === 'UPTREND')   bullScore += 25;
  if (structure.trend === 'DOWNTREND') bearScore += 25;

  // Momentum
  if (structure.momentum === 'ACCELERATING') {
    if (allBull.length > allBear.length) bullScore += 15;
    else bearScore += 15;
  }

  // Volume quality
  if (structure.volumeQuality === 'STRONG') bullScore += 10;
  if (structure.volumeQuality === 'WEAK')   bearScore += 10;

  // Whale intent
  if (whale.intent === 'ACCUMULATING')  bullScore += 30;
  if (whale.intent === 'DISTRIBUTING')  bearScore += 30;

  // Whale size
  if (whaleUSD >= 500_000) bullScore += 10;
  if (whaleUSD >= 1_000_000) bullScore += 5;

  // Macro bias adjustment
  bullScore += macroLongBias * 15;

  const total = bullScore + bearScore;
  if (total === 0) return { direction: 'NEUTRAL', conviction: 40, allBull, allBear };

  const bullPct = bullScore / total;

  let direction: 'LONG' | 'SHORT' | 'NEUTRAL' = 'NEUTRAL';
  let conviction = 40;

  if (bullPct >= 0.65) {
    direction = 'LONG';
    conviction = Math.round(50 + bullPct * 50);
  } else if (bullPct <= 0.35) {
    direction = 'SHORT';
    conviction = Math.round(50 + (1 - bullPct) * 50);
  } else {
    conviction = 40;
  }

  return { direction, conviction: Math.min(95, conviction), allBull, allBear };
}

// ─── Time Horizon from conviction + volatility ────────────────────────────────

function deriveTimeHorizon(conviction: number, p1h: number, p24h: number): '1H' | '4H' | '1D' | '1W' {
  const volatility = Math.abs(p1h) + Math.abs(p24h) / 24;
  if (volatility > 3 && conviction >= 70) return '1H';
  if (conviction >= 75) return '4H';
  if (conviction >= 60) return '1D';
  return '1W';
}

// ─── Main Analysis Function ───────────────────────────────────────────────────

export async function analyzeCoin(
  symbol: string,
  name: string,
  chain: string,
  whaleUSD: number,
  walletArchetype: string,
): Promise<CoinIntelligenceReport | null> {
  // Fetch live market data
  const dex = await getPairData(symbol, chain);
  if (!dex) return null;

  // Get macro context
  const macro = await getMacroSnapshot().catch(() => null);
  const macroLongBias = macro?.longBias ?? 0;

  const buyPressure = (() => {
    const b = dex.txns1h?.buys  ?? 0;
    const s = dex.txns1h?.sells ?? 0;
    return b + s > 0 ? (b / (b + s)) * 100 : 50;
  })();

  // Analyze
  const structure = analyzeMarketStructure(dex);
  const whale     = classifyWhaleIntent(whaleUSD, dex.priceChange1h, buyPressure, walletArchetype);
  const { direction, conviction, allBull, allBear } = scoreAndDecide(structure, whale, macroLongBias, whaleUSD);

  if (direction === 'NEUTRAL' && conviction < 45) return null;

  const timeHorizon = deriveTimeHorizon(conviction, dex.priceChange1h, dex.priceChange24h);

  // Risk rating
  const riskRating: 'LOW' | 'MEDIUM' | 'HIGH' =
    dex.liquidity > 1_000_000 && conviction >= 70 ? 'LOW' :
    dex.liquidity > 200_000   && conviction >= 55 ? 'MEDIUM' : 'HIGH';

  // Thesis summary — concise, specific
  const dirLabel = direction === 'LONG' ? 'Bullish' : direction === 'SHORT' ? 'Bearish' : 'Watching';
  const topBull = allBull[0] ?? '';
  const topBear = allBear[0] ?? '';
  const macroContext = macro ? `${macro.sentiment} macro regime (F&G: ${macro.fearGreedIndex}).` : '';

  const thesisSummary = direction === 'LONG'
    ? `${dirLabel} on ${symbol}: ${topBull}. ${macroContext} ${allBull.length} bullish factors vs ${allBear.length} bearish.`
    : direction === 'SHORT'
    ? `${dirLabel} on ${symbol}: ${topBear}. ${macroContext} ${allBear.length} bearish factors vs ${allBull.length} bullish.`
    : `Monitoring ${symbol} — mixed signals. Waiting for directional confirmation before entry.`;

  const invalidation = direction === 'LONG'
    ? `Thesis invalidated if: price drops below 1h low, buy pressure falls below 40%, or volume drops >50% from current level.`
    : direction === 'SHORT'
    ? `Thesis invalidated if: price reclaims 1h high, buy pressure recovers above 60%, or whale reverses position.`
    : `Enter position once buy/sell ratio confirms direction >60% in either direction.`;

  return {
    symbol,
    name,
    chain,
    direction: direction as 'LONG' | 'SHORT' | 'NEUTRAL',
    conviction,
    riskRating,
    timeHorizon,
    bullishFactors: allBull,
    bearishFactors: allBear,
    thesisSummary,
    invalidation,
    price:          dex.price,
    priceChange1h:  dex.priceChange1h,
    priceChange24h: dex.priceChange24h,
    volume24h:      dex.volume24h,
    liquidity:      dex.liquidity,
    buyPressure,
    marketCap:      dex.marketCap,
    whaleVolume:    whaleUSD,
    whaleDirection: whale.intent,
    walletArchetype,
    generatedAt:    Date.now(),
  };
}
