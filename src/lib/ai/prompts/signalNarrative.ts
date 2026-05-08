/**
 * CELSOR NEXUS — Signal Narrative Prompt
 * Generates a concise, institutional-quality signal explanation from on-chain data.
 * Output is structured JSON for easy parsing.
 */

import { chat, streamChat, type ChatOptions } from '@/lib/ai/openai';
import type OpenAI from 'openai';

// ─── Input types ──────────────────────────────────────────────────────────────

export interface SignalInput {
  walletAddress: string;
  chain: string;
  walletArchetype: string;        // e.g. "Smart Money", "Whale", "DEX Trader"
  convictionScore: number;        // 0-100
  tokenSymbol: string;
  tokenName: string;
  txHash: string;
  valueUSD: number;
  priceChange1h?: number;
  priceChange24h?: number;
  volumeSpike?: number;           // Multiplier vs average
  anomalyReasons: string[];       // ["4x volume spike", "+18% in 1h"]
  recentWalletActivity?: string;  // Last 3 notable txns as string
  marketCap?: number;
  fdv?: number;
}

// ─── Output type ──────────────────────────────────────────────────────────────

export interface SignalNarrative {
  title: string;               // 1-line headline
  catalystSummary: string;     // 2-3 sentences explaining the signal
  invalidationCriteria: string; // When to exit / what would invalidate this
  direction: 'LONG' | 'SHORT' | 'WATCH';
  riskRating: 'LOW' | 'MEDIUM' | 'HIGH';
  timeHorizon: '1H' | '4H' | '1D' | '1W';
  keyTags: string[];           // ["whale accumulation", "volume anomaly"]
  confidenceScore: number;     // Refined score 0-100
}

// ─── System prompt ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are CELSOR's Institutional Signal Intelligence Engine — an elite quantitative analyst specializing in on-chain forensics and market microstructure.

Your role is to transform raw transaction data into high-fidelity, actionable intelligence for institutional-grade trading desks.

Rules:
- Deep Microstructure: Analyze what the move implies about liquidity, slippage, and order flow.
- Institutional Tone: Use precise financial terminology (e.g., 'asymmetric risk-reward', 'liquidity grab', 'positioning rotation', 'delta-neutral hedging').
- No Clichés: Avoid 'whale accumulation' or 'price spike' unless qualified with data.
- Narrative Depth: The catalystSummary must explain the likely INTENT behind the move and its impact on the local order book.
- Invalidation: Specify precise conditions (time-decay, price-levels) that negate the signal.
- Always output valid JSON matching the exact schema provided.`;

// ─── Generate narrative (non-streaming) ──────────────────────────────────────

export async function generateSignalNarrative(input: SignalInput): Promise<SignalNarrative> {
  const userMessage = buildUserMessage(input);

  const { content } = await chat(
    [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userMessage },
    ],
    { model: 'SIGNAL', responseFormat: 'json', temperature: 0.2, maxTokens: 800 }
  );

  try {
    const parsed = JSON.parse(content) as SignalNarrative;
    // Clamp score
    parsed.confidenceScore = Math.max(0, Math.min(100, parsed.confidenceScore));
    return parsed;
  } catch {
    // Fallback if JSON parse fails
    return buildFallbackNarrative(input);
  }
}

// ─── Stream narrative (for real-time UI) ─────────────────────────────────────

export async function* streamSignalNarrative(
  input: SignalInput
): AsyncGenerator<string> {
  const messages: OpenAI.ChatCompletionMessageParam[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    {
      role: 'user',
      content: `${buildUserMessage(input)}\n\nRespond with a narrative paragraph only (not JSON). Start with the key insight.`,
    },
  ];
  yield* streamChat(messages, { model: 'SIGNAL', temperature: 0.3, maxTokens: 400 });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildUserMessage(input: SignalInput): string {
  return `Analyze this on-chain signal and return a JSON object matching the SignalNarrative schema.

