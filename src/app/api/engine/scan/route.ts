// API route that drives the autonomous scanner
// Called by the frontend every 30s — acts as the heartbeat for the engine
// When deployed to Vercel: add a cron job hitting /api/engine/scan every minute

import { NextResponse } from 'next/server';
import { runAutonomousScan, getDiscoveredWallets } from '@/lib/engine/autonomousScanner';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const result = await runAutonomousScan();
    const allWallets = getDiscoveredWallets();

    return NextResponse.json({
      ...result,
      watchlist: allWallets,
      timestamp: Date.now(),
    });
  } catch (err) {
    return NextResponse.json({ error: 'Scanner error', watchlist: [] }, { status: 500 });
  }
}

// POST: force a fresh scan (for manual trigger)
export async function POST() {
  try {
    const result = await runAutonomousScan();
    return NextResponse.json({ ...result, triggered: 'manual', timestamp: Date.now() });
  } catch {
    return NextResponse.json({ error: 'Scan failed' }, { status: 500 });
  }
}
