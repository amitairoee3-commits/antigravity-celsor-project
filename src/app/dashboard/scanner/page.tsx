'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Brain, Search, Loader2, Zap, Globe, TrendingUp, TrendingDown,
  Eye, ShieldAlert, Tag, BarChart2, Hash, ExternalLink, Plus,
  ChevronDown, ChevronUp, Activity,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface WalletAnalysis {
  ok: boolean;
  address: string;
  chain: string;
  cached: boolean;
  wallet: {
    archetype: string;
    convictionScore: number;
    followWorthiness: number;
    tags: string[];
    totalVolumeUSD: number;
    txCount: number;
  };
  profile: {
    behaviorSummary: string;
    strengths: string[];
    riskFactors: string[];
    tradingStyle: string;
    estimatedExpertiseLevel: string;
  };
  signals: Array<{
    id: string;
    tokenSymbol: string;
    convictionScore: number;
    direction: string;
    anomalyReasons: string[];
    valueUSD: number;
    txHash: string;
  }>;
  topSignalNarrative?: {
    title: string;
    catalystSummary: string;
    direction: string;
    riskRating: string;
    timeHorizon: string;
    keyTags: string[];
  };
  durationMs: number;
}

const KNOWN_WHALES = [
  { label: 'Binance Hot', address: '0x3f5CE5FBFe3E9af3971dD833D26bA9b5C936f0bE', chain: 'eth' },
  { label: 'Binance 14', address: '0x28C6c06298d514Db089934071355E5743bf21d60', chain: 'eth' },
  { label: 'Jump Trading', address: '0x47ac0Fb4F2D84898e4D9E7b4DaB3C24507a6D503', chain: 'eth' },
  { label: 'Binance Cold', address: '0xBE0eB53F46cd790Cd13851d5EFf43D12404d33E8', chain: 'eth' },
];

const CHAINS = [
  { value: 'eth', label: 'Ethereum' },
  { value: 'arb', label: 'Arbitrum' },
  { value: 'base', label: 'Base' },
  { value: 'bsc', label: 'BSC' },
  { value: 'op', label: 'Optimism' },
];

