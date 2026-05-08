'use client';

/**
 * CELSOR — Agent Debate Panel
 *
 * Visualizes the 3-agent parallel debate for any analyzed token.
 * Shows: Security verdict, Social verdict, Macro verdict, Adversarial Critique,
 * and the final weighted synthesis.
 *
 * Used in the token analysis / thesis pages.
 */

import { motion, AnimatePresence } from 'framer-motion';
import { useState } from 'react';
import {
  ShieldCheck, ShieldAlert, ShieldX,
  Globe, TrendingUp, TrendingDown,
  Brain, Zap, AlertTriangle, CheckCircle2, XCircle,
  ChevronDown, Activity,
} from 'lucide-react';
import type { ThesisReport, AgentFinding } from '@/lib/agents/types';

// ─── Agent Role Display Config ────────────────────────────────────────────────

const AGENT_CONFIG = {
  security: {
    label: 'Security Agent',
    sublabel: 'On-chain & Contract Risk',
    icon: ShieldCheck,
    color: 'text-blue-400',
    bg: 'bg-blue-500/10',
    border: 'border-blue-500/20',
    weight: '45%',
  },
  social: {
    label: 'Social Agent',
    sublabel: 'X · YouTube · Telegram',
    icon: Globe,
    color: 'text-purple-400',
    bg: 'bg-purple-500/10',
    border: 'border-purple-500/20',
    weight: '30%',
  },
  economic: {
    label: 'Macro Agent',
    sublabel: 'Price Structure · Order Flow',
    icon: Activity,
    color: 'text-emerald-400',
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/20',
    weight: '25%',
  },
} as const;

// ─── Verdict display ──────────────────────────────────────────────────────────

function VerdictBadge({ verdict, large = false }: { verdict: AgentFinding['verdict']; large?: boolean }) {
  const cfg = {
    BULLISH: { color: 'text-emerald-400', bg: 'bg-emerald-500/15', border: 'border-emerald-500/30', icon: TrendingUp },
    BEARISH: { color: 'text-red-400',     bg: 'bg-red-500/15',     border: 'border-red-500/30',     icon: TrendingDown },
    NEUTRAL: { color: 'text-amber-400',   bg: 'bg-amber-500/15',   border: 'border-amber-500/30',   icon: Activity },
    DANGER:  { color: 'text-red-500',     bg: 'bg-red-500/20',     border: 'border-red-500/50',     icon: AlertTriangle },
  }[verdict];

  const Icon = cfg.icon;
  const size = large ? 'px-3 py-1.5 text-sm' : 'px-2 py-1 text-[11px]';

  return (
    <div className={`inline-flex items-center gap-1.5 rounded-lg border font-black tracking-widest ${cfg.color} ${cfg.bg} ${cfg.border} ${size}`}>
      <Icon className={large ? 'w-4 h-4' : 'w-3 h-3'} />
      {verdict}
    </div>
  );
}

// ─── Agent Card ───────────────────────────────────────────────────────────────

