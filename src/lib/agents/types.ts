/**
 * CELSOR — Multi-Agent System Types v3
 *
 * 3-agent parallel architecture:
 *   Security + Social + Macro → Adversarial Debate → Weighted Synthesis
 */

export type AgentRole = 'security' | 'social' | 'economic' | 'mediator';

export interface AgentFinding {
  agentRole: AgentRole;
  confidence: number;       // 0-100 — how certain this agent is
  verdict: 'BULLISH' | 'BEARISH' | 'NEUTRAL' | 'DANGER';
  flags: string[];          // red flags found by this agent
  catalysts: string[];      // positive signals found
  summary: string;          // 1-line agent summary
  weight: number;           // how much this agent's verdict counts (0-1)
}

export interface AgentDebate {
  round: number;
  securityPosition: string;
  socialPosition: string;
  macroPosition?: string;   // NEW: Macro agent always runs now
  conflict: boolean;
  conflictReason?: string;  // adversarial critique when agents disagree
  agentVerdicts?: {
    security: AgentFinding['verdict'];
    social: AgentFinding['verdict'];
    macro: AgentFinding['verdict'];
  };
  unanimousVerdict?: AgentFinding['verdict'];  // set only when all 3 agree
}

export interface ThesisReport {
  tokenSymbol: string;
  tokenName: string;
  tokenAddress: string;
  chain: string;

  // Multi-agent output
  agentFindings: AgentFinding[];
  debate: AgentDebate;
  agentsSpawned: AgentRole[];

  // Final synthesized verdict
  finalVerdict: 'SAFE' | 'CAUTION' | 'HIGH_RISK' | 'CONFIRMED_RUG';
  finalScore: number;       // 0-100 weighted composite (adjusted for dev history)
  thesisSummary: string;    // Full breakdown with adversarial critique

  // Social intelligence
  socialIntelligence: SocialIntelligence;

  // Dev history (penalizes score if known rug deployer)
  devHistory: DevHistory;

  // Market
  fearGreedContribution: number;
  analysedAt: number;
  analysisMs: number;
}

export interface SocialIntelligence {
  // X (Twitter)
  xFollowers: number;
  xEngagementRate: number;
  xSentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  xMentions24h: number;
  xInfluencerMentions: string[];
  xScore: number;

  // YouTube
  ytVideoCount: number;
  ytTotalViews: number;
  ytSentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  ytScore: number;

  // Telegram
  tgMemberCount: number;
  tgMessageVelocity: string;
  tgSentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL' | 'PANIC';
  tgScore: number;

  // Composite
  socialScore: number;
  socialTrend: 'GROWING' | 'STABLE' | 'DECLINING';
  narrativeStrength: 'WEAK' | 'MODERATE' | 'STRONG' | 'VIRAL';
}

export interface DevHistory {
  previousProjects: PreviousProject[];
  rugCount: number;
  successCount: number;
  devRiskScore: number;
  devVerified: boolean;
  devWalletKnown: boolean;
  summary: string;
}

export interface PreviousProject {
  name: string;
  symbol: string;
  outcome: 'RUG' | 'ABANDONED' | 'ACTIVE' | 'SUCCESS';
  date: string;
}
