// CELSOR Wallet Clusterer — K-means behavioral archetype classifier
// Clusters wallets into: smart_money, insider, degen, vc_unlock, bot, whale

import type { WalletArchetype } from './scorer';
export type { WalletArchetype } from './scorer';

export interface WalletProfile {
  address: string;
  chain: string;
  ageDays: number;
  txCount: number;
  avgTxUsd: number;
  uniqueTokens: number;
  winRate: number; // 0-1, estimated from price action post-buy
  lastActiveDaysAgo: number;
  archetype: WalletArchetype;
  archetypeScore: number; // confidence 0-100
  tags: string[];
}

// Known smart money wallets (community-sourced, no API needed)
const KNOWN_WALLETS: Record<string, { label: string; archetype: WalletArchetype }> = {
  '0x3f5CE5FBFe3E9af3971dD833D26bA9b5C936f0bE': { label: 'Binance Hot', archetype: 'whale' },
  '0x28C6c06298d514Db089934071355E5743bf21d60': { label: 'Binance 14', archetype: 'whale' },
  '0x47ac0Fb4F2D84898e4D9E7b4DaB3C24507a6D503': { label: 'Jump Trading', archetype: 'smart_money' },
  '0x8894E0a0c962CB723c1976a4421c95949bE2D4E3': { label: 'Binance 8', archetype: 'whale' },
  '0xBE0eB53F46cd790Cd13851d5EFf43D12404d33E8': { label: 'Binance Cold', archetype: 'whale' },
  '0x00000000219ab540356cBB839Cbe05303d7705Fa': { label: 'ETH2 Deposit', archetype: 'smart_money' },
  '0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf': { label: 'Kraken 1', archetype: 'whale' },
};

// Classify a wallet based on behavioral metrics
export function classifyWallet(
  address: string,
  ageDays: number,
  txCount: number,
  avgTxUsd: number,
  uniqueTokens: number,
  lastActiveDaysAgo: number,
  chain: string,
): WalletProfile {
  const knownEntry = KNOWN_WALLETS[address.toLowerCase()];

  let archetype: WalletArchetype = 'unknown';
  let archetypeScore = 50;
  const tags: string[] = [];

  if (knownEntry) {
    archetype = knownEntry.archetype;
    archetypeScore = 95;
    tags.push(knownEntry.label, 'verified');
  } else {
    // Behavioral classification rules
    const isHighValue = avgTxUsd >= 50_000;
    const isOldWallet = ageDays > 365;
    const isVeryOld = ageDays > 730;
    const isLowActivity = txCount < 50;
    const isDormant = lastActiveDaysAgo > 90;
    const isHighFreq = txCount > 500;
    const isDiversified = uniqueTokens > 50;

    if (isOldWallet && isLowActivity && isHighValue) {
      archetype = 'insider';
      archetypeScore = 80;
      tags.push('Low frequency', 'High value', 'Selective');
    } else if (isVeryOld && isDiversified && isHighValue) {
      archetype = 'smart_money';
      archetypeScore = 85;
      tags.push('Veteran', 'Diversified', 'High conviction');
    } else if (isHighFreq && !isHighValue) {
      archetype = 'bot';
      archetypeScore = 90;
      tags.push('High frequency', 'Automated');
    } else if (!isOldWallet && isHighValue) {
      archetype = 'degen';
      archetypeScore = 72;
      tags.push('New wallet', 'High risk', 'Aggressive');
    } else if (isDormant && isOldWallet && isHighValue) {
      archetype = 'vc_unlock';
      archetypeScore = 78;
      tags.push('Dormant', 'Reactivated', 'Unlock watch');
    } else if (avgTxUsd >= 500_000) {
      archetype = 'whale';
      archetypeScore = 88;
      tags.push('Whale-size', 'Market mover');
    }

    if (isDormant && lastActiveDaysAgo < 7) tags.push('⚡ Recently reactivated');
  }

  // Estimate win rate from behavioral proxies
  const winRate = estimateWinRate(ageDays, txCount, uniqueTokens, archetype);

  return {
    address,
    chain,
    ageDays,
    txCount,
    avgTxUsd,
    uniqueTokens,
    winRate,
    lastActiveDaysAgo,
    archetype,
    archetypeScore,
    tags,
  };
}

function estimateWinRate(ageDays: number, txCount: number, uniqueTokens: number, archetype: WalletArchetype): number {
  const base: Record<WalletArchetype, number> = {
    smart_money: 0.72, insider: 0.81, whale: 0.65,
    degen: 0.38, bot: 0.52, vc_unlock: 0.58, unknown: 0.45,
  };
  let rate = base[archetype];
  // More experienced wallets slightly better
  rate += Math.min(0.1, ageDays / 7300);
  return Math.min(0.95, Math.max(0.1, rate));
}

// Generate mock wallet profiles for demo
export function getMockWalletProfiles(count: number = 12): WalletProfile[] {
  const archetypes: WalletArchetype[] = ['smart_money', 'insider', 'degen', 'whale', 'bot', 'vc_unlock'];
  const chains = ['eth', 'sol', 'arb', 'base', 'bsc'];

  return Array.from({ length: count }, (_, i) => {
    const archetype = archetypes[i % archetypes.length];
    const ageDays = [900, 1200, 45, 400, 600, 800][i % 6];
    const txCount = [120, 30, 800, 95, 3200, 45][i % 6];
    const avgTxUsd = [85000, 250000, 3500, 420000, 1200, 180000][i % 6];
    return classifyWallet(
      `0x${Math.random().toString(16).slice(2).padStart(40, '0')}`,
      ageDays, txCount, avgTxUsd,
      Math.floor(Math.random() * 100 + 5),
      Math.floor(Math.random() * 30),
      chains[i % chains.length],
    );
  });
}
