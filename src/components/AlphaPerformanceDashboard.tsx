'use client';

/**
 * CELSOR — Alpha Performance Dashboard
 *
 * Displays the system's real P&L performance:
 *   - System Alpha Score (win rate, avg gain/loss, Sharpe proxy)
 *   - Open positions with live unrealized P&L
 *   - Trade history with win/loss coloring
 *   - Macro Fear & Greed controller status
 *   - Top wallet leaderboard
 */

import { usePnLDashboard, useMacroSnapshot } from '@/hooks/usePnLMacro';
import type { TrackedPosition } from '@/lib/engine/pnlTracker';
import type { WalletReputation } from '@/lib/engine/walletReputation';

// ─── Formatters ───────────────────────────────────────────────────────────────

function fmtPct(n: number | undefined, withSign = true): string {
  if (n === undefined) return '—';
  const s = n.toFixed(2);
  return withSign ? (n >= 0 ? `+${s}%` : `${s}%`) : `${s}%`;
}

function fmtAge(ms: number): string {
  const diff = Date.now() - ms;
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  if (h >= 24) return `${Math.floor(h / 24)}d ago`;
  if (h > 0)   return `${h}h ${m}m ago`;
  return `${m}m ago`;
}

function fmtUSD(n: number | undefined): string {
  if (n === undefined) return '—';
  return n >= 0 ? `+$${n.toFixed(0)}` : `-$${Math.abs(n).toFixed(0)}`;
}

// ─── Sentiment Colors ─────────────────────────────────────────────────────────

const SENTIMENT_STYLES: Record<string, { bg: string; text: string; label: string; emoji: string }> = {
  EXTREME_FEAR: { bg: 'bg-red-900/30',    text: 'text-red-400',    label: 'Extreme Fear',  emoji: '🔴' },
  FEAR:         { bg: 'bg-orange-900/30', text: 'text-orange-400', label: 'Fear',           emoji: '🟠' },
  NEUTRAL:      { bg: 'bg-zinc-800/50',   text: 'text-zinc-300',   label: 'Neutral',        emoji: '⚪' },
  GREED:        { bg: 'bg-yellow-900/30', text: 'text-yellow-400', label: 'Greed',          emoji: '🟡' },
  EXTREME_GREED:{ bg: 'bg-green-900/30',  text: 'text-green-400',  label: 'Extreme Greed',  emoji: '🟢' },
};

const TIER_STYLES: Record<string, string> = {
  LEGEND:     'text-yellow-400 border-yellow-400/30 bg-yellow-400/10',
  ELITE:      'text-purple-400 border-purple-400/30 bg-purple-400/10',
  RELIABLE:   'text-green-400  border-green-400/30  bg-green-400/10',
  DEVELOPING: 'text-blue-400   border-blue-400/30   bg-blue-400/10',
  UNPROVEN:   'text-zinc-400   border-zinc-600/30   bg-zinc-800/30',
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function MetricCard({ label, value, sub, color = 'text-white' }: {
  label: string; value: string | number; sub?: string; color?: string;
}) {
  return (
    <div className="flex flex-col gap-1 px-4 py-3 bg-black/30 border border-white/5 rounded-lg">
      <span className="text-[10px] font-mono tracking-widest text-zinc-500 uppercase">{label}</span>
      <span className={`text-xl font-bold font-mono ${color}`}>{value}</span>
      {sub && <span className="text-[11px] text-zinc-500">{sub}</span>}
    </div>
  );
}

function PositionRow({ position, showPnL = true }: { position: TrackedPosition; showPnL?: boolean }) {
  const pnl     = position.pnlPercent;
  const isWin   = (pnl ?? 0) > 0;
  const isOpen  = position.status === 'OPEN';
  const dirColor = position.direction === 'LONG' ? 'text-green-400' : 'text-red-400';

  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-white/5 last:border-0 hover:bg-white/2 transition-colors px-2 rounded">
      {/* Direction */}
      <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded border ${
        position.direction === 'LONG'
          ? 'text-green-400 border-green-400/30 bg-green-400/10'
          : 'text-red-400 border-red-400/30 bg-red-400/10'
      }`}>
        {position.direction}
      </span>

      {/* Token + Chain */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="font-mono font-bold text-white text-sm">{position.tokenSymbol}</span>
          <span className="text-[10px] text-zinc-500 uppercase">{position.chain}</span>
        </div>
        <div className="text-[10px] text-zinc-600 font-mono">
          Entry: ${position.entryPrice > 0 ? position.entryPrice.toFixed(6) : '—'}
        </div>
      </div>

      {/* P&L */}
      {showPnL && pnl !== undefined && (
        <div className={`text-right font-mono text-sm font-bold ${isWin ? 'text-green-400' : 'text-red-400'}`}>
          <div>{fmtPct(pnl)}</div>
          {position.pnlUSD !== undefined && (
            <div className="text-[10px] font-normal">{fmtUSD(position.pnlUSD)}</div>
          )}
        </div>
      )}

      {/* Status badge */}
      <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded ${
        isOpen ? 'text-blue-400 bg-blue-400/10' :
        position.status === 'CLOSED_TP' ? 'text-green-400 bg-green-400/10' :
        position.status === 'CLOSED_SL' ? 'text-red-400 bg-red-400/10' :
        'text-zinc-400 bg-zinc-800'
      }`}>
        {isOpen ? 'LIVE' : position.status === 'CLOSED_TP' ? 'TP ✓' : position.status === 'CLOSED_SL' ? 'SL ✗' : 'EXPIRED'}
      </span>

      {/* Age */}
      <span className="text-[10px] text-zinc-600 font-mono whitespace-nowrap">
        {fmtAge(position.entryTime)}
      </span>
    </div>
  );
}

