'use client';

/**
 * CELSOR — Alpha Terminal Component
 *
 * The "Black Box" view.
 * No fluff. No decoration. Just institutional signal intelligence.
 *
 * Layout per signal:
 *   TOKEN | WHALE ENTRY | SOCIAL HEAT | SECURITY | MACRO | ENTRY | EXIT | CONVICTION
 *
 * Designed to look and feel like a Bloomberg terminal for crypto.
 */

import { motion, AnimatePresence } from 'framer-motion';
import { useState } from 'react';
import {
  TrendingUp, TrendingDown, Eye, Zap, ShieldCheck, ShieldAlert,
  ShieldX, Brain, BarChart2, Globe, ChevronDown, ExternalLink,
  AlertTriangle, CheckCircle, Clock, DollarSign,
} from 'lucide-react';
import type { CachedSignal } from '@/lib/cache/signalCache';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AlphaTerminalProps {
  signals: CachedSignal[];
  isScanning?: boolean;
}

// ─── Utility renderers ────────────────────────────────────────────────────────

function ConvictionBar({ score }: { score: number }) {
  const color =
    score >= 88 ? '#f97316' :
    score >= 75 ? '#3b82f6' :
    score >= 60 ? '#8b5cf6' :
    '#4b5563';

  const label =
    score >= 88 ? 'EXTREME' :
    score >= 75 ? 'HIGH' :
    score >= 60 ? 'MEDIUM' :
    'LOW';

  return (
    <div className="flex items-center gap-2">
      <div className="relative flex-1 h-[3px] bg-white/5 rounded-full overflow-hidden min-w-[60px]">
        <motion.div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{ backgroundColor: color }}
          initial={{ width: 0 }}
          animate={{ width: `${score}%` }}
          transition={{ duration: 1.4, ease: 'easeOut' }}
        />
      </div>
      <span
        className="font-mono text-sm font-black tabular-nums w-6"
        style={{ color }}
      >
        {score}
      </span>
      <span
        className="text-[9px] font-bold tracking-widest"
        style={{ color }}
      >
        {label}
      </span>
    </div>
  );
}

function DirectionPill({ direction }: { direction: CachedSignal['direction'] }) {
  if (direction === 'LONG') return (
    <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-emerald-500/15 border border-emerald-500/25 text-emerald-400">
      <TrendingUp className="w-3.5 h-3.5" />
      <span className="text-[11px] font-black tracking-widest">LONG</span>
    </div>
  );
  if (direction === 'SHORT') return (
    <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-red-500/15 border border-red-500/25 text-red-400">
      <TrendingDown className="w-3.5 h-3.5" />
      <span className="text-[11px] font-black tracking-widest">SHORT</span>
    </div>
  );
  return (
    <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-amber-500/15 border border-amber-500/25 text-amber-400">
      <Eye className="w-3.5 h-3.5" />
      <span className="text-[11px] font-black tracking-widest">WATCH</span>
    </div>
  );
}

function SecurityBadge({ risk }: { risk: string }) {
  if (risk === 'LOW') return (
    <div className="flex items-center gap-1 text-emerald-400">
      <ShieldCheck className="w-3.5 h-3.5" />
      <span className="text-[10px] font-semibold">CLEAN</span>
    </div>
  );
  if (risk === 'HIGH') return (
    <div className="flex items-center gap-1 text-red-400">
      <ShieldX className="w-3.5 h-3.5" />
      <span className="text-[10px] font-semibold">RISKY</span>
    </div>
  );
  return (
    <div className="flex items-center gap-1 text-amber-400">
      <ShieldAlert className="w-3.5 h-3.5" />
      <span className="text-[10px] font-semibold">CAUTION</span>
    </div>
  );
}

function ColumnHeader({ label, icon: Icon }: { label: string; icon: React.ElementType }) {
  return (
    <div className="flex items-center gap-1.5 text-[9px] text-gray-600 uppercase tracking-[0.15em] font-bold">
      <Icon className="w-3 h-3" />
      {label}
    </div>
  );
}

