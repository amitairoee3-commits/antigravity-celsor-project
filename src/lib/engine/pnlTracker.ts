/**
 * CELSOR — Autonomous PnL Tracking Engine
 *
 * Tracks every signal's performance from entry to exit:
 *   1. On signal generation → records entry price from DexScreener
 *   2. On every scan tick  → checks current price vs entry
 *   3. After timeHorizon   → closes position, records outcome
 *   4. Aggregates "System Alpha Score" — the real measure of whether Celsor prints money
 *
 * Architecture: ReAct pattern — the tracker reasons about each open position
 * and decides whether to close it (hit TP/SL/expired) or keep monitoring.
 */

import { cacheGet, cacheSet, ringPush, ringGet } from '@/lib/db/redis';
import { getPairData } from '@/lib/data/dexscreener';

// ─── Types ─────────────────────────────────────────────────────────────────────

export type PositionStatus = 'OPEN' | 'CLOSED_TP' | 'CLOSED_SL' | 'CLOSED_EXPIRED' | 'CLOSED_MANUAL';

export interface TrackedPosition {
  signalId:       string;
  tokenSymbol:    string;
  chain:          string;
  direction:      'LONG' | 'SHORT' | 'WATCH';
  entryPrice:     number;
  entryTime:      number;        // unix ms
  currentPrice?:  number;
  exitPrice?:     number;
  exitTime?:      number;
  stopLoss:       number;        // price level that kills the trade
  takeProfitL1:   number;        // 25% of target
  takeProfitL2:   number;        // 50% of target — full close here
  timeHorizon:    '1H' | '4H' | '1D' | '1W';
  timeHorizonMs:  number;
  status:         PositionStatus;
  pnlPercent?:    number;        // final % gain/loss
  pnlUSD?:        number;        // simulated $ gain/loss (on $10K notional)
  convictionScore: number;       // signal's original conviction
  walletAddress:  string;
  walletArchetype: string;
}

