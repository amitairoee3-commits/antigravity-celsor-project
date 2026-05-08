'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { BarChart3, Clock, ArrowUpRight, ArrowDownRight, TrendingUp, TrendingDown, Eye, RefreshCw, Zap } from 'lucide-react';

interface Signal {
  id: string;
  walletAddress: string;
  chain: string;
  tokenSymbol: string;
  tokenName?: string;
  direction: 'LONG' | 'SHORT' | 'WATCH';
  convictionScore: number;
  title: string;
  catalystSummary: string;
  riskRating: 'LOW' | 'MEDIUM' | 'HIGH';
  timeHorizon: string;
  keyTags: string[];
  valueUSD: number;
  txHash: string;
  generatedAt: number;
}

function timeAgo(ms: number) {
  const diff = Date.now() - ms;
  const mins = Math.floor(diff / 60000);
  if (mins < 1)  return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

const DIRECTION_CONFIG = {
  LONG:  { color: 'text-green-400',  bg: 'bg-green-500/10  border-green-500/20',  icon: TrendingUp,   label: 'LONG' },
  SHORT: { color: 'text-red-400',    bg: 'bg-red-500/10    border-red-500/20',    icon: TrendingDown, label: 'SHORT' },
  WATCH: { color: 'text-yellow-400', bg: 'bg-yellow-500/10 border-yellow-500/20', icon: Eye,          label: 'WATCH' },
};

const RISK_COLOR = { LOW: 'text-green-400', MEDIUM: 'text-yellow-400', HIGH: 'text-red-400' };

export default function SignalHistoryPage() {
  const [signals, setSignals] = useState<Signal[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const fetchSignals = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const res = await fetch('/api/signals?count=50');
      const data = await res.json();
      if (data.ok) setSignals(data.signals ?? []);
    } catch { /* ignore */ }
    finally { setLoading(false); setRefreshing(false); }
  };

  const triggerScan = async () => {
    setRefreshing(true);
    try {
      await fetch('/api/signals', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chain: 'all' }) });
      setTimeout(() => fetchSignals(true), 5000);
    } catch { setRefreshing(false); }
  };

  useEffect(() => {
    fetchSignals();
    // Auto-refresh every 60s
    const interval = setInterval(() => fetchSignals(), 60_000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="max-w-screen-xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center border border-orange-500/20">
            <BarChart3 className="w-5 h-5 text-orange-500" />
          </div>
          <div>
            <h1 className="text-3xl font-light text-white tracking-tight">
              Signal <span className="font-semibold text-orange-500">History</span>
            </h1>
            <p className="text-gray-500 text-sm">{signals.length} signals · live intelligence archive</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={triggerScan}
            disabled={refreshing}
            className="flex items-center gap-2 px-4 py-2 bg-orange-500/10 hover:bg-orange-500/20 border border-orange-500/20 text-orange-400 text-xs font-bold rounded-xl transition-all disabled:opacity-50"
          >
            <Zap className="w-3.5 h-3.5" />
            SCAN NOW
          </button>
          <button
            onClick={() => fetchSignals(true)}
            disabled={refreshing}
            className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 text-gray-400 text-xs font-bold rounded-xl transition-all disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            REFRESH
          </button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="h-24 rounded-2xl bg-white/[0.02] animate-pulse" />
          ))}
        </div>
      ) : signals.length === 0 ? (
        <div className="text-center py-20 space-y-4">
          <Zap className="w-12 h-12 text-orange-500/30 mx-auto" />
          <p className="text-gray-500">No signals yet. Click SCAN NOW to generate live intelligence.</p>
          <button onClick={triggerScan} className="px-6 py-3 bg-orange-500 text-black font-black rounded-xl text-sm">
            INITIATE FIRST SCAN
          </button>
        </div>
      ) : (
        <div className="grid gap-3">
          {signals.map((signal, i) => {
            const dc = DIRECTION_CONFIG[signal.direction] ?? DIRECTION_CONFIG.WATCH;
            const DirIcon = dc.icon;
            const isExpanded = expanded === signal.id;

            return (
              <motion.div
                key={signal.id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04, duration: 0.4 }}
                className="glass-card rounded-2xl overflow-hidden cursor-pointer hover:border-white/20 transition-colors"
                onClick={() => setExpanded(isExpanded ? null : signal.id)}
              >
                <div className="p-5 flex flex-wrap items-center justify-between gap-4">
                  {/* Left: direction badge + token + title */}
                  <div className="flex items-center gap-4 min-w-0">
                    <div className={`w-10 h-10 rounded-xl border flex items-center justify-center flex-shrink-0 ${dc.bg}`}>
                      <DirIcon className={`w-4 h-4 ${dc.color}`} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-0.5">
                        <span className="font-black text-white tracking-wider text-sm">{signal.tokenSymbol}</span>
                        <span className={`text-[9px] px-2 py-0.5 rounded font-black tracking-widest border ${dc.bg} ${dc.color}`}>
                          {dc.label}
                        </span>
                        <span className="text-[9px] text-gray-600 font-mono uppercase">{signal.chain}</span>
                      </div>
                      <p className="text-xs text-gray-500 truncate max-w-sm">{signal.title}</p>
                    </div>
                  </div>

                  {/* Right: conviction + time + value */}
                  <div className="flex items-center gap-6 flex-shrink-0">
                    <div className="text-center">
                      <div className="text-[9px] text-gray-600 uppercase font-bold tracking-widest mb-0.5">Score</div>
                      <div className={`text-lg font-black font-mono ${signal.convictionScore >= 75 ? 'text-orange-400' : signal.convictionScore >= 55 ? 'text-yellow-400' : 'text-gray-400'}`}>
                        {signal.convictionScore}
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="text-[9px] text-gray-600 uppercase font-bold tracking-widest mb-0.5">Risk</div>
                      <div className={`text-sm font-bold ${RISK_COLOR[signal.riskRating]}`}>{signal.riskRating}</div>
                    </div>
                    <div className="text-center">
                      <div className="text-[9px] text-gray-600 uppercase font-bold tracking-widest mb-0.5">Value</div>
                      <div className="text-sm font-bold font-mono text-white">
                        ${(signal.valueUSD / 1_000_000).toFixed(1)}M
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-gray-500 flex items-center gap-1">
                        <Clock className="w-3 h-3" />{timeAgo(signal.generatedAt)}
                      </div>
                      <div className="text-[9px] text-gray-600 font-mono">{signal.timeHorizon}</div>
                    </div>
                    <ArrowUpRight className={`w-4 h-4 text-gray-600 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                  </div>
                </div>

                {/* Expanded detail */}
                {isExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    className="px-5 pb-5 border-t border-white/5 pt-4 space-y-4"
                  >
                    <p className="text-sm text-gray-300 leading-relaxed">{signal.catalystSummary}</p>
                    <div className="flex flex-wrap gap-2">
                      {signal.keyTags?.map((tag, ti) => (
                        <span key={ti} className="text-[10px] px-2 py-1 rounded-lg bg-white/[0.03] border border-white/5 text-gray-500 font-mono">
                          {tag}
                        </span>
                      ))}
                    </div>
                    <div className="flex items-center gap-4 text-[10px] font-mono text-gray-600">
                      <span>Wallet: {signal.walletAddress.slice(0, 8)}...{signal.walletAddress.slice(-6)}</span>
                      <a
                        href={`https://etherscan.io/tx/${signal.txHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={e => e.stopPropagation()}
                        className="text-orange-500/70 hover:text-orange-400 flex items-center gap-1"
                      >
                        View Tx <ArrowUpRight className="w-2.5 h-2.5" />
                      </a>
                    </div>
                  </motion.div>
                )}
              </motion.div>
            );
          })}
        </div>
      )}

      <div className="mt-8 text-center">
        <p className="text-gray-600 text-xs font-mono">
          Signals refresh automatically every 60 seconds · {signals.length > 0 ? `Last updated: ${timeAgo(signals[0]?.generatedAt)}` : 'No data yet'}
        </p>
      </div>
    </div>
  );
}
