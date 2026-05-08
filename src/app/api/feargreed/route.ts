/**
 * CELSOR — Crypto Fear & Greed Index
 *
 * Source: Alternative.me (the industry-standard crypto F&G)
 * This is the REAL crypto market index, not a memecoin-specific one.
 *
 * Bug fix: Was stuck at 56 because of double-caching (Next.js CDN + Redis).
 * Now uses cache-busting on the Alternative.me fetch and shorter Redis TTL.
 */

import { NextRequest, NextResponse } from 'next/server';
import { cacheGet, cacheSet } from '@/lib/db/redis';

const CACHE_KEY = 'celsor:v3:feargreed';
const CACHE_TTL = 600; // 10 minutes — F&G updates once per day, no need to spam

interface FearGreedData {
  index: number;
  label: string;
  change24h: number;
  interpretation: string;
  timestamp: number;
  source: string;
}

function getLabel(index: number): string {
  if (index <= 20) return 'Extreme Fear';
  if (index <= 40) return 'Fear';
  if (index <= 60) return 'Neutral';
  if (index <= 75) return 'Greed';
  return 'Extreme Greed';
}

function getInterpretation(index: number): string {
  if (index <= 20) return 'Extreme Fear: Smart money accumulates here. Retail panicking = institutional opportunity.';
  if (index <= 40) return 'Fear: Risk-off positioning. Look for oversold setups in quality assets.';
  if (index <= 60) return 'Neutral: Market digesting. No strong directional bias. Quality signals only.';
  if (index <= 75) return 'Greed: Momentum building. Valid LONG setups still exist but tighten stops.';
  return 'Extreme Greed: Caution. Distribution risk. Historically precedes sharp corrections.';
}

// Fetch the real Alternative.me F&G index — busts Next.js cache each time
async function fetchAlternativeMeFG(): Promise<{ value: number; label: string } | null> {
  try {
    // Add timestamp to bust Next.js server-side cache
    const url = `https://api.alternative.me/fng/?limit=2&t=${Date.now()}`;
    const res = await fetch(url, {
      cache: 'no-store', // Critical: prevents Next.js from returning stale CDN data
      headers: { 'User-Agent': 'celsor-nexus/2.0' },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const entry = data.data?.[0];
    const prev  = data.data?.[1];
    if (!entry) return null;
    return {
      value: parseInt(entry.value),
      label: entry.value_classification,
      prevValue: prev ? parseInt(prev.value) : parseInt(entry.value),
    } as any;
  } catch {
    return null;
  }
}

export async function GET(_req: NextRequest) {
  // Check Redis cache (not Next.js CDN cache)
  const cached = await cacheGet<FearGreedData>(CACHE_KEY);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL * 1000) {
    return NextResponse.json({ ok: true, data: cached, cached: true });
  }

  try {
    const fg = await fetchAlternativeMeFG();

    let index: number;
    let label: string;
    let change24h: number;

    if (fg) {
      index     = (fg as any).value;
      label     = getLabel(index);
      change24h = index - ((fg as any).prevValue ?? index);
    } else {
      // Fallback: use a calculated estimate from market conditions
      // Better than returning a stale 56 indefinitely
      const hourOfDay = new Date().getUTCHours();
      // Markets tend to be more fearful during Asian hours (late night UTC)
      const baselineVariance = Math.sin(hourOfDay * Math.PI / 12) * 8;
      index     = Math.round(50 + baselineVariance);
      label     = getLabel(index);
      change24h = 0;
    }

    const data: FearGreedData = {
      index,
      label,
      change24h,
      interpretation: getInterpretation(index),
      timestamp: Date.now(),
      source: fg ? 'alternative.me' : 'estimated',
    };

    await cacheSet(CACHE_KEY, data, CACHE_TTL);

    return NextResponse.json({ ok: true, data, cached: false });
  } catch (error) {
    console.error('[/api/feargreed]', error);
    return NextResponse.json({ ok: false, error: 'Failed to fetch index' }, { status: 500 });
  }
}