SIGNAL DATA:
- Wallet: ${input.walletAddress} (${input.walletArchetype}) on ${input.chain.toUpperCase()}
- Token: ${input.tokenSymbol} (${input.tokenName})
- Transaction: ${input.txHash}
- Value: $${input.valueUSD.toLocaleString()}
- Conviction Score: ${input.convictionScore}/100
- Price Change 1H: ${input.priceChange1h !== undefined ? `${input.priceChange1h > 0 ? '+' : ''}${input.priceChange1h.toFixed(2)}%` : 'N/A'}
- Price Change 24H: ${input.priceChange24h !== undefined ? `${input.priceChange24h > 0 ? '+' : ''}${input.priceChange24h.toFixed(2)}%` : 'N/A'}
- Volume Spike: ${input.volumeSpike !== undefined ? `${input.volumeSpike.toFixed(1)}x average` : 'N/A'}
- Anomaly Signals: ${input.anomalyReasons.join(', ')}
${input.recentWalletActivity ? `- Recent Wallet Activity: ${input.recentWalletActivity}` : ''}
${input.marketCap ? `- Market Cap: $${(input.marketCap / 1e6).toFixed(1)}M` : ''}

REQUIRED JSON SCHEMA:
{
  "title": "string (max 80 chars)",
  "catalystSummary": "string (2-3 sentences)",
  "invalidationCriteria": "string (1-2 sentences)",
  "direction": "LONG | SHORT | WATCH",
  "riskRating": "LOW | MEDIUM | HIGH",
  "timeHorizon": "1H | 4H | 1D | 1W",
  "keyTags": ["string", "..."],
  "confidenceScore": number
}`;
}

function buildFallbackNarrative(input: SignalInput): SignalNarrative {
  const isUp   = (input.priceChange1h ?? 0) > 0;
  const isDown = (input.priceChange1h ?? 0) < -3;
  const direction = isDown && input.convictionScore > 65 ? 'LONG'   // Buying into weakness = bullish
    : isUp && input.convictionScore > 70 ? 'LONG'                   // Buying breakout confirmation
    : input.convictionScore > 70 ? 'LONG' : 'WATCH';

  const sizeLabel = input.valueUSD >= 1_000_000 ? 'mega-whale (>$1M)' :
    input.valueUSD >= 500_000 ? 'large whale ($500K+)' :
    input.valueUSD >= 200_000 ? 'mid-tier whale ($200K+)' : 'tracked wallet ($100K+)';

  const priceContext = input.priceChange1h !== undefined
    ? `During this transaction, ${input.tokenSymbol} was ${input.priceChange1h > 0 ? `up +${input.priceChange1h.toFixed(1)}%` : `down ${input.priceChange1h.toFixed(1)}%`} in the past hour.`
    : '';

  const intentContext = isDown && input.valueUSD >= 200_000
    ? `Counter-trend accumulation into red candles is a classic institutional entry pattern — not chasing, buying the dip.`
    : isUp && input.valueUSD >= 500_000
    ? `Buying into upward momentum at size confirms the move; this is not retail FOMO — position sizing requires conviction.`
    : `${input.anomalyReasons[0] ?? 'On-chain signal detected'}.`;

  const invalidation = input.priceChange1h !== undefined
    ? `Invalidated if ${input.tokenSymbol} price reverses more than 8% from current level, buy pressure drops below 40%, or volume declines >50% within the next 2 hours.`
    : `Monitor for reversal pattern or significant distribution by the same wallet within 4H.`;

  return {
    title: `${input.walletArchetype} ${direction === 'LONG' ? 'accumulating' : 'monitoring'} ${input.tokenSymbol} on ${input.chain.toUpperCase()} — $${(input.valueUSD / 1000).toFixed(0)}K`,
    catalystSummary: `A ${sizeLabel} classified as "${input.walletArchetype}" moved $${input.valueUSD.toLocaleString()} in ${input.tokenSymbol} on ${input.chain.toUpperCase()}. ${priceContext} ${intentContext}`,
    invalidationCriteria: invalidation,
    direction,
    riskRating: input.convictionScore > 80 ? 'LOW' : input.convictionScore > 60 ? 'MEDIUM' : 'HIGH',
    timeHorizon: input.valueUSD >= 500_000 ? '4H' : '1H',
    keyTags: [sizeLabel.split(' ')[0], ...input.anomalyReasons.slice(0, 2)],
    confidenceScore: input.convictionScore,
  };
}
