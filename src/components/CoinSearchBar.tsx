'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, X, ChevronRight, AlertTriangle, TrendingUp, Shield, Zap, ExternalLink } from 'lucide-react';

interface Suggestion {
  name: string;
  symbol: string;
  address: string;
  chain: string;
  price: string;
  priceChange24h: number;
}

interface ConvictionReport {
  coinName: string;
  coinSymbol: string;
  coinAddress: string;
  chain: string;
  rugpullRisk: number;
  growthPotential: number;
  institutionalConviction: number;
  verdict: 'SAFE' | 'CAUTION' | 'HIGH_RISK' | 'CONFIRMED_RUG';
  verdictReason: string;
  onChainFlags: string[];
  socialSignals: string[];
  risks: string[];
  catalysts: string[];
  executiveSummary: string;
  whyThisCoinExists: string;
  teamBackground: string;
  price: string;
  priceChange24h: string;
  liquidity: string;
  marketCap: string;
  dexUrl: string;
  // thesis enrichment — optional
  _source?: 'thesis' | 'fallback';
  _thesis?: {
    agentFindings: any[];
    debate: any;
    agentsSpawned: string[];
    socialIntelligence: any;
    devHistory: any;
    analysisMs: number;
  };
}

const VERDICT_CONFIG = {
  SAFE:          { color: 'text-green-400',  bg: 'bg-green-500/10  border-green-500/20',  label: 'SAFE',          icon: Shield },
  CAUTION:       { color: 'text-yellow-400', bg: 'bg-yellow-500/10 border-yellow-500/20', label: 'CAUTION',       icon: AlertTriangle },
  HIGH_RISK:     { color: 'text-orange-400', bg: 'bg-orange-500/10 border-orange-500/20', label: 'HIGH RISK',     icon: AlertTriangle },
  CONFIRMED_RUG: { color: 'text-red-400',    bg: 'bg-red-500/10    border-red-500/20',    label: 'CONFIRMED RUG', icon: X },
};

function ScoreBar({ label, value, inverted = false }: { label: string; value: number; inverted?: boolean }) {
  const color = inverted
    ? value > 70 ? 'bg-red-500' : value > 40 ? 'bg-orange-500' : 'bg-green-500'
    : value > 70 ? 'bg-green-500' : value > 40 ? 'bg-yellow-500' : 'bg-orange-500';

  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-[10px] font-mono">
        <span className="text-gray-400 uppercase tracking-widest">{label}</span>
        <span className="text-white font-bold">{value}/100</span>
      </div>
      <div className="h-1 bg-white/5 rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${value}%` }}
          transition={{ duration: 1, ease: 'easeOut', delay: 0.3 }}
          className={`h-full rounded-full ${color} shadow-[0_0_8px_currentColor]`}
        />
      </div>
    </div>
  );
}

