'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Activity, TrendingUp, TrendingDown, Zap, Brain, Cpu,
  ShieldAlert, Clock, RefreshCw, Eye, AlertTriangle,
  ChevronRight, Circle, Maximize2, Filter, Server,
  BarChart2, Globe, ExternalLink, Loader2, CheckCircle2,
  TerminalSquare, LayoutGrid,
} from 'lucide-react';
import { useSignalFeed } from '@/hooks/useSignalFeed';
import { useEngineStatus } from '@/hooks/useEngineStatus';
import type { CachedSignal } from '@/lib/cache/signalCache';
import { AlphaTerminal } from '@/components/AlphaTerminal';
import dynamic from 'next/dynamic';

const AlphaPerformanceDashboard = dynamic(
  () => import('@/components/AlphaPerformanceDashboard'),
  { ssr: false, loading: () => <div className="text-zinc-600 font-mono text-xs animate-pulse py-8 text-center">Loading Alpha Engine...</div> }
);

// ─── Chain config ──────────────────────────────────────────────────────────────

const CHAIN_META: Record<string, { label: string; color: string; bg: string; explorer: string }> = {
  eth:  { label: 'ETH',  color: 'text-blue-400',   bg: 'bg-blue-500/10',   explorer: 'https://etherscan.io/tx/' },
  arb:  { label: 'ARB',  color: 'text-sky-400',    bg: 'bg-sky-500/10',    explorer: 'https://arbiscan.io/tx/' },
  base: { label: 'BASE', color: 'text-blue-300',   bg: 'bg-blue-400/10',   explorer: 'https://basescan.org/tx/' },
  bsc:  { label: 'BSC',  color: 'text-yellow-400', bg: 'bg-yellow-500/10', explorer: 'https://bscscan.com/tx/' },
  op:   { label: 'OP',   color: 'text-red-400',    bg: 'bg-red-500/10',    explorer: 'https://optimistic.etherscan.io/tx/' },
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function ConvictionMeter({ score }: { score: number }) {
  const color = score >= 85 ? '#f97316' : score >= 70 ? '#3b82f6' : '#6b7280';
  const glow  = score >= 85 ? '0 0 12px rgba(249,115,22,0.6)' : score >= 70 ? '0 0 10px rgba(59,130,246,0.4)' : 'none';

  return (
    <div className="flex items-center gap-3">
      <div className="relative w-24 h-1.5 bg-white/5 rounded-full overflow-hidden">
        <motion.div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{ backgroundColor: color, boxShadow: glow }}
          initial={{ width: 0 }}
          animate={{ width: `${score}%` }}
          transition={{ duration: 1.2, ease: 'easeOut' }}
        />
      </div>
      <span className="font-mono text-base font-semibold" style={{ color }}>
        {score}
      </span>
    </div>
  );
}

