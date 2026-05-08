/**
 * CELSOR NEXUS — Wallet Profile Prompt
 * Generates a behavioral archetype profile for a wallet address using GPT-4o.
 */

import { chat } from '@/lib/ai/openai';

export interface WalletProfileInput {
  address: string;
  chain: string;
  ageInDays: number;
  totalTxCount: number;
  largestTxUSD: number;
  totalVolumeUSD: number;
  uniqueTokensTraded: number;
  topTokens: string[];
  recentTxSummary: string;
  profitability?: 'positive' | 'negative' | 'unknown';
  dexActivity?: number;
  bridgeActivity?: boolean;
}

export interface WalletProfile {
  archetype: string;
  behaviorSummary: string;
  strengths: string[];
  riskFactors: string[];
  followWorthiness: number;   // 0-100
  tradingStyle: string;
  estimatedExpertiseLevel: 'Novice' | 'Intermediate' | 'Advanced' | 'Institutional';
  tags: string[];
}

const SYSTEM_PROMPT = `You are CELSOR's Senior Behavioral Forensics Analyst. 
Profile crypto wallets based on multi-chain historical patterns. 
Categorize behavior using institutional terminology (e.g., 'MEV Arbitrageur', 'LP Optimizer', 'Early-Stage Accumulator', 'Governance Voter').
Focus on 'intent' and 'sophistication' rather than just volume.
Output valid JSON only.`;

export async function generateWalletProfile(input: WalletProfileInput): Promise<WalletProfile> {
  const userMessage = `Profile this wallet. Return valid JSON.

ADDRESS: ${input.address} on ${input.chain.toUpperCase()}
AGE: ${input.ageInDays}d | TXS: ${input.totalTxCount} | LARGEST TX: $${input.largestTxUSD.toLocaleString()}
VOLUME 30d: $${input.totalVolumeUSD.toLocaleString()} | TOKENS TRADED: ${input.uniqueTokensTraded}
TOP TOKENS: ${input.topTokens.join(', ')}
RECENT: ${input.recentTxSummary}
DEX ACTIVITY: ${input.dexActivity ?? 'unknown'}% | BRIDGES: ${input.bridgeActivity ? 'Yes' : 'No'}

SCHEMA: { "archetype": str, "behaviorSummary": str, "strengths": [str], "riskFactors": [str], "followWorthiness": num, "tradingStyle": str, "estimatedExpertiseLevel": "Novice|Intermediate|Advanced|Institutional", "tags": [str] }`;

  const { content } = await chat(
    [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: userMessage }],
    { model: 'SIGNAL', responseFormat: 'json', temperature: 0.2, maxTokens: 500 }
  );

  try {
    const parsed = JSON.parse(content) as WalletProfile;
    parsed.followWorthiness = Math.max(0, Math.min(100, parsed.followWorthiness));
    return parsed;
  } catch {
    return {
      archetype: 'Unknown',
      behaviorSummary: `Wallet ${input.address.slice(0, 8)}... on ${input.chain.toUpperCase()} — ${input.totalTxCount} txns.`,
      strengths: [],
      riskFactors: ['Insufficient data'],
      followWorthiness: 30,
      tradingStyle: 'Unknown',
      estimatedExpertiseLevel: 'Novice',
      tags: [input.chain],
    };
  }
}
