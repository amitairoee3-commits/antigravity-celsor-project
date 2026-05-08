/**
 * CELSOR — PnL & Alpha Score API
 * GET /api/pnl           — system alpha score + open/closed positions
 * GET /api/pnl?view=open — open positions only
 * GET /api/pnl?view=history — trade history
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSystemAlpha, getOpenPositions, getPositionHistory } from '@/lib/engine/pnlTracker';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const view = searchParams.get('view') ?? 'alpha';

  try {
    if (view === 'open') {
      const positions = await getOpenPositions();
      return NextResponse.json({ ok: true, positions, count: positions.length });
    }

    if (view === 'history') {
      const count  = parseInt(searchParams.get('count') ?? '50');
      const history = await getPositionHistory(count);
      return NextResponse.json({ ok: true, positions: history, count: history.length });
    }

    // Default: full alpha dashboard
    const [alpha, open, history] = await Promise.all([
      getSystemAlpha(),
      getOpenPositions(),
      getPositionHistory(20),
    ]);

    return NextResponse.json({
      ok: true,
      alpha,
      openPositions:  open,
      recentHistory:  history,
      timestamp:      Date.now(),
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
