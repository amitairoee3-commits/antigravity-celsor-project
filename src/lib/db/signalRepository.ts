/**
 * CELSOR — Signal Repository
 * 
 * Dual-write: Supabase Postgres (persistent) + Redis ring buffer (fast reads).
 * Reads are served from Redis cache; falls back to Postgres on cache miss.
 * 
 * This replaces the old in-memory signalCache.ts.
 */

import { ringPush, ringGet, cacheGet, cacheSet } from '@/lib/db/redis';

export interface CachedSignal {
  id: string;
  walletAddress: string;
  chain: string;
  tokenSymbol: string;
  tokenName?: string;
  txHash: string;
  direction: 'LONG' | 'SHORT' | 'WATCH';
  convictionScore: number;
  title: string;
  catalystSummary: string;
  invalidationCriteria: string;
  tradingVehicle?: string;        // e.g. 'BTCUSDT.P (Futures) 5x' or 'BTC — Spot'
  fundingRateWarning?: string;    // Funding rate caution for perp longs/shorts
  riskRating: 'LOW' | 'MEDIUM' | 'HIGH';
  timeHorizon: string;
  keyTags: string[];
  valueUSD: number;
  generatedAt: number;
  walletArchetype?: string;
}

const FEED_KEY    = 'celsor:v2:signals:feed';
const SIG_PREFIX  = 'celsor:v2:signal:';
const MAX_FEED    = 500;
const CACHE_TTL   = 3600; // 1 hour

// ─── Write ────────────────────────────────────────────────────────────────────

export async function persistSignal(signal: CachedSignal): Promise<void> {
  // 1. Write to Redis ring buffer (fast reads for dashboard)
  await ringPush(FEED_KEY, signal, MAX_FEED);
  await cacheSet(`${SIG_PREFIX}${signal.id}`, signal, 86400); // 24h

  // 2. Persist to Supabase (durable storage + user bookmarks + outcome tracking)
  try {
    const { createServiceClient } = await import('@/utils/supabase/service');
    const supabase = createServiceClient();
    await supabase.from('signals').upsert({
      id: signal.id,
      wallet_address: signal.walletAddress,
      chain: signal.chain,
      token_symbol: signal.tokenSymbol,
      token_name: signal.tokenName ?? null,
      tx_hash: signal.txHash,
      direction: signal.direction,
      conviction_score: signal.convictionScore,
      title: signal.title,
      catalyst_summary: signal.catalystSummary,
      invalidation_criteria: signal.invalidationCriteria,
      risk_rating: signal.riskRating,
      time_horizon: signal.timeHorizon,
      key_tags: signal.keyTags,
      value_usd: signal.valueUSD,
      generated_at: new Date(signal.generatedAt).toISOString(),
    }, { onConflict: 'id', ignoreDuplicates: true });
  } catch (e) {
    // DB not configured — still works via Redis/memory
    console.warn('[CELSOR] Signal DB persist skipped (DB not configured):', (e as Error).message.slice(0, 80));
  }
}

// ─── Read ─────────────────────────────────────────────────────────────────────

export async function getRecentSignals(count = 50): Promise<CachedSignal[]> {
  // Try Redis first (fast)
  const cached = await ringGet<CachedSignal>(FEED_KEY, count);
  if (cached.length > 0) return cached;

  // Fall back to Supabase
  try {
    const { createServiceClient } = await import('@/utils/supabase/service');
    const supabase = createServiceClient();
    const { data } = await supabase
      .from('signals')
      .select('*')
      .order('generated_at', { ascending: false })
      .limit(count);

    if (data) {
      return data.map(dbToSignal);
    }
  } catch { /* DB not configured */ }

  return [];
}

export async function getHighConvictionSignals(threshold = 75, count = 20): Promise<CachedSignal[]> {
  const all = await getRecentSignals(200);
  return all.filter(s => s.convictionScore >= threshold).slice(0, count);
}

export async function getSignalsByChain(chain: string, count = 30): Promise<CachedSignal[]> {
  const all = await getRecentSignals(200);
  return all.filter(s => s.chain === chain).slice(0, count);
}

export async function getSignalById(id: string): Promise<CachedSignal | null> {
  // Redis first
  const cached = await cacheGet<CachedSignal>(`${SIG_PREFIX}${id}`);
  if (cached) return cached;

  // Supabase fallback
  try {
    const { createServiceClient } = await import('@/utils/supabase/service');
    const supabase = createServiceClient();
    const { data } = await supabase
      .from('signals')
      .select('*')
      .eq('id', id)
      .single();
    if (data) return dbToSignal(data);
  } catch { /* DB not configured */ }

  return null;
}

// ─── User-specific reads (with plan gating) ───────────────────────────────────

export async function getSignalsForUser(
  userId: string,
  plan: 'free' | 'basic' | 'pro',
  opts: { chain?: string; minScore?: number; count?: number } = {}
): Promise<CachedSignal[]> {
  const { chain = 'all', minScore = 0, count = 50 } = opts;

  // Apply plan-based limits
  const limits: Record<string, { maxCount: number; chains: string[]; aiNarrative: boolean }> = {
    free:  { maxCount: 10,  chains: ['eth'],                             aiNarrative: false },
    basic: { maxCount: 50,  chains: ['eth', 'arb', 'base', 'bsc', 'op'], aiNarrative: false },
    pro:   { maxCount: 200, chains: ['eth', 'arb', 'base', 'bsc', 'op'], aiNarrative: true },
  };

  const limit = limits[plan] ?? limits.free;
  const actualCount = Math.min(count, limit.maxCount);

  let signals = await getRecentSignals(actualCount * 3);

  // Chain filter
  if (chain !== 'all') {
    if (!limit.chains.includes(chain)) return [];
    signals = signals.filter(s => s.chain === chain);
  } else {
    signals = signals.filter(s => limit.chains.includes(s.chain));
  }

  // Score filter
  if (minScore > 0) signals = signals.filter(s => s.convictionScore >= minScore);

  // Strip AI narratives for non-pro
  if (!limit.aiNarrative) {
    signals = signals.map(s => ({
      ...s,
      catalystSummary: s.catalystSummary.split('.')[0] + '. [Upgrade to Pro for full AI analysis]',
      invalidationCriteria: '[Pro feature]',
    }));
  }

  return signals.slice(0, actualCount);
}

// ─── Push to Redis for realtime consumers ────────────────────────────────────

export async function pushSignal(signal: CachedSignal): Promise<void> {
  return persistSignal(signal);
}

// ─── DB row mapper ────────────────────────────────────────────────────────────

function dbToSignal(row: any): CachedSignal {
  return {
    id: row.id,
    walletAddress: row.wallet_address,
    chain: row.chain,
    tokenSymbol: row.token_symbol,
    tokenName: row.token_name ?? undefined,
    txHash: row.tx_hash,
    direction: row.direction,
    convictionScore: row.conviction_score,
    title: row.title,
    catalystSummary: row.catalyst_summary,
    invalidationCriteria: row.invalidation_criteria,
    riskRating: row.risk_rating,
    timeHorizon: row.time_horizon,
    keyTags: row.key_tags ?? [],
    valueUSD: Number(row.value_usd),
    generatedAt: new Date(row.generated_at).getTime(),
  };
}
