/**
 * CELSOR — /api/engine/seed
 * POST: Seeds the signal cache with fresh live-timestamp signals.
 * Called on first load to ensure the dashboard never shows 2024 data.
 * In production, BullMQ + real Etherscan API replaces this.
 */

import { NextRequest, NextResponse } from 'next/server';
import { persistSignal } from '@/lib/db/signalRepository';
import type { CachedSignal } from '@/lib/db/signalRepository';

const TOKENS = [
  { symbol: 'PEPE', name: 'Pepe', chain: 'eth' },
  { symbol: 'SHIB', name: 'Shiba Inu', chain: 'eth' },
  { symbol: 'ARB',  name: 'Arbitrum',  chain: 'arb' },
  { symbol: 'DOGE', name: 'Dogecoin',  chain: 'bsc' },
  { symbol: 'WIF',  name: 'dogwifhat', chain: 'sol' },
  { symbol: 'BONK', name: 'Bonk',      chain: 'sol' },
  { symbol: 'MOG',  name: 'Mog Coin',  chain: 'eth' },
  { symbol: 'FLOKI',name: 'FLOKI',     chain: 'bsc' },
  { symbol: 'ONDO', name: 'Ondo Finance', chain: 'eth' },
  { symbol: 'OP',   name: 'Optimism',  chain: 'op' },
];

const ARCHETYPES = ['DEX Whale', 'Smart Money', 'VC Accumulator', 'Insider', 'Market Maker', 'Quantitative Fund'];
const DIRECTIONS: Array<'LONG' | 'SHORT' | 'WATCH'> = ['LONG', 'LONG', 'LONG', 'SHORT', 'WATCH'];
const RISKS: Array<'LOW' | 'MEDIUM' | 'HIGH'> = ['LOW', 'MEDIUM', 'HIGH'];
const HORIZONS = ['1H', '4H', '12H', '24H', '72H'];

function randomHex(len: number) {
  return Array.from({ length: len }, () => Math.floor(Math.random() * 16).toString(16)).join('');
}

function randomWallet() {
  return `0x${randomHex(40)}`;
}

export async function POST(_req: NextRequest) {
  try {
    const now = Date.now();
    const signals: CachedSignal[] = [];

    for (let i = 0; i < 20; i++) {
      const token = TOKENS[i % TOKENS.length];
      const archetype = ARCHETYPES[Math.floor(Math.random() * ARCHETYPES.length)];
      const direction = DIRECTIONS[Math.floor(Math.random() * DIRECTIONS.length)];
      const risk = RISKS[Math.floor(Math.random() * RISKS.length)];
      const horizon = HORIZONS[Math.floor(Math.random() * HORIZONS.length)];
      const conviction = Math.floor(Math.random() * 35) + 55; // 55-90
      const valueUSD = Math.floor(Math.random() * 2_000_000) + 50_000;
      // Spread timestamps across the last 6 hours
      const generatedAt = now - Math.floor(Math.random() * 6 * 60 * 60 * 1000);

      const anomalies = [
        'Wallet inactive 47d — sudden large buy',
        'Mirrors 3 other smart money wallets',
        'Pre-listing accumulation pattern',
        'Whale cluster convergence detected',
        'Cross-chain bridge inflow spike',
        'CEX withdrawal to cold wallet',
      ];

      const signal: CachedSignal = {
        id: `seed-${Date.now()}-${i}-${randomHex(8)}`,
        walletAddress: randomWallet(),
        chain: token.chain,
        tokenSymbol: token.symbol,
        tokenName: token.name,
        txHash: `0x${randomHex(64)}`,
        direction,
        convictionScore: conviction,
        title: `${archetype} ${direction === 'LONG' ? 'accumulating' : direction === 'SHORT' ? 'distributing' : 'watching'} ${token.symbol} on ${token.chain.toUpperCase()}`,
        catalystSummary: `${archetype} executed a ${direction.toLowerCase()} position in ${token.symbol}. ${anomalies[i % anomalies.length]}. Conviction score: ${conviction}/100.`,
        invalidationCriteria: `Monitor for break below key support. Exit if conviction drops below 45.`,
        riskRating: risk,
        timeHorizon: horizon,
        keyTags: [anomalies[i % anomalies.length], archetype, direction],
        valueUSD,
        generatedAt,
        walletArchetype: archetype,
      };

      signals.push(signal);
    }

    // Sort by recency and persist
    signals.sort((a, b) => b.generatedAt - a.generatedAt);
    await Promise.all(signals.map(s => persistSignal(s)));

    return NextResponse.json({
      ok: true,
      seeded: signals.length,
      latestSignal: new Date(signals[0].generatedAt).toISOString(),
    });
  } catch (error) {
    console.error('[/api/engine/seed]', error);
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
