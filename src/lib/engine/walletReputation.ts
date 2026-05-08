/**
 * CELSOR — Wallet Reputation & Long-Term Memory
 *
 * Every wallet builds a track record over time:
 *   - Alpha Score: How often a wallet's entry leads to a profitable outcome
 *   - Signal Count: Number of signals this wallet has triggered
 *   - Historical Accuracy: % of signals that hit TP (backed by PnL tracker)
 *   - Consecutive Wins: Current streak
 *
 * This feeds into the RAG system so agents can say:
 *   "This wallet (0xABC...) called PEPE correctly 4/5 times. Current accuracy: 80%."
 *
 * Architecture: RAG + Reputation Graph
 *   - Short-term: Redis ring buffer of recent activity
 *   - Long-term: Supabase wallets table (persistent reputation)
 *   - Vector: pgvector embedding for behavioral similarity search
 */

import { cacheGet, cacheSet, ringPush, ringGet } from '@/lib/db/redis';
import type { TrackedPosition } from './pnlTracker';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface WalletReputation {
  address:          string;
  chain:            string;
  archetype:        string;
  alphaScore:       number;      // 0-100 composite reputation score
  historicalWR:     number;      // win rate % across all closed positions
  totalSignals:     number;      // how many signals triggered
  closedSignals:    number;      // how many were evaluated (TP/SL hit or expired)
  wins:             number;
  losses:           number;
  avgPnlPercent:    number;      // average % gain/loss per closed position
  bestPnlPercent:   number;      // best single trade
  consecutiveWins:  number;      // current streak
  lastSignalAt:     number;      // unix ms
  isVerifiedAlpha:  boolean;     // true if win rate >= 70% with >= 5 closed positions
  tier:             'LEGEND' | 'ELITE' | 'RELIABLE' | 'DEVELOPING' | 'UNPROVEN';
  tags:             string[];
  recentTokens:     string[];    // last 5 tokens traded
}

export interface WalletActivity {
  address:      string;
  chain:        string;
  tokenSymbol:  string;
  signalId:     string;
  direction:    'LONG' | 'SHORT';
  entryPrice:   number;
  exitPrice?:   number;
  pnlPercent?:  number;
  status:       string;
  timestamp:    number;
}

// ─── Redis keys ───────────────────────────────────────────────────────────────

function reputationKey(address: string, chain: string) {
  return `celsor:wallet:rep:${address.toLowerCase()}:${chain}`;
}

function activityKey(address: string) {
  return `celsor:wallet:activity:${address.toLowerCase()}`;
}

const LEADERBOARD_KEY = 'celsor:wallet:leaderboard';

// ─── Tier calculation ─────────────────────────────────────────────────────────

function calculateTier(wr: number, closed: number): WalletReputation['tier'] {
  if (closed < 2) return 'UNPROVEN';
  if (wr >= 75 && closed >= 10) return 'LEGEND';
  if (wr >= 65 && closed >= 5)  return 'ELITE';
  if (wr >= 55 && closed >= 3)  return 'RELIABLE';
  if (closed >= 2)               return 'DEVELOPING';
  return 'UNPROVEN';
}

function calculateAlphaScore(rep: Omit<WalletReputation, 'alphaScore' | 'tier' | 'isVerifiedAlpha'>): number {
  let score = 40; // base

  // Win rate component (0-30)
  score += Math.min(30, rep.historicalWR * 0.3);

  // Sample size confidence (0-20) — more trades = more trustworthy
  const sampleBonus = Math.min(20, rep.closedSignals * 2);
  score += sampleBonus;

  // Streak bonus (0-10)
  score += Math.min(10, rep.consecutiveWins * 2);

  // Avg PnL quality (0-10)
  if (rep.avgPnlPercent > 20)      score += 10;
  else if (rep.avgPnlPercent > 10) score += 6;
  else if (rep.avgPnlPercent > 5)  score += 3;
  else if (rep.avgPnlPercent < 0)  score -= 10;

  return Math.max(0, Math.min(100, Math.round(score)));
}

// ─── Update reputation after a position closes ────────────────────────────────

