/**
 * CELSOR NEXUS — /api/ai/analyze
 * Deep AI analysis of a wallet address — generates profile + signal narrative.
 * POST body: { address: string, chain: string }
 */

import { NextRequest, NextResponse } from 'next/server';
import { getWhaleTransfers, getMockWhaleTxs } from '@/lib/data/etherscan';
import { classifyFromTxns } from '@/lib/engine/walletClassifier';
import { scoreBatch } from '@/lib/engine/signalScorer';
import { generateWalletProfile } from '@/lib/ai/prompts/walletProfile';
import { generateSignalNarrative } from '@/lib/ai/prompts/signalNarrative';
import { getWalletProfile, setWalletProfile, getWallet, setWallet } from '@/lib/cache/walletCache';
import { z } from 'zod';

// ─── Validation ───────────────────────────────────────────────────────────────

const AnalyzeSchema = z.object({
  address: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid Ethereum address'),
  chain: z.enum(['eth', 'arb', 'base', 'bsc', 'op']).default('eth'),
  forceRefresh: z.boolean().optional().default(false),
});

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const startTime = Date.now();

  try {
    const body = await req.json();
    const parsed = AnalyzeSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: 'Invalid input', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { address, chain, forceRefresh } = parsed.data;

    // ── Check cache unless forced refresh ─────────────────────────────────
    if (!forceRefresh) {
      const cachedProfile = await getWalletProfile(address, chain);
      const cachedWallet  = await getWallet(address, chain);
      if (cachedProfile && cachedWallet) {
        return NextResponse.json({
          ok: true,
          cached: true,
          address,
          chain,
          wallet: cachedWallet,
          profile: cachedProfile,
          signals: [],
          durationMs: Date.now() - startTime,
        });
      }
    }

    // ── Fetch transactions ─────────────────────────────────────────────────
    let allTxns;
    try {
      allTxns = await getWhaleTransfers(chain);
    } catch {
      allTxns = getMockWhaleTxs(chain);
    }

    // Filter to this wallet (from/to)
    const walletTxns = allTxns.filter(
      t => t.from.toLowerCase() === address.toLowerCase() ||
           t.to.toLowerCase()   === address.toLowerCase()
    );

    // Use all available txns if wallet not in recent history
    const txnsToAnalyze = walletTxns.length > 0 ? walletTxns : allTxns.slice(0, 5);

    // ── Classify wallet ────────────────────────────────────────────────────
    const classification = classifyFromTxns(address, chain, txnsToAnalyze);

    // ── Score transactions ─────────────────────────────────────────────────
    const scoredSignals = scoreBatch(txnsToAnalyze, {
      walletConvictionScore: classification.convictionScore,
    }, 5);

    // ── Build wallet data for AI ───────────────────────────────────────────
    const totalVolume = txnsToAnalyze.reduce((sum, t) => sum + t.valueEth, 0);
    const uniqueTokens = [...new Set(txnsToAnalyze.map(t => t.tokenSymbol).filter(Boolean))];
    const recentTxSummary = txnsToAnalyze.slice(0, 3)
      .map(t => `${t.tokenSymbol ?? 'ETH'} $${t.valueEth.toLocaleString()}`)
      .join(', ');

    // ── Generate AI profile ────────────────────────────────────────────────
    let aiProfile;
    try {
      aiProfile = await generateWalletProfile({
        address,
        chain,
        ageInDays: 180,   // proxy until ENS/age lookup
        totalTxCount: txnsToAnalyze.length,
        largestTxUSD: Math.max(...txnsToAnalyze.map(t => t.valueEth), 0),
        totalVolumeUSD: totalVolume,
        uniqueTokensTraded: uniqueTokens.length,
        topTokens: uniqueTokens.slice(0, 5) as string[],
        recentTxSummary,
        profitability: 'unknown',
        dexActivity: 60,
        bridgeActivity: chain !== 'eth',
      });
    } catch (aiErr: any) {
      console.warn('AI Profile generation failed, using fallback:', aiErr.message);
      aiProfile = {
        archetype: 'DEX Whale',
        behaviorSummary: 'High-volume on-chain participant with frequent token swaps.',
        strengths: ['High liquidity access', 'Fast execution'],
        riskFactors: ['Concentrated positions'],
        followWorthiness: 65,
        tradingStyle: 'Momentum',
        estimatedExpertiseLevel: 'Advanced',
        tags: [chain, 'Whale'],
      };
    }

    // ── Generate AI signal narrative for top signal ────────────────────────
    let topSignalNarrative = null;
    if (scoredSignals[0] && scoredSignals[0].convictionScore >= 40) {
      const top = scoredSignals[0];
      try {
        topSignalNarrative = await generateSignalNarrative({
          walletAddress: address,
          chain,
          walletArchetype: aiProfile.archetype,
          convictionScore: classification.convictionScore,
          tokenSymbol: top.tokenSymbol,
          tokenName: top.tokenName,
          txHash: top.txHash,
          valueUSD: top.valueUSD,
          anomalyReasons: top.anomalyReasons,
        });
      } catch (narrativeErr: any) {
        console.warn('AI Narrative generation failed, using fallback:', narrativeErr.message);
      }
    }

    // ── Cache results ──────────────────────────────────────────────────────
    const walletData = {
      address,
      chain,
      archetype: classification.archetype,
      convictionScore: classification.convictionScore,
      followWorthiness: aiProfile.followWorthiness,
      tags: [...classification.tags, ...aiProfile.tags].slice(0, 8),
      lastSeenAt: Date.now(),
      totalVolumeUSD: totalVolume,
      txCount: txnsToAnalyze.length,
      addedAt: Date.now(),
    };
    await setWallet(walletData);
    await setWalletProfile(address, chain, aiProfile);

    return NextResponse.json({
      ok: true,
      cached: false,
      address,
      chain,
      wallet: walletData,
      profile: aiProfile,
      classification,
      signals: scoredSignals,
      topSignalNarrative,
      durationMs: Date.now() - startTime,
    });
  } catch (error: any) {
    console.error('[/api/ai/analyze] CRITICAL ERROR:', error);
    console.error('Stack:', error?.stack);
    return NextResponse.json(
      { ok: false, error: 'Analysis failed', details: String(error) },
      { status: 500 }
    );
  }
}
