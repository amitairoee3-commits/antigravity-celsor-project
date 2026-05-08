/**
 * CELSOR — Multi-Agent Orchestrator v3
 *
 * ARCHITECTURE:
 *   Three independent agents run in PARALLEL — no agent knows the others' verdicts
 *   until all three have completed. This prevents sycophantic convergence.
 *
 *   1. Security Agent (weight: 0.45) — on-chain contract & liquidity risk
 *   2. Social Agent   (weight: 0.30) — narrative, X, YouTube, Telegram intelligence
 *   3. Macro Agent    (weight: 0.25) — price structure, order flow, whale timing
 *
 *   Debate Protocol:
 *   - All three verdict sent to a "Judge" function
 *   - Conflicts are identified (any two agents have opposing verdicts)
 *   - Conflict resolution: DANGER from Security = veto (CONFIRMED_RUG override)
 *   - Otherwise: weighted score decides, with adversarial critique appended
 *
 *   Output: ThesisReport with full agent breakdown + final verdict
 */

import { runSecurityAgent, checkDevHistory } from './securityAgent';
import { runSocialAgent } from './socialAgent';
import { runMacroAgent, type MacroData } from './macroAgent';
import type { AgentFinding, AgentDebate, ThesisReport, AgentRole } from './types';

// ─── Input types ───────────────────────────────────────────────────────────────

export interface OrchestratorInput {
  tokenData: {
    name: string;
    symbol: string;
    address: string;
    chain: string;
    price?: number;
    priceChange1h?: number;
    priceChange24h?: number;
    priceChange7d?: number;
    liquidity?: number;
    marketCap?: number;
    fdv?: number;
    volume24h?: number;
    volumeChange24h?: number;
    pairCreatedAt?: number;
    txns1h?: { buys: number; sells: number };
    txns24h?: { buys: number; sells: number };
    priceHigh24h?: number;
    priceLow24h?: number;
  };
  onChainData: {
    isHoneypot?: boolean;
    cannotSell?: boolean;
    hasProxy?: boolean;
    mintable?: boolean;
    ownerCanRenounce?: boolean;
    creatorHoldPercent?: number;
    lpLockedPercent?: number;
    holderCount?: number;
    topHolders?: Array<{ address: string; percent: number; isLocked: boolean; isContract: boolean; tag?: string }>;
  } | null;
  tavilyResults: Array<{ title: string; content: string; url: string; score?: number }>;
  cgData: {
    twitterFollowers?: number;
    twitterHandle?: string;
    youtubeChannel?: string;
    telegramChannel?: string;
    sentimentUpPct?: number;
    rawDescription?: string;
  };
  whaleTxValueUSD?: number;  // The whale move that triggered analysis
}

// ─── Verdict → numeric mapping ────────────────────────────────────────────────

const VERDICT_TO_SCORE: Record<AgentFinding['verdict'], number> = {
  BULLISH: 80,
  NEUTRAL: 50,
  BEARISH: 25,
  DANGER:   5,
};

// ─── Adversarial Critique ─────────────────────────────────────────────────────
// When agents conflict, we surface the critique rather than silently average

function buildAdversarialCritique(findings: AgentFinding[]): string | undefined {
  const security = findings.find(f => f.agentRole === 'security');
  const social   = findings.find(f => f.agentRole === 'social');
  const macro    = findings.find(f => f.agentRole === 'economic');

  const lines: string[] = [];

  // Security vs Social conflict
  if (security && social) {
    if (security.verdict === 'BULLISH' && social.verdict === 'BEARISH') {
      lines.push('⚔ CONFLICT: Security sees clean contract but Social finds negative sentiment. Possible coordinated FUD or low genuine community interest.');
    }
    if (security.verdict === 'DANGER' && social.verdict === 'BULLISH') {
      lines.push('⚠ CRITICAL: Security flags danger while Social shows hype — classic rug pattern with manufactured FOMO. DO NOT ENTER.');
    }
    if (security.verdict === 'BEARISH' && social.verdict === 'BULLISH') {
      lines.push('⚔ CONFLICT: Contract has red flags but social momentum exists. Likely early-stage project with unresolved risks. Position small if entering.');
    }
  }

  // Security vs Macro conflict
  if (security && macro) {
    if (security.verdict === 'BULLISH' && macro.verdict === 'BEARISH') {
      lines.push('⚔ CONFLICT: Contract is clean but price action is bearish. Smart money may be exiting a structurally safe but poorly performing asset.');
    }
    if (security.verdict === 'DANGER' && macro.verdict === 'BULLISH') {
      lines.push('⚠ MANIPULATION SIGNAL: Security identifies trap while macro looks bullish. Classic setup for exit liquidity dump.');
    }
  }

  // Social vs Macro conflict
  if (social && macro) {
    if (social.verdict === 'BULLISH' && macro.verdict === 'STRONG_BEAR' as any) {
      lines.push('⚔ NARRATIVE vs REALITY: Social sentiment bullish but macro structure is collapsing. Narrative is masking distribution.');
    }
    if (macro.verdict === 'BULLISH' && social.verdict === 'BEARISH') {
      lines.push('⚔ CONFLICT: Market structure is bullish but social sentiment negative — could be a contrarian buy signal or premature bottom call.');
    }
  }

  return lines.length > 0 ? lines.join('\n') : undefined;
}