function WalletRow({ wallet, rank }: { wallet: WalletReputation; rank: number }) {
  const tierStyle = TIER_STYLES[wallet.tier] ?? TIER_STYLES.UNPROVEN;
  const wrColor = wallet.historicalWR >= 70 ? 'text-green-400' : wallet.historicalWR >= 50 ? 'text-yellow-400' : 'text-red-400';

  return (
    <div className="flex items-center gap-3 py-2 border-b border-white/5 last:border-0 px-2">
      <span className="text-zinc-600 font-mono text-xs w-5 text-right">{rank}.</span>
      <div className="flex-1 min-w-0">
        <div className="font-mono text-xs text-zinc-300 truncate">{wallet.address.slice(0, 8)}...{wallet.address.slice(-4)}</div>
        <div className="text-[10px] text-zinc-600">{wallet.archetype} · {wallet.chain.toUpperCase()}</div>
      </div>
      <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${tierStyle}`}>{wallet.tier}</span>
      <div className="text-right">
        <div className={`font-mono text-xs font-bold ${wrColor}`}>{wallet.historicalWR}%</div>
        <div className="text-[10px] text-zinc-600">{wallet.wins}W/{wallet.losses}L</div>
      </div>
      <div className="text-right">
        <div className="font-mono text-xs text-white font-bold">{wallet.alphaScore}</div>
        <div className="text-[10px] text-zinc-600">alpha</div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AlphaPerformanceDashboard() {
  const { alpha, openPositions, recentHistory, isLoading: pnlLoading } = usePnLDashboard();
  const { macro, leaderboard, isLoading: macroLoading } = useMacroSnapshot();

  const sentimentStyle = SENTIMENT_STYLES[macro?.sentiment ?? 'NEUTRAL'];
  const hasData = !!alpha;

  return (
    <div className="space-y-6">
      {/* ── Macro Bar ─────────────────────────────────────────────────────── */}
      {macro && (
        <div className={`flex items-start gap-4 p-4 rounded-xl border border-white/5 ${sentimentStyle.bg}`}>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-lg">{sentimentStyle.emoji}</span>
              <span className={`font-mono font-bold text-sm ${sentimentStyle.text}`}>
                {sentimentStyle.label} — {macro.fearGreedIndex}/100
              </span>
              <span className="text-[10px] font-mono text-zinc-500 px-1.5 py-0.5 bg-black/30 rounded">
                MODE: {macro.pipelineMode.name}
              </span>
            </div>
            <p className="text-xs text-zinc-400 leading-relaxed">{macro.narrative}</p>
          </div>
          <div className="text-right shrink-0">
            <div className="text-[10px] text-zinc-500 font-mono">BTC DOM</div>
            <div className="font-mono text-sm text-white font-bold">{macro.btcDominance}%</div>
            <div className={`text-[10px] font-mono ${macro.btcChange24h >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {macro.btcChange24h >= 0 ? '+' : ''}{macro.btcChange24h}% 24h
            </div>
          </div>
        </div>
      )}

      {/* ── System Alpha Score ─────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-mono tracking-widest text-zinc-500 uppercase">System Alpha Score</h2>
          {pnlLoading && <span className="text-[10px] text-zinc-600 font-mono animate-pulse">UPDATING...</span>}
        </div>

        {!hasData && !pnlLoading && (
          <div className="text-center py-8 text-zinc-600 font-mono text-sm">
            No positions tracked yet. Run a scan to start building your P&amp;L history.
          </div>
        )}

        {hasData && alpha && (
          <>
            {/* Primary metrics */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
              <MetricCard
                label="Win Rate"
                value={`${alpha.winRate}%`}
                sub={`${alpha.wins ?? 0}W / ${alpha.losses ?? 0}L`}
                color={alpha.winRate >= 60 ? 'text-green-400' : alpha.winRate >= 45 ? 'text-yellow-400' : 'text-red-400'}
              />
              <MetricCard
                label="Avg Win"
                value={fmtPct(alpha.avgWinPercent)}
                sub="per winning trade"
                color="text-green-400"
              />
              <MetricCard
                label="Avg Loss"
                value={`−${alpha.avgLossPercent?.toFixed(2)}%`}
                sub="per losing trade"
                color="text-red-400"
              />
              <MetricCard
                label="Edge Score"
                value={alpha.sharpeProxy?.toFixed(2) ?? '—'}
                sub="win × avg_win / avg_loss"
                color={alpha.sharpeProxy >= 1 ? 'text-green-400' : 'text-zinc-300'}
              />
            </div>

            {/* Secondary metrics */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
              <MetricCard label="Total Signals"   value={alpha.totalSignals}    sub="lifetime" />
              <MetricCard label="Closed"           value={alpha.closedPositions} sub="evaluated" />
              <MetricCard label="Open"             value={alpha.openPositions}   sub="live positions" />
              <MetricCard
                label="HC Win Rate"
                value={`${alpha.highConvictionWR}%`}
                sub="conviction ≥ 75"
                color={alpha.highConvictionWR >= 65 ? 'text-green-400' : 'text-zinc-300'}
              />
            </div>

            {/* Best/worst trades */}
            {(alpha.bestTrade || alpha.worstTrade) && (
              <div className="grid grid-cols-2 gap-2 mb-4">
                {alpha.bestTrade && (
                  <div className="p-3 bg-green-900/10 border border-green-400/10 rounded-lg">
                    <div className="text-[10px] font-mono text-green-600 uppercase mb-1">🏆 Best Trade</div>
                    <div className="font-mono text-sm font-bold text-green-400">{fmtPct(alpha.bestTrade.pnlPercent)}</div>
                    <div className="text-[10px] text-zinc-500">{alpha.bestTrade.tokenSymbol} · {alpha.bestTrade.direction}</div>
                  </div>
                )}
                {alpha.worstTrade && (
                  <div className="p-3 bg-red-900/10 border border-red-400/10 rounded-lg">
                    <div className="text-[10px] font-mono text-red-600 uppercase mb-1">📉 Worst Trade</div>
                    <div className="font-mono text-sm font-bold text-red-400">{fmtPct(alpha.worstTrade.pnlPercent)}</div>
                    <div className="text-[10px] text-zinc-500">{alpha.worstTrade.tokenSymbol} · {alpha.worstTrade.direction}</div>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Two-column: Open Positions + Leaderboard ──────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Open positions */}
        <div className="bg-black/20 border border-white/5 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-mono tracking-widest text-zinc-500 uppercase">Live Positions</h3>
            <span className="text-[10px] font-mono text-blue-400">{openPositions.length} open</span>
          </div>
          {openPositions.length === 0 ? (
            <div className="text-center py-6 text-zinc-700 font-mono text-xs">No open positions</div>
          ) : (
            <div>
              {openPositions.slice(0, 8).map(p => (
                <PositionRow key={p.signalId} position={p} showPnL={true} />
              ))}
            </div>
          )}
        </div>

        {/* Wallet leaderboard */}
        <div className="bg-black/20 border border-white/5 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-mono tracking-widest text-zinc-500 uppercase">Alpha Wallet Leaderboard</h3>
            <span className="text-[10px] font-mono text-zinc-600">by track record</span>
          </div>
          {leaderboard.length === 0 ? (
            <div className="text-center py-6 text-zinc-700 font-mono text-xs">
              Wallets earn their rank as positions close.
            </div>
          ) : (
            <div>
              {leaderboard.map((w, i) => (
                <WalletRow key={`${w.address}:${w.chain}`} wallet={w} rank={i + 1} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Recent trade history ────────────────────────────────────────────── */}
      {recentHistory.length > 0 && (
        <div className="bg-black/20 border border-white/5 rounded-xl p-4">
          <h3 className="text-xs font-mono tracking-widest text-zinc-500 uppercase mb-3">Trade History</h3>
          {recentHistory.map(p => (
            <PositionRow key={`hist-${p.signalId}`} position={p} showPnL={true} />
          ))}
        </div>
      )}
    </div>
  );
}