// ─── Signal Row ───────────────────────────────────────────────────────────────

function TerminalRow({ signal, index }: { signal: CachedSignal; index: number }) {
  const [expanded, setExpanded] = useState(false);

  const chainColors: Record<string, string> = {
    eth:  'text-blue-400',
    arb:  'text-sky-400',
    base: 'text-indigo-400',
    bsc:  'text-yellow-400',
    op:   'text-red-400',
  };

  const chainColor = chainColors[signal.chain] ?? 'text-gray-400';
  const isHighConviction = signal.convictionScore >= 88;
  const age = Math.round((Date.now() - signal.generatedAt) / 60000);
  const ageLabel = age < 60 ? `${age}m ago` : `${Math.round(age / 60)}h ago`;

  // Estimate rough entry/exit from signal data
  const valueK = (signal.valueUSD / 1000).toFixed(0);

  return (
    <>
      <motion.tr
        initial={{ opacity: 0, x: -8 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: index * 0.03, type: 'spring', stiffness: 260, damping: 22 }}
        onClick={() => setExpanded(e => !e)}
        className={`border-b cursor-pointer transition-all duration-200 group ${
          isHighConviction
            ? 'border-orange-500/10 hover:bg-orange-500/5 bg-orange-500/[0.02]'
            : 'border-white/[0.04] hover:bg-white/[0.03]'
        }`}
      >
        {/* Token */}
        <td className="py-3 pl-4 pr-3 w-36">
          <div className="flex items-center gap-2">
            {isHighConviction && (
              <div className="w-1.5 h-1.5 rounded-full bg-orange-500 shrink-0 shadow-[0_0_6px_rgba(249,115,22,0.8)]" />
            )}
            <div>
              <div className="font-bold text-white text-sm tracking-wide">{signal.tokenSymbol}</div>
              <div className={`text-[10px] font-semibold uppercase ${chainColor}`}>{signal.chain}</div>
            </div>
          </div>
        </td>

        {/* Direction */}
        <td className="py-3 px-3 w-28">
          <DirectionPill direction={signal.direction} />
        </td>

        {/* Whale Entry */}
        <td className="py-3 px-3 w-32">
          <div className="flex items-center gap-1.5">
            <DollarSign className="w-3 h-3 text-gray-600 shrink-0" />
            <span className="font-mono text-sm text-white font-semibold">${valueK}K</span>
          </div>
          <div className="text-[9px] text-gray-600 font-mono mt-0.5">
            {signal.walletAddress.slice(0, 6)}...{signal.walletAddress.slice(-4)}
          </div>
        </td>

        {/* Wallet Type */}
        <td className="py-3 px-3 w-40 hidden md:table-cell">
          <span className="text-xs text-gray-400 font-medium">
            {signal.walletArchetype ?? 'Unknown'}
          </span>
        </td>

        {/* Security */}
        <td className="py-3 px-3 w-24 hidden lg:table-cell">
          <SecurityBadge risk={signal.riskRating} />
        </td>

        {/* Time horizon */}
        <td className="py-3 px-3 w-20 hidden lg:table-cell">
          <span className="text-xs font-mono font-bold text-gray-400 bg-white/5 px-2 py-0.5 rounded">
            {signal.timeHorizon}
          </span>
        </td>

        {/* Conviction */}
        <td className="py-3 px-3 flex-1 min-w-[160px]">
          <ConvictionBar score={signal.convictionScore} />
        </td>

        {/* Age + expand */}
        <td className="py-3 pr-4 pl-2 w-24 text-right">
          <div className="flex items-center justify-end gap-2">
            <span className="text-[10px] text-gray-600 flex items-center gap-1">
              <Clock className="w-2.5 h-2.5" />
              {ageLabel}
            </span>
            <ChevronDown
              className={`w-3.5 h-3.5 text-gray-600 transition-transform group-hover:text-gray-400 ${expanded ? 'rotate-180' : ''}`}
            />
          </div>
        </td>
      </motion.tr>

      {/* Expanded row */}
      <AnimatePresence>
        {expanded && (
          <tr className="border-b border-white/[0.04]">
            <td colSpan={8} className="p-0">
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="px-4 py-4 bg-[#0a0a0a] grid grid-cols-1 md:grid-cols-3 gap-4">

                  {/* Catalyst */}
                  <div className="md:col-span-2 space-y-3">
                    <div>
                      <div className="flex items-center gap-2 mb-1.5">
                        <Brain className="w-3.5 h-3.5 text-orange-500" />
                        <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">AI Catalyst Analysis</span>
                      </div>
                      <p className="text-sm text-gray-300 leading-relaxed">{signal.catalystSummary}</p>
                    </div>

                    {/* Tags */}
                    {signal.keyTags?.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {signal.keyTags.map((tag, i) => (
                          <span
                            key={i}
                            className="text-[10px] text-gray-500 bg-white/[0.04] border border-white/[0.06] px-2 py-0.5 rounded font-mono"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Right panel: invalidation + actions */}
                  <div className="space-y-3">
                    <div>
                      <div className="flex items-center gap-2 mb-1.5">
                        <ShieldAlert className="w-3.5 h-3.5 text-red-400" />
                        <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Invalidation</span>
                      </div>
                      <div className="bg-red-500/5 border border-red-500/10 rounded-lg p-3">
                        <p className="text-xs text-red-300/80 leading-relaxed">{signal.invalidationCriteria}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <a
                        href={`https://etherscan.io/tx/${signal.txHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={e => e.stopPropagation()}
                        className="flex items-center gap-1.5 text-[10px] text-gray-500 hover:text-gray-300 transition-colors"
                      >
                        <ExternalLink className="w-3 h-3" />
                        View on Explorer
                      </a>
                    </div>
                  </div>
                </div>
              </motion.div>
            </td>
          </tr>
        )}
      </AnimatePresence>
    </>
  );
}

// ─── Alpha Terminal ───────────────────────────────────────────────────────────

export function AlphaTerminal({ signals, isScanning }: AlphaTerminalProps) {
  const [filter, setFilter] = useState<'ALL' | 'LONG' | 'SHORT' | 'WATCH'>('ALL');
  const [minConviction, setMinConviction] = useState(0);

  const filtered = signals
    .filter(s => filter === 'ALL' || s.direction === filter)
    .filter(s => s.convictionScore >= minConviction);

  const highConviction = signals.filter(s => s.convictionScore >= 88);
  const longs  = signals.filter(s => s.direction === 'LONG');
  const shorts = signals.filter(s => s.direction === 'SHORT');

  return (
    <div className="bg-[#060606] border border-white/[0.05] rounded-2xl overflow-hidden">
      {/* Terminal header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.05] bg-white/[0.01]">
        <div className="flex items-center gap-3">
          {/* "Terminal" traffic lights */}
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-red-500/70" />
            <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/70" />
            <div className="w-2.5 h-2.5 rounded-full bg-green-500/70" />
          </div>
          <span className="text-[11px] font-mono text-gray-500 tracking-widest uppercase">CELSOR // ALPHA TERMINAL</span>
          {isScanning && (
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse" />
              <span className="text-[9px] text-orange-500 font-mono uppercase tracking-widest">Scanning...</span>
            </div>
          )}
        </div>

        {/* Quick stats */}
        <div className="hidden md:flex items-center gap-4 text-[10px] font-mono">
          <span className="text-gray-600">
            <span className="text-orange-500 font-bold">{highConviction.length}</span> HIGH CONV
          </span>
          <span className="text-gray-600">
            <span className="text-emerald-400 font-bold">{longs.length}</span> LONG
          </span>
          <span className="text-gray-600">
            <span className="text-red-400 font-bold">{shorts.length}</span> SHORT
          </span>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-white/[0.04] bg-black/20">
        <div className="flex gap-1">
          {(['ALL', 'LONG', 'SHORT', 'WATCH'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-2.5 py-1 rounded text-[10px] font-bold tracking-wider transition-all ${
                filter === f
                  ? f === 'LONG'  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
                    f === 'SHORT' ? 'bg-red-500/20 text-red-400 border border-red-500/30' :
                    f === 'WATCH' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' :
                    'bg-white/10 text-white border border-white/20'
                  : 'text-gray-600 hover:text-gray-400 border border-transparent'
              }`}
            >
              {f}
            </button>
          ))}
        </div>

        <div className="w-px h-4 bg-white/10 mx-1" />

        {/* Min conviction slider */}
        <div className="flex items-center gap-2">
          <span className="text-[9px] text-gray-600 font-mono uppercase">Min:</span>
          {[0, 60, 75, 88].map(v => (
            <button
              key={v}
              onClick={() => setMinConviction(v)}
              className={`px-2 py-0.5 rounded text-[9px] font-mono transition-all ${
                minConviction === v
                  ? 'bg-orange-500/20 text-orange-400'
                  : 'text-gray-600 hover:text-gray-400'
              }`}
            >
              {v === 0 ? 'ALL' : `${v}+`}
            </button>
          ))}
        </div>

        <div className="ml-auto text-[9px] text-gray-600 font-mono">
          {filtered.length} signals
        </div>
      </div>

      {/* Column headers */}
      <div className="px-4 py-2 bg-black/30 border-b border-white/[0.03]">
        <table className="w-full table-fixed">
          <colgroup>
            <col className="w-36" />
            <col className="w-28" />
            <col className="w-32" />
            <col className="hidden md:table-column w-40" />
            <col className="hidden lg:table-column w-24" />
            <col className="hidden lg:table-column w-20" />
            <col />
            <col className="w-24" />
          </colgroup>
          <thead>
            <tr>
              <th className="text-left pb-1 pl-4"><ColumnHeader label="Token" icon={BarChart2} /></th>
              <th className="text-left pb-1 px-3"><ColumnHeader label="Signal" icon={Zap} /></th>
              <th className="text-left pb-1 px-3"><ColumnHeader label="Whale Entry" icon={DollarSign} /></th>
              <th className="text-left pb-1 px-3 hidden md:table-cell"><ColumnHeader label="Wallet Type" icon={Brain} /></th>
              <th className="text-left pb-1 px-3 hidden lg:table-cell"><ColumnHeader label="Security" icon={ShieldCheck} /></th>
              <th className="text-left pb-1 px-3 hidden lg:table-cell"><ColumnHeader label="Horizon" icon={Clock} /></th>
              <th className="text-left pb-1 px-3"><ColumnHeader label="Conviction" icon={Globe} /></th>
              <th className="text-right pb-1 pr-4"><ColumnHeader label="Age" icon={Clock} /></th>
            </tr>
          </thead>
        </table>
      </div>

      {/* Signal rows */}
      <div className="overflow-y-auto max-h-[600px]">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="font-mono text-[10px] text-gray-700 uppercase tracking-widest mb-2">
              AWAITING WHALE DETECTION
            </div>
            <div className="font-mono text-[9px] text-gray-800">
              Scanner active on 5 chains...
            </div>
          </div>
        ) : (
          <table className="w-full table-fixed">
            <colgroup>
              <col className="w-36" />
              <col className="w-28" />
              <col className="w-32" />
              <col className="hidden md:table-column w-40" />
              <col className="hidden lg:table-column w-24" />
              <col className="hidden lg:table-column w-20" />
              <col />
              <col className="w-24" />
            </colgroup>
            <tbody>
              <AnimatePresence mode="popLayout">
                {filtered.map((signal, i) => (
                  <TerminalRow key={signal.id} signal={signal} index={i} />
                ))}
              </AnimatePresence>
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