export default function ScannerPage() {
  const [address, setAddress] = useState('');
  const [chain, setChain]     = useState('eth');
  const [loading, setLoading] = useState(false);
  const [result, setResult]   = useState<WalletAnalysis | null>(null);
  const [error, setError]     = useState('');
  const [showSignals, setShowSignals] = useState(true);

  const analyze = async (addr = address, ch = chain) => {
    const cleanAddr = addr.trim();
    if (!cleanAddr.match(/^0x[a-fA-F0-9]{40}$/)) {
      setError('Please enter a valid Ethereum address (0x...)');
      return;
    }
    setError('');
    setLoading(true);
    setResult(null);

    try {
      const res = await fetch('/api/ai/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: cleanAddr, chain: ch }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? 'Analysis failed');
      setResult(data);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const score = result?.wallet?.convictionScore ?? 0;
  const scoreColor = score >= 80 ? '#f97316' : score >= 65 ? '#3b82f6' : '#6b7280';

  return (
    <div className="min-w-0">
      <main className="max-w-screen-xl mx-auto px-6 py-8 space-y-8">
        {/* Search */}
        <div className="max-w-2xl">
          <h1 className="text-3xl font-light text-white mb-2 tracking-tight">
            AI Wallet <span className="text-orange-500 font-semibold">Deep Scanner</span>
          </h1>
          <p className="text-gray-500 text-sm mb-6">
            Enter any EVM wallet address to receive an AI-generated behavioral profile, conviction score, and live signal analysis.
          </p>

          <div className="flex flex-col gap-3">
            <div className="flex gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600" />
                <input
                  type="text"
                  value={address}
                  onChange={e => setAddress(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && analyze()}
                  placeholder="0x... wallet address"
                  className="w-full pl-10 pr-4 py-3 bg-white/[0.04] border border-white/[0.08] rounded-xl text-white text-sm placeholder-gray-600 focus:outline-none focus:border-orange-500/40 focus:bg-white/[0.06] transition-all font-mono"
                />
              </div>
              <select
                value={chain}
                onChange={e => setChain(e.target.value)}
                className="bg-white/[0.04] border border-white/[0.08] rounded-xl text-gray-300 text-sm px-3 focus:outline-none focus:border-orange-500/40"
              >
                {CHAINS.map(c => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
              <button
                onClick={() => analyze()}
                disabled={loading}
                className="flex items-center gap-2 px-5 py-3 bg-orange-500 hover:bg-orange-600 text-black font-bold text-sm rounded-xl transition-colors disabled:opacity-50 shrink-0"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Brain className="w-4 h-4" />}
                {loading ? 'Analyzing...' : 'Analyze'}
              </button>
            </div>

            {error && (
              <p className="text-red-400 text-xs flex items-center gap-1.5">
                <ShieldAlert className="w-3.5 h-3.5" /> {error}
              </p>
            )}
          </div>

          {/* Quick load known whales */}
          <div className="mt-4 flex flex-wrap gap-2">
            <span className="text-xs text-gray-600 self-center">Quick load:</span>
            {KNOWN_WHALES.map(w => (
              <button
                key={w.address}
                onClick={() => { setAddress(w.address); setChain(w.chain); analyze(w.address, w.chain); }}
                className="text-xs px-3 py-1.5 bg-white/[0.04] border border-white/[0.06] rounded-lg text-gray-400 hover:text-white hover:bg-white/[0.08] transition-colors font-mono"
              >
                {w.label}
              </button>
            ))}
          </div>
        </div>

        {/* Loading state */}
        {loading && (
          <div className="flex flex-col items-center gap-6 py-16">
            <div className="relative">
              <div className="w-16 h-16 rounded-full border-2 border-orange-500/20 flex items-center justify-center">
                <Brain className="w-7 h-7 text-orange-500" />
              </div>
              <div className="absolute inset-0 rounded-full border-2 border-orange-500/60 border-t-transparent animate-spin" />
              <div className="absolute inset-0 blur-2xl bg-orange-500/10 rounded-full" />
            </div>
            <div className="text-center">
              <p className="text-white font-medium mb-1">Running AI Analysis</p>
              <p className="text-sm text-gray-500">Fetching on-chain data → Classifying wallet → Generating narrative...</p>
            </div>
          </div>
        )}

        {/* Results */}
        <AnimatePresence>
          {result && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="space-y-6"
            >
              {/* Header card */}
              <div className="bg-[#0d0d0d] border border-white/[0.06] rounded-2xl p-6">
                <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
                  <div>
                    <div className="flex items-center gap-3 mb-2">
                      <span className="font-mono text-sm text-gray-400">
                        {result.address.slice(0, 10)}...{result.address.slice(-8)}
                      </span>
                      <a
                        href={`https://etherscan.io/address/${result.address}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-gray-600 hover:text-gray-400"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                      {result.cached && (
                        <span className="text-xs text-gray-600 bg-white/5 px-2 py-0.5 rounded">cached</span>
                      )}
                    </div>
                    <h2 className="text-2xl font-bold text-white">{result.wallet.archetype}</h2>
                    <p className="text-sm text-gray-500 mt-1">
                      {result.profile?.estimatedExpertiseLevel} · {result.profile?.tradingStyle} · {result.chain.toUpperCase()}
                    </p>
                  </div>

                  <div className="text-right">
                    <div className="text-xs text-gray-500 uppercase tracking-widest mb-1">Conviction Score</div>
                    <div className="text-5xl font-black font-mono" style={{ color: scoreColor }}>
                      {result.wallet.convictionScore}
                    </div>
                    <div className="text-xs text-gray-600 mt-1">Follow Worthiness: {result.wallet.followWorthiness}/100</div>
                  </div>
                </div>

                {/* Tags */}
                <div className="flex flex-wrap gap-2 mb-5">
                  {result.wallet.tags?.map((tag, i) => (
                    <span key={i} className="text-xs text-gray-500 bg-white/[0.04] border border-white/[0.06] px-2.5 py-1 rounded-lg flex items-center gap-1.5">
                      <Tag className="w-3 h-3" /> {tag}
                    </span>
                  ))}
                </div>

                {/* Stats */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t border-white/[0.05]">
                  {[
                    { label: 'Total Volume', value: `$${(result.wallet.totalVolumeUSD / 1000).toFixed(1)}K`, icon: BarChart2 },
                    { label: 'TX Count', value: result.wallet.txCount, icon: Hash },
                    { label: 'Chain', value: result.chain.toUpperCase(), icon: Globe },
                    { label: 'Analysis Time', value: `${result.durationMs}ms`, icon: Activity },
                  ].map(({ label, value, icon: Icon }) => (
                    <div key={label}>
                      <div className="text-xs text-gray-600 flex items-center gap-1.5 mb-1">
                        <Icon className="w-3 h-3" /> {label}
                      </div>
                      <div className="text-sm font-semibold text-white font-mono">{value}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* AI Profile */}
              {result.profile && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-[#0d0d0d] border border-white/[0.06] rounded-2xl p-5">
                    <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                      <Brain className="w-3.5 h-3.5 text-orange-500" /> Behavioral Profile
                    </h3>
                    <p className="text-sm text-gray-300 leading-relaxed mb-4">{result.profile.behaviorSummary}</p>

                    <div className="space-y-3">
                      <div>
                        <div className="text-xs text-green-500 font-semibold mb-1">Strengths</div>
                        {result.profile.strengths?.map((s, i) => (
                          <div key={i} className="text-xs text-gray-400 flex items-center gap-2 py-0.5">
                            <div className="w-1.5 h-1.5 bg-green-500 rounded-full shrink-0" /> {s}
                          </div>
                        ))}
                      </div>
                      <div>
                        <div className="text-xs text-red-400 font-semibold mb-1">Risk Factors</div>
                        {result.profile.riskFactors?.map((r, i) => (
                          <div key={i} className="text-xs text-gray-400 flex items-center gap-2 py-0.5">
                            <div className="w-1.5 h-1.5 bg-red-500 rounded-full shrink-0" /> {r}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Top signal narrative */}
                  {result.topSignalNarrative && (
                    <div className="bg-[#0d0d0d] border border-white/[0.06] rounded-2xl p-5">
                      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                        <Zap className="w-3.5 h-3.5 text-orange-500" /> Top Signal
                      </h3>
                      <div className={`flex items-center gap-2 mb-3 ${
                        result.topSignalNarrative.direction === 'LONG' ? 'text-green-400' :
                        result.topSignalNarrative.direction === 'SHORT' ? 'text-red-400' : 'text-yellow-400'
                      }`}>
                        {result.topSignalNarrative.direction === 'LONG' ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                        <span className="font-bold text-sm tracking-wide">{result.topSignalNarrative.direction}</span>
                        <span className="text-gray-600 text-xs ml-auto">{result.topSignalNarrative.timeHorizon}</span>
                      </div>
                      <p className="text-sm font-medium text-white mb-2">{result.topSignalNarrative.title}</p>
                      <p className="text-xs text-gray-400 leading-relaxed mb-3">{result.topSignalNarrative.catalystSummary}</p>
                      <div className="flex flex-wrap gap-1.5">
                        {result.topSignalNarrative.keyTags?.map((t, i) => (
                          <span key={i} className="text-xs text-gray-600 bg-white/[0.03] border border-white/[0.05] px-2 py-0.5 rounded">
                            {t}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Scored signals */}
              {result.signals?.length > 0 && (
                <div className="bg-[#0d0d0d] border border-white/[0.06] rounded-2xl overflow-hidden">
                  <button
                    onClick={() => setShowSignals(s => !s)}
                    className="w-full flex items-center justify-between px-5 py-4 hover:bg-white/[0.02] transition-colors"
                  >
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-widest flex items-center gap-2">
                      <Activity className="w-3.5 h-3.5 text-orange-500" /> Detected Signals ({result.signals.length})
                    </span>
                    {showSignals ? <ChevronUp className="w-4 h-4 text-gray-600" /> : <ChevronDown className="w-4 h-4 text-gray-600" />}
                  </button>

                  <AnimatePresence>
                    {showSignals && (
                      <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden">
                        <div className="border-t border-white/[0.05] divide-y divide-white/[0.03]">
                          {result.signals.map((sig, i) => (
                            <div key={i} className="flex items-center justify-between px-5 py-3 hover:bg-white/[0.02] transition-colors">
                              <div className="flex items-center gap-3">
                                <span className={`text-xs font-bold ${sig.direction === 'LONG' ? 'text-green-400' : sig.direction === 'SHORT' ? 'text-red-400' : 'text-yellow-400'}`}>
                                  {sig.direction}
                                </span>
                                <span className="text-sm text-white font-medium">{sig.tokenSymbol}</span>
                                <span className="text-xs text-gray-600">${(sig.valueUSD / 1000).toFixed(1)}K</span>
                              </div>
                              <div className="flex items-center gap-3">
                                <div className="flex gap-1.5 flex-wrap justify-end max-w-xs">
                                  {sig.anomalyReasons?.slice(0, 2).map((r, j) => (
                                    <span key={j} className="text-xs text-gray-600 bg-white/[0.03] px-2 py-0.5 rounded">
                                      {r}
                                    </span>
                                  ))}
                                </div>
                                <span className="text-sm font-mono font-bold text-orange-400 w-8 text-right">
                                  {sig.convictionScore}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
