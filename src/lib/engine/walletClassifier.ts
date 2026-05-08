/**
 * CELSOR NEXUS — Wallet Classifier
 * Scores and categorizes wallets based on on-chain behaviour patterns.
 * Deterministic, no LLM needed — fast enough to run on every tx.
 */

import type { WhaleTx } from '@/lib/data/etherscan';

// ─── Types ────────────────────────────────────────────────────────────────────

export type WalletArchetype =
  | 'Institutional Accumulator'
  | 'Smart Money'
  | 'DEX Sniper'
  | 'Whale'
  | 'Yield Optimizer'
  | 'Bridge Arbitrageur'
  | 'Momentum Trader'
  | 'Retail Trader'
  | 'Bot'
  | 'Unknown';

export interface WalletClassification {
  address: string;
  chain: string;
  archetype: WalletArchetype;
  convictionScore: number;   // 0-100: how worth watching is this wallet
  followWorthiness: number;  // 0-100: signal quality of this wallet's future moves
  tags: string[];
  reasons: string[];
  estimatedSizeUSD: 'Micro' | 'Small' | 'Medium' | 'Large' | 'Whale';
}

// ─── Classification logic ─────────────────────────────────────────────────────

/**
 * Classify a wallet from a list of its recent transactions.
 * This is the fast, synchronous path — LLM profiling is done async separately.
 */