export async function updateWalletReputation(position: TrackedPosition): Promise<WalletReputation> {
  const key = reputationKey(position.walletAddress, position.chain);
  const existing = await cacheGet<WalletReputation>(key);

  const isWin = (position.pnlPercent ?? 0) > 0;
  const pnl   = position.pnlPercent ?? 0;

  let rep: WalletReputation;

  if (existing) {
    const newClosed = existing.closedSignals + 1;
    const newWins   = existing.wins + (isWin ? 1 : 0);
    const newLosses = existing.losses + (isWin ? 0 : 1);
    const newAvgPnl = ((existing.avgPnlPercent * existing.closedSignals) + pnl) / newClosed;

    rep = {
      ...existing,
      closedSignals:   newClosed,
      wins:            newWins,
      losses:          newLosses,
      historicalWR:    parseFloat(((newWins / newClosed) * 100).toFixed(1)),
      avgPnlPercent:   parseFloat(newAvgPnl.toFixed(2)),
      bestPnlPercent:  Math.max(existing.bestPnlPercent, pnl),
      consecutiveWins: isWin ? existing.consecutiveWins + 1 : 0,
      lastSignalAt:    Date.now(),
      recentTokens:    [position.tokenSymbol, ...existing.recentTokens].slice(0, 5),
      alphaScore:      0, // recalculated below
      tier:            'UNPROVEN', // recalculated below
      isVerifiedAlpha: false, // recalculated below
    };
  } else {
    rep = {
      address:         position.walletAddress,
      chain:           position.chain,
      archetype:       position.walletArchetype,
      historicalWR:    isWin ? 100 : 0,
      totalSignals:    1,
      closedSignals:   1,
      wins:            isWin ? 1 : 0,
      losses:          isWin ? 0 : 1,
      avgPnlPercent:   pnl,
      bestPnlPercent:  pnl,
      consecutiveWins: isWin ? 1 : 0,
      lastSignalAt:    Date.now(),
      isVerifiedAlpha: false,
      tags:            [position.walletArchetype.toLowerCase().replace(/\s/g, '-')],
      recentTokens:    [position.tokenSymbol],
      alphaScore:      0,
      tier:            'UNPROVEN',
    };
  }

  // Recalculate derived fields
  rep.tier            = calculateTier(rep.historicalWR, rep.closedSignals);
  rep.isVerifiedAlpha = rep.historicalWR >= 70 && rep.closedSignals >= 5;
  rep.alphaScore      = calculateAlphaScore(rep);

  // Tags update
  const tags = new Set(rep.tags);
  if (rep.isVerifiedAlpha)    tags.add('verified-alpha');
  if (rep.tier === 'LEGEND')  tags.add('legend');
  if (rep.consecutiveWins >= 3) tags.add(`${rep.consecutiveWins}-win-streak`);
  rep.tags = Array.from(tags);

  // Persist
  await cacheSet(key, rep, 30 * 24 * 3600); // 30 days

  // Record activity
  const activity: WalletActivity = {
    address:     position.walletAddress,
    chain:       position.chain,
    tokenSymbol: position.tokenSymbol,
    signalId:    position.signalId,
    direction:   position.direction as 'LONG' | 'SHORT',
    entryPrice:  position.entryPrice,
    exitPrice:   position.exitPrice,
    pnlPercent:  position.pnlPercent,
    status:      position.status,
    timestamp:   Date.now(),
  };
  await ringPush(activityKey(position.walletAddress), activity, 50);

  // Update leaderboard (sorted by alphaScore)
  await updateLeaderboard(rep);

  // Persist to Supabase for long-term memory
  try {
    const { createServiceClient } = await import('@/utils/supabase/service');
    const sb = createServiceClient();
    await sb.from('wallets').upsert({
      address:          rep.address,
      chain:            rep.chain,
      archetype:        rep.archetype,
      conviction_score: rep.alphaScore,
      follow_worthiness: rep.historicalWR,
      tags:             rep.tags,
      total_volume_usd: 0, // updated separately
      tx_count:         rep.totalSignals,
      last_seen_at:     new Date(rep.lastSignalAt).toISOString(),
    }, { onConflict: 'address,chain' });
  } catch { /* DB not configured */ }

  const tierEmoji = { LEGEND: '🌟', ELITE: '⚡', RELIABLE: '✅', DEVELOPING: '📈', UNPROVEN: '❓' };
  console.log(`[CELSOR Wallet] ${tierEmoji[rep.tier]} ${rep.address.slice(0, 10)}... WR: ${rep.historicalWR}% | Alpha: ${rep.alphaScore} | Tier: ${rep.tier}`);
  return rep;
}

// ─── Leaderboard ──────────────────────────────────────────────────────────────

async function updateLeaderboard(rep: WalletReputation): Promise<void> {
  const board = await cacheGet<WalletReputation[]>(LEADERBOARD_KEY) ?? [];
  const idx = board.findIndex(w => w.address === rep.address && w.chain === rep.chain);
  if (idx >= 0) board[idx] = rep;
  else board.push(rep);

  // Keep top 100 by alpha score
  board.sort((a, b) => b.alphaScore - a.alphaScore);
  board.splice(100);
  await cacheSet(LEADERBOARD_KEY, board, 24 * 3600);
}