// ─── Debate Detection ─────────────────────────────────────────────────────────

function buildDebate(
  securityFinding: AgentFinding,
  socialFinding: AgentFinding,
  macroFinding: AgentFinding,
  critique?: string,
): AgentDebate {
  const verdicts = [securityFinding.verdict, socialFinding.verdict, macroFinding.verdict];
  const bullishCount = verdicts.filter(v => v === 'BULLISH').length;
  const bearishCount = verdicts.filter(v => v === 'BEARISH' || v === 'DANGER').length;
  const conflict = bullishCount > 0 && bearishCount > 0;

  return {
    round: 1,
    securityPosition: securityFinding.summary,
    socialPosition:   socialFinding.summary,
    macroPosition:    macroFinding.summary,
    conflict,
    conflictReason: critique ?? (conflict ? 'Agents have divergent assessments — weighted consensus applied' : undefined),
    agentVerdicts: {
      security: securityFinding.verdict,
      social:   socialFinding.verdict,
      macro:    macroFinding.verdict,
    },
    unanimousVerdict: !conflict ? securityFinding.verdict : undefined,
  };
}

// ─── Weighted Consensus Synthesizer ──────────────────────────────────────────

function synthesizeVerdict(findings: AgentFinding[]): {
  verdict: ThesisReport['finalVerdict'];
  score: number;
  summary: string;
} {
  // Security DANGER veto — overrides ALL other agents
  const securityFinding = findings.find(f => f.agentRole === 'security');
  if (securityFinding?.verdict === 'DANGER') {
    return {
      verdict: 'CONFIRMED_RUG',
      score: Math.round(findings.reduce((acc, f) => acc + VERDICT_TO_SCORE[f.verdict] * f.weight, 0) /
                        findings.reduce((acc, f) => acc + f.weight, 0)),
      summary: `SECURITY VETO: ${securityFinding.summary} — all agents overridden.`,
    };
  }

  // Weighted average score
  let totalWeight = 0;
  let weightedScore = 0;
  for (const f of findings) {
    weightedScore += VERDICT_TO_SCORE[f.verdict] * f.weight;
    totalWeight += f.weight;
  }
  const score = Math.round(weightedScore / totalWeight);

  // Also factor in agent confidence as a secondary modifier
  const avgConfidence = findings.reduce((acc, f) => acc + f.confidence, 0) / findings.length;
  const confidenceAdjustment = (avgConfidence - 60) * 0.1; // slight pull toward/away from middle
  const adjustedScore = Math.max(5, Math.min(95, score + confidenceAdjustment));

  // Determine final verdict
  let verdict: ThesisReport['finalVerdict'];
  const hasBearishSecurity = securityFinding?.verdict === 'BEARISH';

  if (adjustedScore >= 68)                                verdict = 'SAFE';
  else if (adjustedScore >= 50 && !hasBearishSecurity)   verdict = 'CAUTION';
  else if (adjustedScore >= 30)                          verdict = 'HIGH_RISK';
  else                                                   verdict = 'CONFIRMED_RUG';

  const summaryMap: Record<ThesisReport['finalVerdict'], string> = {
    SAFE:          `Multi-agent consensus: ${score}/100. All agents aligned on low-risk entry.`,
    CAUTION:       `Mixed agent signals: ${score}/100. Proceed with reduced size and tight stop-loss.`,
    HIGH_RISK:     `Multiple red flags across agents: ${score}/100. Risk/reward unfavorable.`,
    CONFIRMED_RUG: `Critical flags raised: ${score}/100. AVOID — high probability of adverse event.`,
  };

  return {
    verdict,
    score: Math.round(adjustedScore),
    summary: summaryMap[verdict],
  };
}

// ─── Main Orchestrator ────────────────────────────────────────────────────────