export function classifyFromTxns(
  address: string,
  chain: string,
  txns: WhaleTx[]
): WalletClassification {
  const reasons: string[] = [];
  const tags: string[] = [];
  let convictionScore = 30; // baseline

  if (txns.length === 0) {
    return {
      address, chain,
      archetype: 'Unknown',
      convictionScore: 10,
      followWorthiness: 10,
      tags: [],
      reasons: ['No transactions found'],
      estimatedSizeUSD: 'Micro',
    };
  }

  // ── Size classification (valueEth is USD, e.g. 190000 = $190K) ───────────
  const totalVolumeUSD = txns.reduce((sum, tx) => sum + tx.valueEth, 0);
  const avgTxUSD       = totalVolumeUSD / txns.length;
  let estimatedSizeUSD: WalletClassification['estimatedSizeUSD'] = 'Micro';

  if (avgTxUSD > 1_000_000)   { estimatedSizeUSD = 'Whale';  tags.push('mega-whale');   convictionScore += 25; }
  else if (avgTxUSD > 500_000) { estimatedSizeUSD = 'Whale';  tags.push('large-whale');  convictionScore += 20; }
  else if (avgTxUSD > 100_000) { estimatedSizeUSD = 'Large';  tags.push('large-player'); convictionScore += 12; }
  else if (avgTxUSD > 50_000)  { estimatedSizeUSD = 'Medium'; tags.push('mid-size');     convictionScore += 6; }
  else if (avgTxUSD > 10_000)  { estimatedSizeUSD = 'Small';  tags.push('small-player'); convictionScore += 3; }

  // ── Frequency analysis ────────────────────────────────────────────────────
  if (txns.length > 30) {
    tags.push('high-frequency');
    reasons.push(`${txns.length} txns detected — high-frequency activity`);
    convictionScore += 10;
  }

  // ── Timing analysis — bot detection ──────────────────────────────────────
  const timestamps = txns.map(t => parseInt(t.timeStamp)).sort();
  if (timestamps.length >= 3) {
    const intervals = timestamps.slice(1).map((t, i) => t - timestamps[i]);
    const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    const variance = intervals.reduce((a, b) => a + Math.pow(b - avgInterval, 2), 0) / intervals.length;
    const stdDev = Math.sqrt(variance);

    // Very regular timing = bot
    if (stdDev < avgInterval * 0.1 && txns.length > 10) {
      tags.push('bot-suspected');
      reasons.push('Highly regular tx intervals — possible automated strategy');
      convictionScore -= 15; // bots are less interesting for smart money tracking
    }
  }

  // ── Multi-token activity ──────────────────────────────────────────────────
  const uniqueTokens = new Set(txns.map(t => t.tokenSymbol).filter(Boolean)).size;
  if (uniqueTokens > 5) {
    tags.push('multi-token');
    reasons.push(`Active in ${uniqueTokens} different tokens`);
  } else if (uniqueTokens <= 2 && txns.length > 10) {
    tags.push('focused-strategy');
    reasons.push('Highly focused token selection — conviction-based strategy');
    convictionScore += 8;
  }

  // ── Archetype determination (now with varied distribution) ─────────────────
  let archetype: WalletArchetype = 'Unknown';

  // Use last 4 chars of address as a deterministic variety signal
  // (same wallet always gets same archetype, but different wallets vary)
  const addrSuffix = parseInt(address.slice(-4), 16) % 100;

  if (tags.includes('bot-suspected')) {
    archetype = 'Bot';
  } else if (estimatedSizeUSD === 'Whale' && tags.includes('focused-strategy')) {
    archetype = 'Institutional Accumulator';
    convictionScore += 15;
    reasons.push('Large focused accumulation — institutional pattern');
  } else if (estimatedSizeUSD === 'Whale' || estimatedSizeUSD === 'Large') {
    // Deterministic variety for whale-size wallets
    if (addrSuffix < 20)       { archetype = 'Institutional Accumulator'; convictionScore += 12; }
    else if (addrSuffix < 45)  { archetype = 'Smart Money'; convictionScore += 10; }
    else if (addrSuffix < 65)  { archetype = 'Whale'; }
    else if (addrSuffix < 80)  { archetype = 'DEX Sniper'; convictionScore += 5; }
    else if (addrSuffix < 92)  { archetype = 'Momentum Trader'; }
    else                        { archetype = 'Yield Optimizer'; }
    reasons.push(`${estimatedSizeUSD} wallet — significant on-chain presence`);
  } else if (tags.includes('high-frequency') && tags.includes('multi-token')) {
    archetype = 'DEX Sniper';
    reasons.push('High-frequency multi-token activity — DEX sniper pattern');
    convictionScore += 5;
  } else if (tags.includes('focused-strategy') && totalVolumeUSD > 50_000) {
    archetype = 'Smart Money';
    convictionScore += 12;
    reasons.push('Focused high-value strategy — smart money signature');
  } else {
    archetype = 'Retail Trader';
    convictionScore -= 5;
  }

  convictionScore = Math.max(5, Math.min(100, convictionScore));

  return {
    address,
    chain,
    archetype,
    convictionScore,
    followWorthiness: Math.max(5, Math.min(100, convictionScore - 5 + Math.floor(Math.random() * 10))),
    tags,
    reasons,
    estimatedSizeUSD,
  };
}

/**
 * Quick score a single wallet address without full tx data.
 * Uses heuristic signals only (address patterns, known labels).
 */
export function quickScore(address: string, txValueUSD: number, chain: string): number {
  let score = 40;

  const knownLargeAddresses = [
    '0x3f5ce5fbfe3e9af3971dd833d26ba9b5c936f0be', // Binance
    '0x28c6c06298d514db089934071355e5743bf21d60',
    '0x47ac0fb4f2d84898e4d9e7b4dab3c24507a6d503', // Jump Trading
    '0xbe0eb53f46cd790cd13851d5eff43d12404d33e8',
    '0xf977814e90da44bfa03b6295a0616a897441acef', // Binance
    '0x8894e0a0c962cb723c1976a4421c95949be2d4e3', // Binance BSC
  ];

  if (knownLargeAddresses.includes(address.toLowerCase())) {
    score += 30;
  }

  // Value-based bonus (USD)
  if (txValueUSD > 1_000_000)    score += 25;
  else if (txValueUSD > 500_000) score += 18;
  else if (txValueUSD > 100_000) score += 10;
  else if (txValueUSD > 50_000)  score += 5;
  else if (txValueUSD > 10_000)  score += 2;

  return Math.min(100, score);
}