export async function getLeaderboard(limit = 20): Promise<WalletReputation[]> {
  return (await cacheGet<WalletReputation[]>(LEADERBOARD_KEY) ?? []).slice(0, limit);
}

// ─── RAG Context builder ──────────────────────────────────────────────────────
// Called by the AI agents before generating a narrative.
// Returns rich historical context so the agent can reference past performance.

export async function getWalletReputationContext(
  address: string,
  chain:   string,
): Promise<string> {
  const key = reputationKey(address, chain);
  const rep = await cacheGet<WalletReputation>(key);

  if (!rep || rep.closedSignals === 0) {
    return `Wallet ${address.slice(0, 10)}... has no tracked history. Treat as unproven. Extra caution warranted.`;
  }

  const tierDescriptions = {
    LEGEND:     'legendary track record — consistently generates alpha',
    ELITE:      'elite performer — high conviction entries with strong outcomes',
    RELIABLE:   'reliable signal source — above-average accuracy',
    DEVELOPING: 'developing track record — limited history',
    UNPROVEN:   'unproven — insufficient data',
  };

  const activity = await ringGet<WalletActivity>(activityKey(address), 5);
  const recentTrades = activity.map(a =>
    `${a.direction} ${a.tokenSymbol}: ${a.pnlPercent !== undefined ? (a.pnlPercent >= 0 ? '+' : '') + a.pnlPercent + '%' : 'pending'}`
  ).join(', ');

  return [
    `WALLET INTELLIGENCE — ${address.slice(0, 10)}... (${chain.toUpperCase()})`,
    `Tier: ${rep.tier} — ${tierDescriptions[rep.tier]}`,
    `Alpha Score: ${rep.alphaScore}/100 | Win Rate: ${rep.historicalWR}% (${rep.wins}W/${rep.losses}L from ${rep.closedSignals} trades)`,
    `Avg P&L per trade: ${rep.avgPnlPercent >= 0 ? '+' : ''}${rep.avgPnlPercent}% | Best trade: +${rep.bestPnlPercent}%`,
    rep.consecutiveWins > 1 ? `Current winning streak: ${rep.consecutiveWins} consecutive wins ⚡` : '',
    rep.recentTokens.length > 0 ? `Recent tokens: ${rep.recentTokens.join(', ')}` : '',
    recentTrades ? `Recent trades: ${recentTrades}` : '',
    rep.isVerifiedAlpha ? '🔥 VERIFIED ALPHA WALLET — historical accuracy >= 70% with >= 5 data points' : '',
  ].filter(Boolean).join('\n');
}

// ─── Reputation for signal scoring boost ─────────────────────────────────────

export async function getReputationBoost(address: string, chain: string): Promise<number> {
  const key = reputationKey(address, chain);
  const rep = await cacheGet<WalletReputation>(key);
  if (!rep || rep.closedSignals < 2) return 0;

  // Bonus conviction points based on track record
  if (rep.tier === 'LEGEND') return 20;
  if (rep.tier === 'ELITE')  return 12;
  if (rep.tier === 'RELIABLE') return 6;
  if (rep.tier === 'DEVELOPING' && rep.historicalWR >= 60) return 3;
  if (rep.tier === 'DEVELOPING' && rep.historicalWR < 40) return -5; // penalty for bad wallets
  return 0;
}

// ─── Increment total signals (called when signal is generated, before close) ──

export async function incrementWalletSignalCount(address: string, chain: string, archetype: string): Promise<void> {
  const key = reputationKey(address, chain);
  const existing = await cacheGet<WalletReputation>(key);
  if (existing) {
    await cacheSet(key, { ...existing, totalSignals: existing.totalSignals + 1, lastSignalAt: Date.now() }, 30 * 24 * 3600);
  } else {
    // Create a skeleton record — will be filled in as positions close
    const skeleton: WalletReputation = {
      address, chain, archetype,
      alphaScore: 40, historicalWR: 0, totalSignals: 1,
      closedSignals: 0, wins: 0, losses: 0, avgPnlPercent: 0,
      bestPnlPercent: 0, consecutiveWins: 0, lastSignalAt: Date.now(),
      isVerifiedAlpha: false, tier: 'UNPROVEN',
      tags: [archetype.toLowerCase().replace(/\s/g, '-')],
      recentTokens: [],
    };
    await cacheSet(key, skeleton, 30 * 24 * 3600);
  }
}