function ChainBadge({ chain }: { chain: string }) {
  const meta = CHAIN_META[chain] ?? { label: chain.toUpperCase(), color: 'text-gray-400', bg: 'bg-gray-500/10' };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold tracking-wider ${meta.color} ${meta.bg}`}>
      {meta.label}
    </span>
  );
}

function DirectionBadge({ direction }: { direction: CachedSignal['direction'] }) {
  if (direction === 'LONG') return (
    <div className="flex items-center gap-1.5 px-3 py-1.5 bg-green-500/10 border border-green-500/20 rounded-lg text-green-400">
      <TrendingUp className="w-4 h-4" />
      <span className="font-bold text-sm tracking-widest">LONG</span>
    </div>
  );
  if (direction === 'SHORT') return (
    <div className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400">
      <TrendingDown className="w-4 h-4" />
      <span className="font-bold text-sm tracking-widest">SHORT</span>
    </div>
  );
  return (
    <div className="flex items-center gap-1.5 px-3 py-1.5 bg-yellow-500/10 border border-yellow-500/20 rounded-lg text-yellow-400">
      <Eye className="w-4 h-4" />
      <span className="font-bold text-sm tracking-widest">WATCH</span>
    </div>
  );
}

function RiskBadge({ risk }: { risk: string }) {
  const cfg = {
    LOW:    { color: 'text-green-400',  bg: 'bg-green-500/10',  border: 'border-green-500/20' },
    MEDIUM: { color: 'text-yellow-400', bg: 'bg-yellow-500/10', border: 'border-yellow-500/20' },
    HIGH:   { color: 'text-red-400',    bg: 'bg-red-500/10',    border: 'border-red-500/20' },
  }[risk] ?? { color: 'text-gray-400', bg: 'bg-gray-500/10', border: 'border-gray-500/20' };

  return (
    <span className={`text-xs px-2 py-0.5 rounded border font-semibold ${cfg.color} ${cfg.bg} ${cfg.border}`}>
      {risk} RISK
    </span>
  );
}

function SignalCard({ signal, index }: { signal: CachedSignal; index: number }) {
  const [expanded, setExpanded] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [narrative, setNarrative] = useState('');
  const chain = CHAIN_META[signal.chain];
  const explorerUrl = chain?.explorer ? `${chain.explorer}${signal.txHash}` : '#';

  const streamNarrative = async () => {
    if (narrative || streaming) { setExpanded(e => !e); return; }
    setExpanded(true);
    setStreaming(true);
    try {
      const res = await fetch(`/api/ai/signal/${signal.id}/narrative`);
      if (!res.body) throw new Error('No body');
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const payload = line.slice(6);
          if (payload === '[DONE]') break;
          try {
            const parsed = JSON.parse(payload);
            if (parsed.text) setNarrative(prev => prev + parsed.text);
          } catch { /* ignore */ }
        }
      }
    } catch (e) {
      setNarrative(signal.catalystSummary);
    } finally {
      setStreaming(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -16, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ type: 'spring', stiffness: 280, damping: 24, delay: index * 0.04 }}
      className="group relative bg-[#0d0d0d] border border-white/[0.06] rounded-xl overflow-hidden hover:border-white/[0.12] transition-all duration-300"
    >
      {/* Top conviction glow */}
      {signal.convictionScore >= 85 && (
        <div className="absolute inset-0 bg-gradient-to-r from-orange-500/5 to-transparent pointer-events-none" />
      )}
      {signal.convictionScore >= 85 && (
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-orange-500/60 via-orange-500/20 to-transparent" />
      )}

      {/* Header row */}
      <div className="flex items-start justify-between p-5 gap-4">
        <div className="flex items-center gap-3 flex-wrap">
          <DirectionBadge direction={signal.direction} />
          <ChainBadge chain={signal.chain} />
          <span className="font-bold text-white text-base tracking-wide">
            {signal.tokenSymbol}
          </span>
          {signal.convictionScore >= 85 && (
            <span className="flex items-center gap-1 text-orange-500 text-xs font-bold tracking-widest bg-orange-500/10 px-2 py-0.5 rounded border border-orange-500/20">
              <Zap className="w-3 h-3" /> HIGH CONVICTION
            </span>
          )}
        </div>

        <div className="flex flex-col items-end gap-2 shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 uppercase tracking-widest">Conviction</span>
            <ConvictionMeter score={signal.convictionScore} />
          </div>
          <div className="flex items-center gap-2">
            <RiskBadge risk={signal.riskRating} />
            <span className="text-xs text-gray-600 bg-white/5 px-2 py-0.5 rounded font-mono">
              {signal.timeHorizon}
            </span>
          </div>
        </div>
      </div>

      {/* Title */}
      <div className="px-5 pb-3">
        <p className="text-sm text-gray-300 font-medium leading-relaxed">
          {signal.title}
        </p>
      </div>

      {/* Tags */}
      {signal.keyTags?.length > 0 && (
        <div className="px-5 pb-4 flex flex-wrap gap-1.5">
          {signal.keyTags.map((tag, i) => (
            <span
              key={i}
              className="text-xs text-gray-500 bg-white/[0.04] border border-white/[0.06] px-2 py-0.5 rounded-md"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between px-5 py-3 border-t border-white/[0.05] bg-white/[0.01]">
        <div className="flex items-center gap-4 text-xs text-gray-500">
          <span className="font-mono">
            {signal.walletAddress.slice(0, 6)}...{signal.walletAddress.slice(-4)}
          </span>
          <span>${(signal.valueUSD / 1000).toFixed(1)}K</span>
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {new Date(signal.generatedAt).toLocaleTimeString()}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <a
            href={explorerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-gray-600 hover:text-gray-400 transition-colors flex items-center gap-1"
            onClick={e => e.stopPropagation()}
          >
            <ExternalLink className="w-3 h-3" />
          </a>
          <button
            onClick={streamNarrative}
            className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-white transition-colors px-2 py-1 rounded hover:bg-white/5"
          >
            <Brain className="w-3 h-3" />
            {streaming ? 'Analyzing...' : expanded ? 'Hide AI' : 'AI Analysis'}
            <ChevronRight className={`w-3 h-3 transition-transform ${expanded ? 'rotate-90' : ''}`} />
          </button>
        </div>
      </div>

      {/* Expanded AI narrative */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <div className="px-5 py-4 border-t border-white/[0.05] bg-[#0a0a0a]">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* AI Narrative / Catalyst */}
                <div className="md:col-span-2">
                  <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-2 flex items-center gap-2">
                    <Zap className="w-3 h-3 text-orange-500" /> Catalyst Analysis
                  </h4>
                  <p className="text-sm text-gray-300 leading-relaxed">
                    {narrative || signal.catalystSummary}
                    {streaming && <span className="inline-block w-1.5 h-4 bg-orange-500 animate-pulse ml-1 align-middle" />}
                  </p>
                </div>

                {/* Invalidation */}
                <div>
                  <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-2 flex items-center gap-2">
                    <ShieldAlert className="w-3 h-3 text-red-400" /> Invalidation
                  </h4>
                  <div className="bg-red-500/5 border border-red-500/10 rounded-lg p-3">
                    <p className="text-xs text-red-300/80 leading-relaxed">
                      {signal.invalidationCriteria}
                    </p>
                  </div>
                </div>
              </div>

              {/* Trading Vehicle + Funding Rate Warning */}
              {(signal as any).tradingVehicle && (
                <div className="mt-4 space-y-2">
                  <div className="flex items-center gap-2 bg-blue-500/5 border border-blue-500/15 rounded-lg px-4 py-2.5">
                    <span className="text-[10px] text-blue-400 font-bold uppercase tracking-widest shrink-0">Trade Via</span>
                    <span className="text-sm font-bold text-white font-mono">{(signal as any).tradingVehicle}</span>
                  </div>
                  {(signal as any).fundingRateWarning && (
                    <div className="flex items-start gap-2 bg-yellow-500/5 border border-yellow-500/15 rounded-lg px-4 py-2.5">
                      <span className="text-yellow-400 text-sm shrink-0 mt-0.5">⚠️</span>
                      <p className="text-xs text-yellow-300/80 leading-relaxed">{(signal as any).fundingRateWarning}</p>
                    </div>
                  )}
                </div>
              )}
            </div>

          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function EngineStatusBar({
  status,
  isScanning,
  onScan,
}: {
  status: ReturnType<typeof useEngineStatus>['status'];
  isScanning: boolean;
  onScan: () => void;
}) {
  return (
    <div className="flex items-center gap-3 flex-wrap">
      <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold ${
        status?.status === 'online'
          ? 'bg-green-500/10 border border-green-500/20 text-green-400'
          : 'bg-red-500/10 border border-red-500/20 text-red-400'
      }`}>
        <Circle className={`w-2 h-2 fill-current ${status?.status === 'online' ? 'animate-pulse' : ''}`} />
        {status?.status === 'online' ? 'ENGINE ONLINE' : 'ENGINE OFFLINE'}
      </div>

      {status?.chains?.map(chain => (
        <ChainBadge key={chain} chain={chain} />
      ))}

      <button
        onClick={onScan}
        disabled={isScanning}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-orange-500/10 border border-orange-500/20 text-orange-400 hover:bg-orange-500/20 transition-colors disabled:opacity-50 ml-auto"
      >
        {isScanning
          ? <><Loader2 className="w-3 h-3 animate-spin" /> Scanning...</>
          : <><RefreshCw className="w-3 h-3" /> Scan Now</>
        }
      </button>
    </div>
  );
}