export default function CoinSearchBar() {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [report, setReport] = useState<ConvictionReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<NodeJS.Timeout>();

  // Autocomplete debounced search
  const fetchSuggestions = useCallback(async (q: string) => {
    if (q.length < 2) { setSuggestions([]); return; }
    setIsSearching(true);
    try {
      const res = await fetch(`/api/analyze?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      setSuggestions(data.suggestions ?? []);
      setShowDropdown(true);
    } catch { /* ignore */ }
    finally { setIsSearching(false); }
  }, []);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchSuggestions(query), 350);
    return () => clearTimeout(debounceRef.current);
  }, [query, fetchSuggestions]);

  const runAnalysis = async (searchQuery: string) => {
    setError(null);
    setReport(null);
    setIsAnalyzing(true);
    setShowDropdown(false);

    try {
      // Try multi-agent thesis first, fall back to analyze
      const res = await fetch('/api/thesis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: searchQuery }),
      });
      const data = await res.json();
      if (!data.ok) {
        // Fallback to original analyze
        const fallback = await fetch('/api/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: searchQuery }),
        });
        const fd = await fallback.json();
        if (!fd.ok) throw new Error(fd.error ?? 'Analysis failed');
        setReport({ ...fd.report, _source: 'fallback' });
      } else {
        // Normalize thesis report to match display shape
        const r = data.report;
        setReport({
          coinName: r.tokenName,
          coinSymbol: r.tokenSymbol,
          coinAddress: r.tokenAddress,
          chain: r.chain,
          rugpullRisk: 100 - r.finalScore,
          growthPotential: r.finalScore,
          institutionalConviction: r.finalScore,
          verdict: r.finalVerdict,
          verdictReason: r.thesisSummary?.split('\n')[0] ?? '',
          onChainFlags: r.agentFindings?.find((f: any) => f.agentRole === 'security')?.flags ?? [],
          socialSignals: r.agentFindings?.find((f: any) => f.agentRole === 'social')?.catalysts ?? [],
          risks: r.agentFindings?.find((f: any) => f.agentRole === 'security')?.flags?.slice(0, 3) ?? [],
          catalysts: r.agentFindings?.find((f: any) => f.agentRole === 'social')?.catalysts?.slice(0, 3) ?? [],
          executiveSummary: r.thesisSummary ?? '',
          whyThisCoinExists: r.cgDescription ?? '',
          teamBackground: r.devHistory?.summary ?? '',
          price: r.price ?? 'Unknown',
          priceChange24h: r.priceChange24h ?? 'N/A',
          liquidity: r.liquidity ?? 'N/A',
          marketCap: r.marketCap ?? 'N/A',
          dexUrl: r.dexUrl ?? '',
          // Extra thesis data
          _thesis: {
            agentFindings: r.agentFindings ?? [],
            debate: r.debate,
            agentsSpawned: r.agentsSpawned ?? [],
            socialIntelligence: r.socialIntelligence,
            devHistory: r.devHistory,
            analysisMs: r.analysisMs,
          },
          _source: 'thesis',
        });
      }
    } catch (e: any) {
      setError(e.message ?? 'Analysis failed. Try again.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && query.trim()) runAnalysis(query.trim());
    if (e.key === 'Escape') { setShowDropdown(false); setReport(null); }
  };

  const selectSuggestion = (s: Suggestion) => {
    setQuery(s.symbol);
    setSuggestions([]);
    runAnalysis(s.address || s.symbol);
  };

  const verdict = report ? VERDICT_CONFIG[report.verdict] : null;
  const VerdictIcon = verdict?.icon ?? Shield;

  return (
    <div className="w-full max-w-2xl mx-auto relative z-20">
      {/* Search Input */}
      <div className="relative group">
        <div className="absolute inset-0 rounded-2xl bg-orange-500/10 blur-xl opacity-0 group-focus-within:opacity-100 transition-opacity duration-500" />
        <div className="relative flex items-center gap-3 bg-white/[0.04] border border-white/10 group-focus-within:border-orange-500/40 rounded-2xl px-4 py-3.5 transition-all duration-300 backdrop-blur-xl">
          <Search className="w-4 h-4 text-gray-500 group-focus-within:text-orange-400 transition-colors flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => suggestions.length > 0 && setShowDropdown(true)}
            placeholder="Search any coin — PEPE, DOGE, 0x1234... — get the truth."
            className="flex-1 bg-transparent text-sm text-white placeholder:text-gray-600 outline-none font-mono"
          />
          {(isSearching || isAnalyzing) && (
            <div className="w-4 h-4 border border-orange-500/50 border-t-orange-500 rounded-full animate-spin flex-shrink-0" />
          )}
          {query && !isAnalyzing && (
            <button onClick={() => { setQuery(''); setReport(null); setError(null); setSuggestions([]); }} className="text-gray-600 hover:text-gray-300 transition-colors">
              <X className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={() => query.trim() && runAnalysis(query.trim())}
            disabled={isAnalyzing || !query.trim()}
            className="flex-shrink-0 px-3 py-1.5 bg-orange-500 hover:bg-orange-400 disabled:opacity-40 disabled:cursor-not-allowed text-black text-[10px] font-black tracking-widest uppercase rounded-lg transition-colors"
          >
            ANALYZE
          </button>
        </div>
      </div>

      {/* Autocomplete dropdown */}
      <AnimatePresence>
        {showDropdown && suggestions.length > 0 && !isAnalyzing && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="absolute top-full left-0 right-0 mt-2 bg-[#0a0a0a]/95 border border-white/10 rounded-xl overflow-hidden backdrop-blur-2xl z-50 shadow-2xl"
          >
            {suggestions.map((s, i) => (
              <button
                key={i}
                onClick={() => selectSuggestion(s)}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 transition-colors text-left"
              >
                <div className="w-7 h-7 rounded-lg bg-orange-500/10 flex items-center justify-center flex-shrink-0">
                  <span className="text-[9px] font-black text-orange-400">{s.chain?.slice(0, 3).toUpperCase()}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-white">{s.symbol}</div>
                  <div className="text-[10px] text-gray-500 truncate">{s.name}</div>
                </div>
                {s.price && (
                  <div className="text-right flex-shrink-0">
                    <div className="text-xs font-mono text-white">${parseFloat(s.price).toFixed(6)}</div>
                    <div className={`text-[10px] font-mono ${(s.priceChange24h ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {(s.priceChange24h ?? 0) >= 0 ? '+' : ''}{s.priceChange24h}%
                    </div>
                  </div>
                )}
                <ChevronRight className="w-3 h-3 text-gray-600 flex-shrink-0" />
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Analyzing state — full scanning animation */}
      <AnimatePresence>
        {isAnalyzing && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="mt-4 bg-[#050505] border border-orange-500/20 rounded-2xl p-6 backdrop-blur-xl overflow-hidden relative"
          >
            {/* Animated background pulse */}
            <div className="absolute inset-0 bg-gradient-to-br from-orange-500/5 via-transparent to-transparent" />
            <motion.div
              className="absolute inset-0 bg-gradient-to-r from-transparent via-orange-500/5 to-transparent"
              animate={{ x: ['-100%', '200%'] }}
              transition={{ duration: 2.5, repeat: Infinity, ease: 'linear' }}
            />

            <div className="relative space-y-4">
              {/* Header */}
              <div className="flex items-center gap-3 mb-5">
                <div className="relative">
                  <div className="w-8 h-8 border-2 border-orange-500/20 border-t-orange-500 rounded-full animate-spin" />
                  <div className="absolute inset-1 w-6 h-6 border border-orange-500/30 border-b-orange-400 rounded-full animate-spin" style={{ animationDirection: 'reverse', animationDuration: '0.8s' }} />
                </div>
                <div>
                  <div className="text-sm font-bold text-white">Celsor Intelligence Engine</div>
                  <div className="text-[10px] text-orange-400/70 font-mono uppercase tracking-widest">Scanning {query.toUpperCase()}…</div>
                </div>
              </div>

              {/* Step-by-step progress */}
              {[
                { step: 'DEX & Liquidity Scan', detail: 'DexScreener + Uniswap pair data', delay: 0 },
                { step: 'On-Chain Safety Check', detail: 'GoPlus contract analysis + honeypot detection', delay: 0.7 },
                { step: 'Social Intelligence Layer', detail: 'Twitter, YouTube, Telegram sentiment', delay: 1.4 },
                { step: 'Wallet Fingerprint Analysis', detail: 'Smart money classification + RAG context', delay: 2.1 },
                { step: 'Synthesizing Verdict', detail: 'Multi-agent thesis + conviction scoring', delay: 2.8 },
              ].map((item, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: item.delay, duration: 0.4 }}
                  className="flex items-start gap-3"
                >
                  <motion.div
                    className="mt-0.5 w-2 h-2 rounded-full bg-orange-500 shrink-0"
                    animate={{ opacity: [0.3, 1, 0.3], scale: [0.8, 1.2, 0.8] }}
                    transition={{ duration: 1.2, repeat: Infinity, delay: item.delay * 0.3 }}
                  />
                  <div>
                    <div className="text-xs font-semibold text-white">{item.step}</div>
                    <div className="text-[10px] text-gray-600 font-mono">{item.detail}</div>
                  </div>
                  <motion.div
                    className="ml-auto text-[9px] text-orange-400/50 font-mono uppercase"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: item.delay + 0.3 }}
                  >
                    ✓
                  </motion.div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Error */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mt-4 bg-red-500/10 border border-red-500/20 rounded-xl p-4 flex items-center gap-3"
          >
            <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
            <p className="text-sm text-red-300">{error}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Conviction Report */}
      <AnimatePresence>
        {report && verdict && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className="mt-4 bg-[#050505]/80 border border-white/10 rounded-2xl overflow-hidden backdrop-blur-2xl"
          >
            {/* Header */}
            <div className={`px-6 py-4 border-b border-white/5 flex items-center justify-between ${verdict.bg}`}>
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl ${verdict.bg} border ${verdict.bg.split(' ')[1]} flex items-center justify-center`}>
                  <VerdictIcon className={`w-5 h-5 ${verdict.color}`} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-black tracking-tight">{report.coinSymbol}</h3>
                    <span className="text-gray-500 text-sm">{report.coinName}</span>
                  </div>
                  <div className={`text-[10px] font-black tracking-[0.3em] uppercase ${verdict.color}`}>{verdict.label}</div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-xl font-black font-mono">{report.price}</div>
                <div className={`text-xs font-mono ${report.priceChange24h?.startsWith('-') ? 'text-red-400' : 'text-green-400'}`}>
                  {report.priceChange24h}
                </div>
              </div>
            </div>

            <div className="p-6 space-y-6">
              {/* Verdict reason */}
              <p className="text-sm text-gray-300 leading-relaxed border-l-2 border-orange-500/50 pl-3">
                {report.verdictReason}
              </p>

              {/* Score bars */}
              <div className="grid grid-cols-3 gap-4">
                <ScoreBar label="Rug Risk" value={report.rugpullRisk} inverted />
                <ScoreBar label="Growth" value={report.growthPotential} />
                <ScoreBar label="Conviction" value={report.institutionalConviction} />
              </div>

              {/* Market stats */}
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'Liquidity', value: report.liquidity },
                  { label: 'Market Cap', value: report.marketCap },
                ].map(({ label, value }) => (
                  <div key={label} className="bg-white/[0.02] border border-white/5 rounded-xl p-3">
                    <div className="text-[9px] text-gray-600 uppercase tracking-widest font-mono mb-1">{label}</div>
                    <div className="text-sm font-black font-mono">{value}</div>
                  </div>
                ))}
              </div>

              {/* Flags & Signals */}
              <div className="grid grid-cols-2 gap-4">
                {report.onChainFlags?.length > 0 && (
                  <div>
                    <div className="text-[9px] text-gray-600 uppercase tracking-widest font-mono mb-2">On-Chain Flags</div>
                    <div className="space-y-1">
                      {report.onChainFlags.map((flag, i) => (
                        <div key={i} className="flex items-start gap-2 text-[11px] text-red-300">
                          <span className="text-red-500 mt-0.5">▸</span>{flag}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {report.socialSignals?.length > 0 && (
                  <div>
                    <div className="text-[9px] text-gray-600 uppercase tracking-widest font-mono mb-2">Social Signals</div>
                    <div className="space-y-1">
                      {report.socialSignals.map((sig, i) => (
                        <div key={i} className="flex items-start gap-2 text-[11px] text-blue-300">
                          <span className="text-blue-500 mt-0.5">▸</span>{sig}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Executive Summary */}
              <div className="bg-white/[0.02] border border-white/5 rounded-xl p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Zap className="w-3.5 h-3.5 text-orange-400" />
                  <span className="text-[9px] font-black text-orange-400 uppercase tracking-widest">Executive Summary</span>
                </div>
                <p className="text-xs text-gray-300 leading-relaxed">{report.executiveSummary}</p>
                {report.whyThisCoinExists && (
                  <div>
                    <div className="text-[9px] text-gray-600 uppercase tracking-widest font-mono mb-1">Why This Coin Exists</div>
                    <p className="text-xs text-gray-400 leading-relaxed">{report.whyThisCoinExists}</p>
                  </div>
                )}
              </div>

              {/* Agent Debate Panel — only shown for multi-agent thesis */}
              {(report as any)._thesis?.debate && (
                <div className="bg-white/[0.02] border border-orange-500/10 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse" />
                    <span className="text-[9px] font-black text-orange-400 uppercase tracking-widest">Agent Debate — {(report as any)._thesis.agentsSpawned?.join(' → ')}</span>
                    {(report as any)._thesis.debate.conflict && (
                      <span className="ml-auto text-[9px] text-yellow-400 font-bold uppercase">⚡ Conflict Detected</span>
                    )}
                  </div>
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <span className="text-[9px] font-bold text-blue-400 uppercase w-14 shrink-0">Security</span>
                      <span className="text-[10px] text-gray-400 leading-relaxed">{(report as any)._thesis.agentFindings?.find((f: any) => f.agentRole === 'security')?.summary}</span>
                    </div>
                    <div className="flex gap-2">
                      <span className="text-[9px] font-bold text-purple-400 uppercase w-14 shrink-0">Social</span>
                      <span className="text-[10px] text-gray-400 leading-relaxed">{(report as any)._thesis.agentFindings?.find((f: any) => f.agentRole === 'social')?.summary}</span>
                    </div>
                    {(report as any)._thesis.agentFindings?.find((f: any) => f.agentRole === 'economic') && (
                      <div className="flex gap-2">
                        <span className="text-[9px] font-bold text-yellow-400 uppercase w-14 shrink-0">Econ</span>
                        <span className="text-[10px] text-gray-400 leading-relaxed">{(report as any)._thesis.agentFindings.find((f: any) => f.agentRole === 'economic')?.summary}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Social Intelligence Scores */}
              {(report as any)._thesis?.socialIntelligence && (() => {
                const si = (report as any)._thesis.socialIntelligence;
                return (
                  <div>
                    <div className="text-[9px] text-gray-600 uppercase tracking-widest font-mono mb-2">Social Intelligence</div>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { label: 'X (Twitter)', score: si.xScore, sentiment: si.xSentiment, detail: si.xFollowers ? `${(si.xFollowers/1000).toFixed(0)}K followers` : 'No data' },
                        { label: 'YouTube', score: si.ytScore, sentiment: si.ytSentiment, detail: si.ytVideoCount ? `${si.ytVideoCount} video(s)` : 'No coverage' },
                        { label: 'Telegram', score: si.tgScore, sentiment: si.tgSentiment, detail: si.tgMemberCount ? `${(si.tgMemberCount/1000).toFixed(0)}K members` : 'Unknown' },
                      ].map(src => (
                        <div key={src.label} className="bg-white/[0.02] border border-white/5 rounded-lg p-2.5 text-center">
                          <div className="text-[8px] text-gray-600 uppercase mb-1">{src.label}</div>
                          <div className={`text-lg font-black font-mono ${ src.score >= 60 ? 'text-green-400' : src.score >= 30 ? 'text-yellow-400' : 'text-red-400'}`}>{src.score}</div>
                          <div className={`text-[8px] font-bold uppercase mt-0.5 ${
                            src.sentiment === 'BULLISH' ? 'text-green-500' :
                            src.sentiment === 'BEARISH' || src.sentiment === 'PANIC' ? 'text-red-400' : 'text-gray-600'
                          }`}>{src.sentiment}</div>
                          <div className="text-[8px] text-gray-600 mt-1">{src.detail}</div>
                        </div>
                      ))}
                    </div>
                    <div className="mt-1.5 flex items-center justify-between">
                      <span className="text-[9px] text-gray-600">Narrative: <span className={`font-bold ${ si.narrativeStrength === 'VIRAL' ? 'text-orange-400' : si.narrativeStrength === 'STRONG' ? 'text-green-400' : 'text-gray-500'}`}>{si.narrativeStrength}</span></span>
                      <span className="text-[9px] text-gray-600">Trend: <span className={`font-bold ${ si.socialTrend === 'GROWING' ? 'text-green-400' : si.socialTrend === 'DECLINING' ? 'text-red-400' : 'text-gray-500'}`}>{si.socialTrend}</span></span>
                    </div>
                  </div>
                );
              })()}

              {/* Dev History — subtle, small, easily missed */}
              {(report as any)._thesis?.devHistory?.rugCount > 0 && (
                <div className="opacity-50 hover:opacity-100 transition-opacity">
                  <div className="text-[8px] text-red-600 uppercase tracking-widest font-mono mb-1 flex items-center gap-1">⚠ Dev History</div>
                  <p className="text-[9px] text-red-500">{(report as any)._thesis.devHistory.summary}</p>
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-[9px] text-gray-600 uppercase tracking-widest font-mono mb-2 flex items-center gap-1">
                    <AlertTriangle className="w-2.5 h-2.5" />Risks
                  </div>
                  {report.risks?.map((r, i) => (
                    <div key={i} className="text-[11px] text-gray-400 py-1 border-b border-white/5 last:border-0">{r}</div>
                  ))}
                </div>
                <div>
                  <div className="text-[9px] text-gray-600 uppercase tracking-widest font-mono mb-2 flex items-center gap-1">
                    <TrendingUp className="w-2.5 h-2.5" />Catalysts
                  </div>
                  {report.catalysts?.map((c, i) => (
                    <div key={i} className="text-[11px] text-gray-400 py-1 border-b border-white/5 last:border-0">{c}</div>
                  ))}
                </div>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between pt-2 border-t border-white/5">
                <span className="text-[9px] text-gray-600 font-mono">
                  Analysed by Celsor Intelligence Engine · {new Date().toLocaleTimeString()}
                </span>
                {report.dexUrl && (
                  <a href={report.dexUrl} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1 text-[9px] text-orange-500 hover:text-orange-400 font-mono uppercase tracking-widest transition-colors">
                    View on DEX <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