export async function runMultiAgentThesis(input: OrchestratorInput): Promise<ThesisReport> {
  const start = Date.now();

  // ── Step 1: Run all 3 agents in PARALLEL (no cross-contamination) ──────────
  const macroData: MacroData = {
    price:          input.tokenData.price,
    priceChange1h:  input.tokenData.priceChange1h,
    priceChange24h: input.tokenData.priceChange24h,
    priceChange7d:  input.tokenData.priceChange7d,
    volume24h:      input.tokenData.volume24h,
    volumeChange24h: input.tokenData.volumeChange24h,
    liquidity:      input.tokenData.liquidity,
    marketCap:      input.tokenData.marketCap,
    fdv:            input.tokenData.fdv,
    pairCreatedAt:  input.tokenData.pairCreatedAt,
    txns1h:         input.tokenData.txns1h,
    txns24h:        input.tokenData.txns24h,
    priceHigh24h:   input.tokenData.priceHigh24h,
    priceLow24h:    input.tokenData.priceLow24h,
    whaleTxValueUSD: input.whaleTxValueUSD,
    tokenSymbol:    input.tokenData.symbol,
  };

  const [securityFinding, socialResult, macroFinding, devHistory] = await Promise.all([
    Promise.resolve(runSecurityAgent(input.onChainData, {
      liquidity:    input.tokenData.liquidity,
      marketCap:    input.tokenData.marketCap,
      pairCreatedAt: input.tokenData.pairCreatedAt,
      txns24h:      input.tokenData.txns24h,
    })),
    Promise.resolve(runSocialAgent(
      input.tavilyResults,
      input.cgData,
      input.tokenData.symbol,
    )),
    Promise.resolve(runMacroAgent(macroData)),
    checkDevHistory(input.tokenData.address, input.tokenData.chain),
  ]);

  const socialFinding = socialResult.finding;
  const socialIntelligence = socialResult.socialIntelligence;

  // ── Step 2: All agents submitted — now run adversarial critique ─────────────
  const allFindings: AgentFinding[] = [securityFinding, socialFinding, macroFinding];
  const agentsSpawned: AgentRole[] = ['security', 'social', 'economic', 'mediator'];

  const critique = buildAdversarialCritique(allFindings);

  // ── Step 3: Build debate report ─────────────────────────────────────────────
  const debate = buildDebate(securityFinding, socialFinding, macroFinding, critique);

  // ── Step 4: Synthesize weighted verdict ─────────────────────────────────────
  const { verdict, score, summary } = synthesizeVerdict(allFindings);

  // ── Step 5: Apply dev history penalty ──────────────────────────────────────
  const devPenalty = devHistory.rugCount > 0 ? Math.min(30, devHistory.rugCount * 15) : 0;
  const finalScore = Math.max(0, score - devPenalty);

  // ── Step 6: Build rich thesis summary ──────────────────────────────────────
  const isComplex = debate.conflict || devHistory.rugCount > 0 || finalScore < 40;

  const agentBreakdown = [
    `🔒 Security [${(securityFinding.weight * 100).toFixed(0)}%]: ${securityFinding.verdict} (${securityFinding.confidence}% confidence) — ${securityFinding.summary}`,
    `📡 Social [${(socialFinding.weight * 100).toFixed(0)}%]: ${socialFinding.verdict} (${socialFinding.confidence}% confidence) — ${socialFinding.summary}`,
    `📊 Macro [${(macroFinding.weight * 100).toFixed(0)}%]: ${macroFinding.verdict} (${macroFinding.confidence}% confidence) — ${macroFinding.summary}`,
  ].join('\n\n');

  const thesisSummary = isComplex
    ? [
        summary,
        '',
        '─── AGENT BREAKDOWN ───',
        agentBreakdown,
        critique ? `\n─── ADVERSARIAL CRITIQUE ───\n${critique}` : '',
        devHistory.rugCount > 0 ? `\n⚠ Dev History: ${devHistory.summary} (-${devPenalty}pts applied)` : '',
      ].filter(Boolean).join('\n')
    : `${summary}\n\n${agentBreakdown}`;

  return {
    tokenSymbol:      input.tokenData.symbol,
    tokenName:        input.tokenData.name,
    tokenAddress:     input.tokenData.address,
    chain:            input.tokenData.chain,
    agentFindings:    allFindings,
    debate,
    agentsSpawned,
    finalVerdict:     verdict,
    finalScore,
    thesisSummary,
    socialIntelligence,
    devHistory,
    fearGreedContribution: Math.min(100, Math.max(0,
      (input.tokenData.priceChange24h ?? 0) * 0.5 +
      socialIntelligence.xScore * 0.3 +
      macroFinding.confidence * 0.2,
    )),
    analysedAt:   Date.now(),
    analysisMs:   Date.now() - start,
  };
}