function MetricCard({ label, value, sub, icon: Icon, highlight = false }: {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ElementType;
  highlight?: boolean;
}) {
  return (
    <div className={`rounded-xl p-4 border ${
      highlight
        ? 'bg-orange-500/5 border-orange-500/20'
        : 'bg-white/[0.02] border-white/[0.06]'
    }`}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-gray-500 uppercase tracking-widest font-semibold">{label}</span>
        <Icon className={`w-4 h-4 ${highlight ? 'text-orange-500' : 'text-gray-600'}`} />
      </div>
      <div className="flex items-end gap-2">
        <span className={`text-2xl font-bold font-mono ${highlight ? 'text-orange-400' : 'text-white'}`}>
          {value}
        </span>
        {sub && <span className="text-xs text-gray-500 mb-1">{sub}</span>}
      </div>
    </div>
  );
}

// Chain tabs removed — signals track all chains automatically (USDT/USDT.P pairs across all networks)

// ─── Main Dashboard ───────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [minScore, setMinScore] = useState(0);
  const [showFilters, setShowFilters] = useState(false);
  const [viewMode, setViewMode] = useState<'cards' | 'terminal' | 'alpha'>('cards');

  const { signals, isLoading, isScanning, lastUpdated, triggerScan } = useSignalFeed({
    chain: 'all',
    minScore,
    pollIntervalMs: 30_000,
  });

  const { status, triggerScan: engineScan } = useEngineStatus(15_000);

  const [fearGreed, setFearGreed] = useState<{ index: number; label: string; change24h: number; interpretation: string } | null>(null);
  useEffect(() => {
    fetch('/api/feargreed').then(r => r.json()).then(d => { if (d.ok) setFearGreed(d.data); }).catch(() => {});
  }, []);

  const handleScan = async () => {
    await triggerScan('all');
    engineScan();
  };

  const highConviction = signals.filter(s => s.convictionScore >= 75);
  const longSignals    = signals.filter(s => s.direction === 'LONG');
  const shortSignals   = signals.filter(s => s.direction === 'SHORT');

  return (
    <>
      {/* Dashboard content starts directly below global header */}
      <main className="max-w-screen-xl mx-auto px-6 py-8 space-y-8">

        {/* Engine status bar */}
        <EngineStatusBar
          status={status}
          isScanning={isScanning}
          onScan={handleScan}
        />

        {/* Metric cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <MetricCard label="Total Signals" value={signals.length} icon={BarChart2} />
          <MetricCard label="High Conviction" value={highConviction.length} icon={Zap} highlight />
          <MetricCard label="Long Signals" value={longSignals.length} sub="bullish" icon={TrendingUp} />
          <MetricCard label="Short Signals" value={shortSignals.length} sub="bearish" icon={TrendingDown} />
        </div>

        {/* Fear & Greed Index */}
        {fearGreed && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-4 p-4 bg-white/[0.02] border border-white/[0.06] rounded-xl"
          >
            <div className="shrink-0 text-center">
              <div className="text-[10px] text-gray-600 uppercase tracking-widest mb-0.5">Memecoin Fear & Greed</div>
              <div className={`text-3xl font-black font-mono ${
                fearGreed.index >= 76 ? 'text-red-400' :
                fearGreed.index >= 61 ? 'text-orange-400' :
                fearGreed.index >= 41 ? 'text-yellow-400' :
                fearGreed.index >= 21 ? 'text-blue-400' : 'text-blue-600'
              }`}>{fearGreed.index}</div>
              <div className={`text-[10px] font-bold uppercase tracking-widest ${
                fearGreed.index >= 76 ? 'text-red-500' :
                fearGreed.index >= 61 ? 'text-orange-500' :
                fearGreed.index >= 41 ? 'text-yellow-500' :
                fearGreed.index >= 21 ? 'text-blue-400' : 'text-blue-600'
              }`}>{fearGreed.label}</div>
            </div>
            <div className="h-10 w-px bg-white/10 shrink-0" />
            <div className="flex-1">
              <p className="text-xs text-gray-400 leading-relaxed">{fearGreed.interpretation}</p>
            </div>
            {fearGreed.change24h !== 0 && (
              <div className={`text-xs font-bold font-mono shrink-0 ${ fearGreed.change24h > 0 ? 'text-green-400' : 'text-red-400'}`}>
                {fearGreed.change24h > 0 ? '+' : ''}{fearGreed.change24h} <span className="text-gray-600 font-normal">24h</span>
              </div>
            )}
          </motion.div>
        )}

        {/* Filters row — no chain tabs, signals auto-cover all chains */}
        <div className="flex flex-wrap items-center gap-4">

          <button
            onClick={() => setShowFilters(f => !f)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-semibold transition-colors ${
              showFilters ? 'border-orange-500/30 text-orange-400 bg-orange-500/10' : 'border-white/[0.06] text-gray-500 hover:text-white'
            }`}
          >
            <Filter className="w-3 h-3" /> Filters
          </button>

          <AnimatePresence>
            {showFilters && (
              <motion.div
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -8 }}
                className="flex items-center gap-3"
              >
                <label className="text-xs text-gray-500">Min Score:</label>
                <select
                  value={minScore}
                  onChange={e => setMinScore(Number(e.target.value))}
                  className="bg-white/[0.04] border border-white/[0.08] text-white text-xs rounded-lg px-2 py-1.5 focus:outline-none focus:border-orange-500/40"
                >
                  <option value={0}>Any</option>
                  <option value={50}>50+</option>
                  <option value={65}>65+</option>
                  <option value={75}>75+ (High)</option>
                  <option value={85}>85+ (Very High)</option>
                </select>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="ml-auto text-xs text-gray-600">
            Showing <span className="text-white font-mono">{signals.length}</span> signals
          </div>

          {/* View mode toggle */}
          <div className="flex items-center gap-1 p-1 bg-white/[0.03] rounded-xl border border-white/[0.06]">
            <button
              onClick={() => setViewMode('cards')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                viewMode === 'cards' ? 'bg-white/10 text-white' : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              <LayoutGrid className="w-3 h-3" /> Cards
            </button>
            <button
              onClick={() => setViewMode('terminal')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                viewMode === 'terminal' ? 'bg-orange-500/20 text-orange-400' : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              <TerminalSquare className="w-3 h-3" /> Terminal
            </button>
            <button
              onClick={() => setViewMode('alpha')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                viewMode === 'alpha' ? 'bg-green-500/20 text-green-400' : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              <TrendingUp className="w-3 h-3" /> Alpha
            </button>
          </div>
        </div>

        {/* Signals feed */}
        <div className="space-y-3">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              {viewMode === 'terminal'
                ? <><TerminalSquare className="w-5 h-5 text-orange-500" /> Alpha Terminal</>
                : viewMode === 'alpha'
                ? <><TrendingUp className="w-5 h-5 text-green-500" /> Alpha Performance</>
                : <><Activity className="w-5 h-5 text-orange-500" /> Live Intelligence Feed</>
              }
            </h2>
          </div>

          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-24 gap-4">
              <div className="relative">
                <Loader2 className="w-8 h-8 text-orange-500 animate-spin" />
                <div className="absolute inset-0 blur-xl bg-orange-500/20 rounded-full" />
              </div>
              <p className="text-sm text-gray-500">Loading signal feed...</p>
            </div>
          ) : signals.length === 0 ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center justify-center py-24 text-center border border-dashed border-white/[0.06] rounded-2xl bg-white/[0.01]"
            >
              <div className="relative mb-6">
                <Cpu className="w-10 h-10 text-gray-700" />
                <div className="absolute -top-1 -right-1 w-3 h-3 bg-orange-500 rounded-full animate-pulse" />
              </div>
              <h3 className="text-base font-semibold text-gray-400 mb-2">Engine Warming Up</h3>
              <p className="text-sm text-gray-600 max-w-sm leading-relaxed mb-6">
                The scanner is actively polling {status?.chainsMonitored ?? 5} chains for whale movements.
                Click <strong>Scan Now</strong> to trigger an immediate sweep.
              </p>
              <button
                onClick={handleScan}
                disabled={isScanning}
                className="flex items-center gap-2 px-5 py-2.5 bg-orange-500 hover:bg-orange-600 text-black font-bold text-sm rounded-xl transition-colors disabled:opacity-50"
              >
                {isScanning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                {isScanning ? 'Scanning...' : 'Run First Scan'}
              </button>
            </motion.div>
          ) : viewMode === 'alpha' ? (
            <AlphaPerformanceDashboard />
          ) : viewMode === 'terminal' ? (
            <AlphaTerminal signals={signals} isScanning={isScanning} />
          ) : (
            <AnimatePresence mode="popLayout">
              {signals.map((signal, i) => (
                <SignalCard key={signal.id} signal={signal} index={i} />
              ))}
            </AnimatePresence>
          )}
        </div>
      </main>
    </>
  );
}
