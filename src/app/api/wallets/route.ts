/**
 * CELSOR — /api/wallets
 *
 * GET:  Returns all tracked wallets + auto-discovered big players
 * POST: Add a wallet manually + immediately enrich with DeBank
 *
 * v2: Uses walletScanner to auto-populate known institutional players.
 */

import { NextRequest, NextResponse } from 'next/server';
import { discoverWallets, enrichWalletWithDeBank } from '@/lib/engine/walletScanner';
import { cacheGet, cacheSet } from '@/lib/db/redis';
import { z } from 'zod';

const MANUAL_WATCHLIST_KEY = 'celsor:watchlist:manual:v2';

const AddWalletSchema = z.object({
  address: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid EVM address'),
  chain:   z.enum(['eth', 'arb', 'base', 'bsc', 'op']).default('eth'),
  label:   z.string().max(60).optional(),
});

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const chain      = searchParams.get('chain') ?? 'all';
    const refresh    = searchParams.get('refresh') === 'true';
    const limit      = Math.min(parseInt(searchParams.get('limit') ?? '50'), 200);

    // Discover wallets from all sources (cached 1h)
    const discovered = await discoverWallets(refresh);

    // Get manually added wallets
    const manual = await cacheGet<Array<{ address: string; chain: string; label: string; addedAt: number }>>(MANUAL_WATCHLIST_KEY) ?? [];

    // Merge: manual wallets get an override label
    const allAddresses = new Map(discovered.map(w => [`${w.address.toLowerCase()}:${w.chain}`, w]));
    for (const m of manual) {
      const key = `${m.address.toLowerCase()}:${m.chain}`;
      allAddresses.set(key, {
        ...allAddresses.get(key),
        address:         m.address,
        chain:           m.chain,
        label:           m.label || `Manually Added`,
        discoverySource: 'manual',
        estimatedAUM:    allAddresses.get(key)?.estimatedAUM ?? 0,
        activityScore:   allAddresses.get(key)?.activityScore ?? 50,
        tags:            ['manual', ...(allAddresses.get(key)?.tags ?? [])],
        discoveredAt:    m.addedAt,
      });
    }

    let wallets = Array.from(allAddresses.values());

    // Filter by chain
    if (chain !== 'all') {
      wallets = wallets.filter(w => w.chain === chain);
    }

    // Sort by estimated AUM
    wallets.sort((a, b) => b.estimatedAUM - a.estimatedAUM);

    return NextResponse.json({
      ok:        true,
      count:     wallets.length,
      wallets:   wallets.slice(0, limit),
      sources:   ['known-institutional', 'etherscan-discovery', 'dexscreener', 'manual'],
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error('[/api/wallets GET]', error);
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body   = await req.json();
    const parsed = AddWalletSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: 'Invalid input', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { address, chain, label } = parsed.data;

    // Get current manual list
    const manual = await cacheGet<Array<{ address: string; chain: string; label: string; addedAt: number }>>(MANUAL_WATCHLIST_KEY) ?? [];

    // Check if already tracked
    const exists = manual.find(w => w.address.toLowerCase() === address.toLowerCase() && w.chain === chain);
    if (exists) {
      return NextResponse.json({ ok: true, already: true, wallet: exists });
    }

    // Enrich with DeBank AUM data
    const debank = await enrichWalletWithDeBank(address);

    const entry = {
      address,
      chain,
      label:    label ?? `Whale ${address.slice(0, 8)}...`,
      addedAt:  Date.now(),
      aum:      debank?.totalUSD ?? 0,
      chains:   debank?.chains ?? [chain],
    };

    // Add to manual list (prepend, keep last 200)
    manual.unshift(entry as any);
    if (manual.length > 200) manual.splice(200);
    await cacheSet(MANUAL_WATCHLIST_KEY, manual, 30 * 24 * 3600);

    return NextResponse.json({
      ok:     true,
      wallet: entry,
      debank: debank ?? null,
    });
  } catch (error) {
    console.error('[/api/wallets POST]', error);
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
