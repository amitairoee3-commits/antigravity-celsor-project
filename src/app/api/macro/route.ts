/**
 * CELSOR — Macro Controller API
 * GET /api/macro — current Fear & Greed snapshot + pipeline directive
 */
import { NextResponse } from 'next/server';
import { getMacroSnapshot } from '@/lib/engine/macroController';
import { getLeaderboard } from '@/lib/engine/walletReputation';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const [macro, leaderboard] = await Promise.all([
      getMacroSnapshot(),
      getLeaderboard(10),
    ]);

    return NextResponse.json({
      ok: true,
      macro,
      leaderboard,
      timestamp: Date.now(),
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