export interface SystemAlpha {
  totalSignals:       number;
  closedPositions:    number;
  openPositions:      number;
  wins:               number;
  losses:             number;
  winRate:            number;        // % of closed that hit TP
  avgWinPercent:      number;        // avg gain on winners
  avgLossPercent:     number;        // avg loss on losers
  totalPnlPercent:    number;        // sum of all closed pnl%
  sharpeProxy:        number;        // winRate * avgWin / avgLoss — rough edge measure
  bestTrade:          TrackedPosition | null;
  worstTrade:         TrackedPosition | null;
  highConvictionWR:   number;        // win rate on signals >= 75 conviction
  byChain:            Record<string, { wr: number; count: number }>;
  byArchetype:        Record<string, { wr: number; count: number }>;
  updatedAt:          number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const POSITIONS_KEY  = 'celsor:pnl:positions:open';
const HISTORY_KEY    = 'celsor:pnl:positions:history';
const ALPHA_KEY      = 'celsor:pnl:alpha';
const NOTIONAL_USD   = 10_000; // simulated position size for $ PnL calc

const HORIZON_MS: Record<string, number> = {
  '1H': 1 * 3600 * 1000,
  '4H': 4 * 3600 * 1000,
  '1D': 24 * 3600 * 1000,
  '1W': 7 * 24 * 3600 * 1000,
};

// SL/TP multipliers by risk tolerance
const RISK_PARAMS = {
  LOW:    { sl: 0.05, tp1: 0.08, tp2: 0.15 },  // tight SL, conservative TP
  MEDIUM: { sl: 0.08, tp1: 0.12, tp2: 0.25 },
  HIGH:   { sl: 0.12, tp1: 0.20, tp2: 0.40 },  // wide SL for volatile plays
};

// ─── Open a new position when a signal is generated ──────────────────────────

export async function openPosition(params: {
  signalId:       string;
  tokenSymbol:    string;
  chain:          string;
  direction:      'LONG' | 'SHORT' | 'WATCH';
  timeHorizon:    string;
  convictionScore: number;
  riskRating:     'LOW' | 'MEDIUM' | 'HIGH';
  walletAddress:  string;
  walletArchetype: string;
}): Promise<TrackedPosition | null> {
  if (params.direction === 'WATCH') return null; // Only track directional signals

  // Get live entry price from DexScreener
  let entryPrice = 0;
  try {
    const pair = await getPairData(params.tokenSymbol, params.chain);
    entryPrice = pair?.price ?? 0;
  } catch { /* DexScreener unavailable */ }

  if (entryPrice === 0) return null; // Can't track without an entry price

  const rp = RISK_PARAMS[params.riskRating] ?? RISK_PARAMS.MEDIUM;
  const horizonMs = HORIZON_MS[params.timeHorizon] ?? HORIZON_MS['4H'];

  const position: TrackedPosition = {
    signalId:       params.signalId,
    tokenSymbol:    params.tokenSymbol,
    chain:          params.chain,
    direction:      params.direction as 'LONG' | 'SHORT',
    entryPrice,
    entryTime:      Date.now(),
    timeHorizon:    params.timeHorizon as any,
    timeHorizonMs:  horizonMs,
    stopLoss:       params.direction === 'LONG'
                      ? entryPrice * (1 - rp.sl)
                      : entryPrice * (1 + rp.sl),
    takeProfitL1:   params.direction === 'LONG'
                      ? entryPrice * (1 + rp.tp1)
                      : entryPrice * (1 - rp.tp1),
    takeProfitL2:   params.direction === 'LONG'
                      ? entryPrice * (1 + rp.tp2)
                      : entryPrice * (1 - rp.tp2),
    status:         'OPEN',
    convictionScore: params.convictionScore,
    walletAddress:  params.walletAddress,
    walletArchetype: params.walletArchetype,
  };

  // Save to open positions
  const openPositions = await getOpenPositions();
  openPositions.push(position);
  await cacheSet(POSITIONS_KEY, openPositions, 7 * 24 * 3600);

  console.log(`[CELSOR PnL] 📈 Opened ${params.direction} position: ${params.tokenSymbol} @ $${entryPrice.toFixed(6)} (SL: $${position.stopLoss.toFixed(6)})`);
  return position;
}

// ─── Tick: evaluate all open positions ───────────────────────────────────────
// Called by the pipeline scan every cycle. ReAct pattern: reason about each
// position's state, then act (close / keep open / alert).

export async function tickPositions(): Promise<{
  closed: TrackedPosition[];
  updated: TrackedPosition[];
}> {
  const openPositions = await getOpenPositions();
  if (openPositions.length === 0) return { closed: [], updated: [] };

  const now = Date.now();
  const closed: TrackedPosition[] = [];
  const stillOpen: TrackedPosition[] = [];
  const updated: TrackedPosition[] = [];

  // Batch fetch current prices for all unique tokens
  const uniqueTokens = Array.from(new Set(openPositions.map(p => `${p.chain}:${p.tokenSymbol}`)));
  const priceMap = new Map<string, number>();

  await Promise.allSettled(
    uniqueTokens.map(async key => {
      const [chain, symbol] = key.split(':');
      try {
        const pair = await getPairData(symbol, chain);
        if (pair?.price) priceMap.set(key, pair.price);
      } catch { /* silent */ }
    })
  );

  for (const position of openPositions) {
    const key = `${position.chain}:${position.tokenSymbol}`;
    const currentPrice = priceMap.get(key) ?? position.currentPrice ?? position.entryPrice;
    const elapsed = now - position.entryTime;
    const isExpired = elapsed >= position.timeHorizonMs;

    // Calculate current PnL%
    const pnlPct = position.direction === 'LONG'
      ? ((currentPrice - position.entryPrice) / position.entryPrice) * 100
      : ((position.entryPrice - currentPrice) / position.entryPrice) * 100;

    // ReAct: REASON about whether to close
    let shouldClose = false;
    let closeStatus: PositionStatus = 'OPEN';

    if (position.direction === 'LONG') {
      if (currentPrice <= position.stopLoss)   { shouldClose = true; closeStatus = 'CLOSED_SL'; }
      if (currentPrice >= position.takeProfitL2) { shouldClose = true; closeStatus = 'CLOSED_TP'; }
    } else {
      if (currentPrice >= position.stopLoss)   { shouldClose = true; closeStatus = 'CLOSED_SL'; }
      if (currentPrice <= position.takeProfitL2) { shouldClose = true; closeStatus = 'CLOSED_TP'; }
    }

    if (isExpired) { shouldClose = true; closeStatus = 'CLOSED_EXPIRED'; }

    // ACT: close or update
    if (shouldClose) {
      const closedPosition: TrackedPosition = {
        ...position,
        currentPrice,
        exitPrice:  currentPrice,
        exitTime:   now,
        status:     closeStatus,
        pnlPercent: parseFloat(pnlPct.toFixed(2)),
        pnlUSD:     parseFloat(((pnlPct / 100) * NOTIONAL_USD).toFixed(2)),
      };
      closed.push(closedPosition);
      await ringPush(HISTORY_KEY, closedPosition, 2000); // keep 2000 trades of history

      const emoji = closeStatus === 'CLOSED_TP' ? '✅' : closeStatus === 'CLOSED_SL' ? '❌' : '⏰';
      console.log(`[CELSOR PnL] ${emoji} Closed ${position.direction} ${position.tokenSymbol}: ${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(2)}% | ${closeStatus}`);
    } else {
      const updatedPos = { ...position, currentPrice, pnlPercent: parseFloat(pnlPct.toFixed(2)) };
      stillOpen.push(updatedPos);
      updated.push(updatedPos);
    }
  }

  // Persist updated open positions
  await cacheSet(POSITIONS_KEY, stillOpen, 7 * 24 * 3600);

  // Recompute system alpha
  if (closed.length > 0) {
    await recomputeAlpha();
  }

  return { closed, updated };
}

// ─── Compute System Alpha Score ───────────────────────────────────────────────
// This is the "is Celsor actually printing money?" metric.

export async function recomputeAlpha(): Promise<SystemAlpha> {
  const history = await ringGet<TrackedPosition>(HISTORY_KEY, 2000);
  const open    = await getOpenPositions();

  const closed = history.filter(p => p.status !== 'OPEN' && p.pnlPercent !== undefined);

  if (closed.length === 0) {
    const empty: SystemAlpha = {
      totalSignals: open.length,
      closedPositions: 0,
      openPositions: open.length,
      wins: 0,
      losses: 0,
      winRate: 0,
      avgWinPercent: 0,
      avgLossPercent: 0,
      totalPnlPercent: 0,
      sharpeProxy: 0,
      bestTrade: null,
      worstTrade: null,
      highConvictionWR: 0,
      byChain: {},
      byArchetype: {},
      updatedAt: Date.now(),
    };
    await cacheSet(ALPHA_KEY, empty, 3600);
    return empty;
  }

  const winners = closed.filter(p => (p.pnlPercent ?? 0) > 0);
  const losers  = closed.filter(p => (p.pnlPercent ?? 0) <= 0);
  const winRate = (winners.length / closed.length) * 100;
  const avgWin  = winners.length > 0
    ? winners.reduce((s, p) => s + (p.pnlPercent ?? 0), 0) / winners.length : 0;
  const avgLoss = losers.length > 0
    ? Math.abs(losers.reduce((s, p) => s + (p.pnlPercent ?? 0), 0) / losers.length) : 1;
  const sharpeProxy = (winRate / 100) * avgWin / Math.max(avgLoss, 0.01);
  const totalPnl = closed.reduce((s, p) => s + (p.pnlPercent ?? 0), 0);

  // High conviction win rate (>= 75)
  const hcClosed = closed.filter(p => p.convictionScore >= 75);
  const hcWinners = hcClosed.filter(p => (p.pnlPercent ?? 0) > 0);
  const highConvictionWR = hcClosed.length > 0 ? (hcWinners.length / hcClosed.length) * 100 : 0;

  // By chain
  const byChain: Record<string, { wr: number; count: number }> = {};
  for (const chain of ['eth', 'arb', 'base', 'bsc', 'op']) {
    const chainClosed = closed.filter(p => p.chain === chain);
    const chainWins   = chainClosed.filter(p => (p.pnlPercent ?? 0) > 0);
    if (chainClosed.length > 0) {
      byChain[chain] = {
        wr:    parseFloat(((chainWins.length / chainClosed.length) * 100).toFixed(1)),
        count: chainClosed.length,
      };
    }
  }

  // By archetype
  const byArchetype: Record<string, { wr: number; count: number }> = {};
  const archetypes = Array.from(new Set(closed.map(p => p.walletArchetype)));
  for (const arch of archetypes) {
    const archClosed = closed.filter(p => p.walletArchetype === arch);
    const archWins   = archClosed.filter(p => (p.pnlPercent ?? 0) > 0);
    byArchetype[arch] = {
      wr:    parseFloat(((archWins.length / archClosed.length) * 100).toFixed(1)),
      count: archClosed.length,
    };
  }

  const sorted = [...closed].sort((a, b) => (b.pnlPercent ?? 0) - (a.pnlPercent ?? 0));

  const alpha: SystemAlpha = {
    totalSignals:     open.length + closed.length,
    closedPositions:  closed.length,
    openPositions:    open.length,
    wins:             winners.length,
    losses:           losers.length,
    winRate:          parseFloat(winRate.toFixed(1)),
    avgWinPercent:    parseFloat(avgWin.toFixed(2)),
    avgLossPercent:   parseFloat(avgLoss.toFixed(2)),
    totalPnlPercent:  parseFloat(totalPnl.toFixed(2)),
    sharpeProxy:      parseFloat(sharpeProxy.toFixed(3)),
    bestTrade:        sorted[0] ?? null,
    worstTrade:       sorted[sorted.length - 1] ?? null,
    highConvictionWR: parseFloat(highConvictionWR.toFixed(1)),
    byChain,
    byArchetype,
    updatedAt:        Date.now(),
  };

  await cacheSet(ALPHA_KEY, alpha, 3600);
  return alpha;
}

// ─── Reads ────────────────────────────────────────────────────────────────────

export async function getOpenPositions(): Promise<TrackedPosition[]> {
  return (await cacheGet<TrackedPosition[]>(POSITIONS_KEY)) ?? [];
}

export async function getPositionHistory(count = 100): Promise<TrackedPosition[]> {
  return ringGet<TrackedPosition>(HISTORY_KEY, count);
}

export async function getSystemAlpha(): Promise<SystemAlpha | null> {
  // Try cache first (recomputed after each close)
  const cached = await cacheGet<SystemAlpha>(ALPHA_KEY);
  if (cached) return cached;
  return recomputeAlpha();
}

export async function getPositionForSignal(signalId: string): Promise<TrackedPosition | null> {
  const open = await getOpenPositions();
  const fromOpen = open.find(p => p.signalId === signalId);
  if (fromOpen) return fromOpen;

  const history = await getPositionHistory(500);
  return history.find(p => p.signalId === signalId) ?? null;
}
