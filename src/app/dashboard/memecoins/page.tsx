'use client';
import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { TrendingUp, TrendingDown, Zap, Search, RefreshCw, Target, Shield, Clock, ExternalLink, ChevronDown, ChevronUp, Flame, Sparkles, Copy, Check } from 'lucide-react';
import dynamic from 'next/dynamic';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import type { MemeSignal } from '@/lib/data/dexscreener';

const TradingViewChart = dynamic(() => import('@/components/TradingViewChart'), { ssr: false });

const CHAIN_COLOR: Record<string, string> = {
  eth: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
  bsc: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20',
  base: 'text-blue-300 bg-blue-400/10 border-blue-400/20',
  arb: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20',
  sol: 'text-purple-400 bg-purple-500/10 border-purple-500/20',
  op: 'text-red-400 bg-red-500/10 border-red-500/20',
};

function fmt(n: number | undefined | null, decimals = 2) {
  if (n == null || isNaN(n)) return '—';
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(decimals)}`;
}

function formatAge(hours: number) {
  if (hours < 1) {
    const mins = Math.max(1, Math.round(hours * 60));
    return `${mins}m`;
  }
  if (hours < 24) {
    return `${Math.floor(hours)}h`;
  }
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

function PriceDisplay({ price }: { price: number }) {
  const str = price.toPrecision(4);
  return <span className="font-mono text-white font-bold">{str}</span>;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.error('Failed to copy', e);
    }
  };

  return (
    <button 
      onClick={handleCopy}
      className="inline-flex items-center gap-1.5 px-2 py-1 bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.1] rounded transition-colors"
      title="Copy Contract Address"
    >
      {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3 text-gray-400" />}
      <span className="text-[10px] font-mono text-gray-300">
        {text.slice(0, 6)}...{text.slice(-4)}
      </span>
    </button>
  );
}

function SocialSignalsPanel({ signal }: { signal: MemeSignal }) {
  const [activeTab, setActiveTab] = useState<'narrative' | 'social'>('narrative');

  return (
    <div className="mt-3">
      <div className="flex gap-2 mb-3 p-1 bg-white/[0.03] rounded-lg border border-white/[0.05]">
        <button 
          onClick={() => setActiveTab('narrative')}
          className={`flex-1 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-md transition-all ${activeTab === 'narrative' ? 'bg-orange-500 text-black shadow-[0_0_10px_rgba(249,115,22,0.3)]' : 'text-gray-500 hover:text-gray-300'}`}
        >
          Narrative
        </button>
        <button 
          onClick={() => setActiveTab('social')}
          className={`flex-1 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-md transition-all ${activeTab === 'social' ? 'bg-orange-500 text-black shadow-[0_0_10px_rgba(249,115,22,0.3)]' : 'text-gray-500 hover:text-gray-300'}`}
        >
          Social Meta
        </button>
      </div>

      <AnimatePresence mode="wait">
        {activeTab === 'narrative' ? (
          <motion.div 
            key="narrative"
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 10 }}
            className="space-y-3"
          >
            <div className="bg-orange-500/5 border border-orange-500/20 rounded-xl p-3">
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="w-3 h-3 text-orange-400" />
                <span className="text-[10px] text-orange-400 font-black uppercase tracking-widest">Intelligence Narrative</span>
              </div>
              <p className="text-[11px] text-gray-300 leading-relaxed font-light italic">
                "{signal.catalystSummary}"
              </p>
            </div>
            
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-white/[0.02] border border-white/[0.05] rounded-lg p-2">
                <div className="text-[9px] text-gray-600 uppercase mb-1">Conviction</div>
                <div className="text-sm font-black font-mono text-white">{signal.convictionScore}/100</div>
              </div>
              <div className="bg-white/[0.02] border border-white/[0.05] rounded-lg p-2">
                <div className="text-[9px] text-gray-600 uppercase mb-1">Time Horizon</div>
                <div className="text-sm font-black font-mono text-white">{signal.timeHorizon}</div>
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div 
            key="social"
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            className="space-y-3"
          >
            <div className="space-y-2">
              {[
                { icon: 'X', label: 'Twitter Activity', status: 'Trending', color: 'text-blue-400' },
                { icon: 'YT', label: 'YouTube Alpha', status: '2 Mentions', color: 'text-red-400' },
                { icon: 'TG', label: 'TG Sentiment', status: 'Bullish', color: 'text-green-400' },
              ].map(s => (
                <div key={s.label} className="flex items-center justify-between p-2 bg-white/[0.02] border border-white/[0.05] rounded-lg">
                  <div className="flex items-center gap-2">
                    <div className={`w-5 h-5 rounded bg-white/[0.05] flex items-center justify-center text-[9px] font-bold ${s.color}`}>{s.icon}</div>
                    <span className="text-[10px] text-gray-400">{s.label}</span>
                  </div>
                  <span className={`text-[10px] font-bold ${s.color}`}>{s.status}</span>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function MemeCard({ signal, onSelect, selected }: { signal: MemeSignal; onSelect: (s: MemeSignal) => void; selected: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const chainCls = CHAIN_COLOR[signal.chain] ?? 'text-gray-400 bg-gray-500/10 border-gray-500/20';
  const isUp = signal.priceChange1h >= 0;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className={`relative rounded-xl border overflow-hidden transition-all cursor-pointer ${
        selected ? 'border-orange-500/40 bg-orange-500/5' : 'border-white/[0.06] bg-[#0d0d0d] hover:border-white/10'
      }`}
      onClick={() => onSelect(signal)}
    >
      {signal.isNew && (
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-orange-500/60 to-transparent" />
      )}

      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${chainCls}`}>
              {signal.chain.toUpperCase()}
            </span>
            {signal.isNew && (
              <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded bg-orange-500/10 border border-orange-500/30 text-orange-400">
                <Flame className="w-2.5 h-2.5" /> NEW
              </span>
            )}
            <span className="font-bold text-white">{signal.symbol}</span>
            <span className="text-xs text-gray-500">{signal.name}</span>
          </div>
          <div className="text-right shrink-0">
            <div className={`text-sm font-bold font-mono ${isUp ? 'text-green-400' : 'text-red-400'}`}>
              {isUp ? '+' : ''}{signal.priceChange1h.toFixed(1)}% <span className="text-[10px] text-gray-600">{formatAge(signal.ageHours)}</span>
            </div>
            <div className="text-[11px] text-gray-500 font-mono">
              <PriceDisplay price={signal.priceUsd} />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3 mt-3 text-center">
          {[
            { label: 'Vol 24h', value: fmt(signal.volume24h) },
            { label: 'Liq', value: fmt(signal.liquidityUsd) },
            { label: 'MCap', value: fmt(signal.marketCap) },
          ].map(m => (
            <div key={m.label} className="bg-black/30 rounded-lg p-2">
              <div className="text-[10px] text-gray-600">{m.label}</div>
              <div className="text-xs text-gray-300 font-mono font-semibold mt-0.5">{m.value}</div>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2 mt-3">
          <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
            <motion.div
              className={`h-full rounded-full ${signal.buyPressure >= 60 ? 'bg-green-500' : 'bg-red-500'}`}
              initial={{ width: 0 }}
              animate={{ width: `${signal.buyPressure}%` }}
              transition={{ duration: 0.8, ease: 'easeOut' }}
            />
          </div>
          <span className={`text-[10px] font-bold ${signal.buyPressure >= 60 ? 'text-green-400' : 'text-red-400'}`}>
            {signal.buyPressure}% Buy
          </span>
          <div className="text-right">
            <span className={`text-xs font-mono font-bold ${
              signal.convictionScore >= 75 ? 'text-orange-400' :
              signal.convictionScore >= 55 ? 'text-blue-400' : 'text-gray-500'
            }`}>{signal.convictionScore}</span>
          </div>
        </div>

        <div className="flex flex-wrap gap-1 mt-2">
          {signal.tags.slice(0, 4).map(t => (
            <span key={t} className="text-[10px] px-1.5 py-0.5 bg-white/[0.03] border border-white/[0.05] rounded text-gray-500">{t}</span>
          ))}
        </div>

        <button
          className="w-full flex items-center justify-center gap-1 mt-3 text-[11px] text-gray-600 hover:text-gray-400 transition-colors"
          onClick={e => { e.stopPropagation(); setExpanded(x => !x); }}
        >
          {expanded ? <><ChevronUp className="w-3 h-3" /> Hide Intelligence</> : <><ChevronDown className="w-3 h-3" /> Show Intelligence Meta</>}
        </button>

        <AnimatePresence>
          {expanded && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}>
              <div className="mt-1 pt-3 border-t border-white/[0.05]">
                <div className="flex items-center gap-2 mb-2">
                  <Zap className="w-3 h-3 text-orange-400" />
                  <span className="text-[10px] text-gray-500 uppercase tracking-widest">Memecoin Narrative & Sentiment</span>
                  <span className="text-[10px] text-gray-600 ml-auto">Horizon: {signal.timeHorizon}</span>
                </div>
                
                <SocialSignalsPanel signal={signal} />
                <div className="flex items-center gap-2 mt-2">
                  <a href={signal.dexUrl} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1 text-[10px] text-orange-400 hover:text-orange-300 transition-colors"
                    onClick={e => e.stopPropagation()}>
                    <ExternalLink className="w-3 h-3" /> DexScreener
                  </a>
                  <a href={signal.explorerUrl} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1 text-[10px] text-gray-500 hover:text-gray-300 transition-colors"
                    onClick={e => e.stopPropagation()}>
                    <ExternalLink className="w-3 h-3" /> Explorer
                  </a>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

export default function MemecoinScannerPage() {
  const [signals, setSignals] = useState<MemeSignal[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [selected, setSelected] = useState<MemeSignal | null>(null);
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [minScore, setMinScore] = useState(0);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const fetchSignals = useCallback(async () => {
    setScanning(true);
    try {
      const res = await fetch(`/api/memecoins?boosts=true&minScore=${minScore}`);
      const data = await res.json();
      setSignals(data.signals ?? []);
      setLastUpdate(new Date());
      if (!selected && data.signals?.length > 0) setSelected(data.signals[0]);
    } catch (e) { console.error(e); }
    finally { setLoading(false); setScanning(false); }
  }, [minScore]);

  const handleSearch = async () => {
    if (!query.trim()) return fetchSignals();
    setSearching(true);
    try {
      const res = await fetch('/api/memecoins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      });
      const data = await res.json();
      if (data.signals?.length > 0) {
        setSignals(data.signals);
        setSelected(data.signals[0]);
      }
    } finally { setSearching(false); }
  };

  useEffect(() => {
    fetchSignals();
    const interval = setInterval(fetchSignals, 60_000);
    return () => clearInterval(interval);
  }, [fetchSignals]);

  const highConviction = signals.filter(s => s.convictionScore >= 70);
  const newLaunches = signals.filter(s => s.isNew && s.ageHours < 6);

  return (
    <div className="min-w-0">

      <div className="max-w-screen-2xl mx-auto px-4 py-6">
        {/* Stats bar */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          {[
            { label: 'Tokens Scanned', value: signals.length, icon: Sparkles, color: 'text-white' },
            { label: 'High Conviction', value: highConviction.length, icon: Zap, color: 'text-orange-400' },
            { label: 'New Launches (<6h)', value: newLaunches.length, icon: Flame, color: 'text-orange-400' },
            { label: 'Avg Buy Pressure', value: signals.length > 0 ? `${Math.round(signals.reduce((a, s) => a + s.buyPressure, 0) / signals.length)}%` : '—', icon: TrendingUp, color: 'text-green-400' },
          ].map(m => (
            <div key={m.label} className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-4 flex items-center gap-3">
              <m.icon className={`w-5 h-5 ${m.color} shrink-0`} />
              <div>
                <div className={`text-xl font-bold font-mono ${m.color}`}>{m.value}</div>
                <div className="text-[11px] text-gray-600">{m.label}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[1fr_420px] gap-6">
          {/* Left: Chart + Signal Detail */}
          <div className="space-y-4">
            {/* Search bar */}
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input
                  type="text"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSearch()}
                  placeholder="Search token symbol or address…"
                  className="w-full pl-9 pr-4 py-2.5 bg-white/[0.03] border border-white/[0.08] rounded-xl text-sm text-white placeholder-gray-600 focus:outline-none focus:border-orange-500/40 transition-colors"
                />
              </div>
              <button onClick={handleSearch} disabled={searching}
                className="px-4 py-2.5 bg-orange-500/10 hover:bg-orange-500/20 border border-orange-500/20 text-orange-400 text-sm font-semibold rounded-xl transition-colors disabled:opacity-50">
                {searching ? 'Searching…' : 'Search'}
              </button>
              <button onClick={fetchSignals} disabled={scanning}
                className="p-2.5 bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06] rounded-xl transition-colors disabled:opacity-50">
                <RefreshCw className={`w-4 h-4 text-gray-500 ${scanning ? 'animate-spin' : ''}`} />
              </button>
            </div>

            {/* Filter row */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-gray-600">Min Conviction:</span>
              {[0, 50, 65, 75].map(v => (
                <button key={v} onClick={() => setMinScore(v)}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${
                    minScore === v ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30' : 'bg-white/[0.03] text-gray-500 border border-white/[0.06] hover:text-gray-300'
                  }`}>
                  {v === 0 ? 'All' : `${v}+`}
                </button>
              ))}
            </div>

            {/* TradingView Chart */}
            {selected && (
              <div className="bg-[#0a0a0a] border border-white/[0.06] rounded-xl overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.05]">
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${CHAIN_COLOR[selected.chain] ?? 'text-gray-400 bg-gray-500/10 border-gray-500/20'}`}>
                      {selected.chain.toUpperCase()}
                    </span>
                    <span className="font-bold text-white">{selected.symbol}/USDT</span>
                    <span className={`text-sm font-bold ${selected.priceChange24h >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {selected.priceChange24h >= 0 ? '+' : ''}{selected.priceChange24h.toFixed(1)}% 24h
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-gray-500">
                    <span className="text-[10px] text-gray-600 uppercase tracking-widest font-mono">Live Narrative Feed — {selected.symbol}</span>
                  </div>
                </div>
                <ErrorBoundary context="DexScreener Chart">
                  <iframe 
                    src={`https://dexscreener.com/${
                      selected.chain === 'eth' ? 'ethereum' : 
                      selected.chain === 'sol' ? 'solana' : 
                      selected.chain === 'arb' ? 'arbitrum' :
                      selected.chain === 'op' ? 'optimism' :
                      selected.chain
                    }/${selected.pairAddress}?embed=1&theme=dark&trades=0&info=0`}
                    width="100%"
                    height="440"
                    style={{ border: 'none' }}
                    allow="clipboard-write"
                    referrerPolicy="no-referrer"
                  />
                </ErrorBoundary>
              </div>
            )}

            {/* Selected signal full detail */}
            {selected && (
              <div className="bg-[#0a0a0a] border border-white/[0.06] rounded-xl p-5">
                <div className="flex items-center gap-2 mb-4">
                  <Zap className="w-4 h-4 text-orange-500" />
                  <span className="text-sm font-semibold text-white">Sentiment Intelligence — {selected.symbol}</span>
                  {selected.baseTokenAddress && (
                    <CopyButton text={selected.baseTokenAddress} />
                  )}
                  <span className="text-xs text-gray-600 ml-auto">Age: {selected.ageHours}h</span>
                </div>
                <SocialSignalsPanel signal={selected} />
                <div className="grid grid-cols-2 gap-3 mt-4">
                  <div className="bg-white/[0.02] rounded-lg p-3">
                    <div className="text-[10px] text-gray-600 mb-1">Buy Pressure</div>
                    <div className="text-lg font-bold text-white font-mono">{selected.buyPressure}%</div>
                    <div className="h-1 bg-white/5 rounded mt-1 overflow-hidden">
                      <div className={`h-full rounded ${selected.buyPressure >= 60 ? 'bg-green-500' : 'bg-red-500'}`} style={{ width: `${selected.buyPressure}%` }} />
                    </div>
                  </div>
                  <div className="bg-white/[0.02] rounded-lg p-3">
                    <div className="text-[10px] text-gray-600 mb-1">Age</div>
                    <div className="text-lg font-bold text-white font-mono">
                      {formatAge(selected.ageHours)}
                    </div>
                    <div className="text-[10px] text-gray-600 mt-1 uppercase tracking-tighter font-black">{selected.dex}</div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Right: Signal list */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                <Flame className="w-4 h-4 text-orange-500" />
                Live Memecoin Signals
              </h2>
              <span className="text-xs text-gray-600">{signals.length} tokens</span>
            </div>
            {loading ? (
              <div className="flex flex-col items-center justify-center py-20 gap-3">
                <div className="w-8 h-8 border-2 border-orange-500/30 border-t-orange-500 rounded-full animate-spin" />
                <p className="text-xs text-gray-600">Scanning DexScreener…</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[calc(100vh-200px)] overflow-y-auto pr-1 custom-scrollbar">
                <AnimatePresence>
                  {signals.map(s => (
                    <MemeCard
                      key={s.id}
                      signal={s}
                      onSelect={setSelected}
                      selected={selected?.id === s.id}
                    />
                  ))}
                </AnimatePresence>
                {signals.length === 0 && (
                  <div className="text-center py-16 text-gray-600 text-sm">No signals found. Try adjusting filters.</div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