function AgentCard({ finding }: { finding: AgentFinding }) {
  const [expanded, setExpanded] = useState(false);
  const cfg = AGENT_CONFIG[finding.agentRole as keyof typeof AGENT_CONFIG];
  if (!cfg) return null;

  const Icon = cfg.icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-xl border ${cfg.border} ${cfg.bg} overflow-hidden`}
    >
      {/* Card header */}
      <div
        className="flex items-start justify-between p-4 cursor-pointer"
        onClick={() => setExpanded(e => !e)}
      >
        <div className="flex items-start gap-3">
          <div className={`p-2 rounded-lg ${cfg.bg} border ${cfg.border} shrink-0`}>
            <Icon className={`w-4 h-4 ${cfg.color}`} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className={`text-sm font-bold ${cfg.color}`}>{cfg.label}</span>
              <span className="text-[9px] text-gray-600 bg-white/5 px-1.5 py-0.5 rounded font-mono">
                WEIGHT: {cfg.weight}
              </span>
            </div>
            <div className="text-[10px] text-gray-600 mt-0.5">{cfg.sublabel}</div>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <VerdictBadge verdict={finding.verdict} />
          <div className="text-right">
            <div className="text-[9px] text-gray-600 uppercase tracking-wider">Confidence</div>
            <div className={`text-base font-black font-mono ${cfg.color}`}>{finding.confidence}%</div>
          </div>
          <ChevronDown className={`w-4 h-4 text-gray-600 transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </div>
      </div>

      {/* Summary always visible */}
      <div className={`px-4 pb-3 text-xs text-gray-400 leading-relaxed border-t border-white/[0.04] pt-3`}>
        {finding.summary}
      </div>

      {/* Expanded flags & catalysts */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 pt-1 grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Catalysts */}
              {finding.catalysts.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 mb-2">
                    <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                    <span className="text-[9px] font-bold text-emerald-600 uppercase tracking-widest">Catalysts</span>
                  </div>
                  <ul className="space-y-1.5">
                    {finding.catalysts.map((c, i) => (
                      <li key={i} className="flex items-start gap-2 text-[11px] text-gray-400">
                        <span className="text-emerald-600 mt-0.5">→</span>
                        {c}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Flags */}
              {finding.flags.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 mb-2">
                    <XCircle className="w-3 h-3 text-red-500" />
                    <span className="text-[9px] font-bold text-red-600 uppercase tracking-widest">Red Flags</span>
                  </div>
                  <ul className="space-y-1.5">
                    {finding.flags.map((f, i) => (
                      <li key={i} className="flex items-start gap-2 text-[11px] text-gray-400">
                        <span className="text-red-600 mt-0.5">⚠</span>
                        {f}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ─── Final Verdict Banner ─────────────────────────────────────────────────────

function FinalVerdictBanner({ report }: { report: ThesisReport }) {
  const cfg = {
    SAFE:          { bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', color: 'text-emerald-400', icon: CheckCircle2, label: 'SAFE ENTRY' },
    CAUTION:       { bg: 'bg-amber-500/10',   border: 'border-amber-500/30',   color: 'text-amber-400',   icon: AlertTriangle, label: 'PROCEED WITH CAUTION' },
    HIGH_RISK:     { bg: 'bg-red-500/10',     border: 'border-red-500/30',     color: 'text-red-400',     icon: ShieldAlert,   label: 'HIGH RISK' },
    CONFIRMED_RUG: { bg: 'bg-red-500/15',     border: 'border-red-600/50',     color: 'text-red-500',     icon: ShieldX,       label: '⚠ CONFIRMED RUG — AVOID' },
  }[report.finalVerdict];

  const Icon = cfg.icon;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      className={`rounded-xl border p-4 ${cfg.bg} ${cfg.border}`}
    >
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <Icon className={`w-6 h-6 ${cfg.color}`} />
          <div>
            <div className={`text-lg font-black tracking-widest ${cfg.color}`}>{cfg.label}</div>
            <div className="text-xs text-gray-500 mt-0.5">Multi-agent weighted consensus</div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {/* Score gauge */}
          <div className="text-center">
            <div className="text-[9px] text-gray-600 uppercase tracking-widest mb-1">Composite Score</div>
            <div className={`text-4xl font-black font-mono ${cfg.color}`}>{report.finalScore}</div>
            <div className="text-[9px] text-gray-600">/100</div>
          </div>

          {/* Agent votes */}
          {report.debate.agentVerdicts && (
            <div className="hidden sm:flex flex-col gap-1">
              <div className="text-[9px] text-gray-600 uppercase tracking-widest mb-1">Agent Votes</div>
              {Object.entries(report.debate.agentVerdicts).map(([agent, verdict]) => (
                <div key={agent} className="flex items-center gap-2">
                  <span className="text-[9px] text-gray-600 w-16 capitalize">{agent}</span>
                  <VerdictBadge verdict={verdict} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// ─── Adversarial Critique ─────────────────────────────────────────────────────

function AdversarialCritique({ critique }: { critique: string }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-4"
    >
      <div className="flex items-center gap-2 mb-3">
        <Zap className="w-4 h-4 text-amber-500" />
        <span className="text-[10px] font-bold text-amber-500 uppercase tracking-widest">Adversarial Critique — Agent Conflict Detected</span>
      </div>
      <div className="space-y-2">
        {critique.split('\n').filter(Boolean).map((line, i) => (
          <p key={i} className="text-xs text-amber-300/80 leading-relaxed font-mono">{line}</p>
        ))}
      </div>
    </motion.div>
  );
}

// ─── Main Panel ───────────────────────────────────────────────────────────────

interface AgentDebatePanelProps {
  report: ThesisReport;
  compact?: boolean;
}

export function AgentDebatePanel({ report, compact = false }: AgentDebatePanelProps) {
  const primaryFindings = report.agentFindings.filter(
    f => f.agentRole !== 'mediator'
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Brain className="w-5 h-5 text-orange-500" />
        <div>
          <h3 className="text-base font-bold text-white">Multi-Agent Thesis</h3>
          <p className="text-[10px] text-gray-600 mt-0.5">
            {report.agentsSpawned.filter(a => a !== 'mediator').length} agents ran in parallel · {report.analysisMs}ms
          </p>
        </div>
        {report.debate.conflict && (
          <div className="ml-auto flex items-center gap-1.5 px-2 py-1 rounded-lg bg-amber-500/10 border border-amber-500/20">
            <AlertTriangle className="w-3 h-3 text-amber-500" />
            <span className="text-[9px] font-bold text-amber-500 uppercase tracking-widest">Conflict Detected</span>
          </div>
        )}
        {report.debate.unanimousVerdict && (
          <div className="ml-auto flex items-center gap-1.5 px-2 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
            <CheckCircle2 className="w-3 h-3 text-emerald-500" />
            <span className="text-[9px] font-bold text-emerald-500 uppercase tracking-widest">Unanimous Consensus</span>
          </div>
        )}
      </div>

      {/* Final verdict (most prominent) */}
      <FinalVerdictBanner report={report} />

      {/* Adversarial critique (only when conflict) */}
      {report.debate.conflict && report.debate.conflictReason && (
        <AdversarialCritique critique={report.debate.conflictReason} />
      )}

      {/* Agent cards (staggered) */}
      {!compact && (
        <div className="space-y-3">
          <div className="text-[9px] text-gray-600 uppercase tracking-widest font-bold">Independent Agent Verdicts</div>
          {primaryFindings.map((finding, i) => (
            <motion.div
              key={finding.agentRole}
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.1 }}
            >
              <AgentCard finding={finding} />
            </motion.div>
          ))}
        </div>
      )}

      {/* Dev history warning */}
      {report.devHistory.rugCount > 0 && (
        <div className="flex items-start gap-3 p-3 rounded-xl border border-red-500/30 bg-red-500/5">
          <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
          <div>
            <div className="text-xs font-bold text-red-400 mb-0.5">Dev History Warning</div>
            <div className="text-xs text-red-300/70">{report.devHistory.summary}</div>
          </div>
        </div>
      )}
    </div>
  );
}
