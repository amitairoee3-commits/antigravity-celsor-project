/**
 * CELSOR NEXUS — Main Signal Pipeline
 * Orchestrates: Etherscan → Score → AI Narrative → Cache
 * Called by the API route and BullMQ worker.
 */

import { getWhaleTransfers, getMockWhaleTxs, type WhaleTx } from '@/lib/data/etherscan';
import { classifyFromTxns, quickScore } from '@/lib/engine/walletClassifier';
import { scoreTransaction, scoreBatch, type ScoredSignal } from '@/lib/engine/signalScorer';
import { generateSignalNarrative, type SignalInput } from '@/lib/ai/prompts/signalNarrative';
import { pushSignal, getRecentSignals, type CachedSignal } from '@/lib/cache/signalCache';
import { setWallet, getWallet } from '@/lib/cache/walletCache';

// ─── Types ────────────────────────────────────────────────────────────────────

export type Chain = 'eth' | 'arb' | 'base' | 'bsc' | 'op';
export const ALL_CHAINS: Chain[] = ['eth', 'arb', 'base', 'bsc', 'op'];

export interface PipelineResult {
  chain: Chain;
  signalsGenerated: number;
  highConvictionSignals: number;
  errors: string[];
  durationMs: number;
}

// ─── Price proxy (until we wire DexScreener) ─────────────────────────────────

async function getPriceChange1h(tokenSymbol: string, chain: string): Promise<number | undefined> {
  try {
    // Use DexScreener if available, fallback to simulation
    const { getTopMovers } = await import('@/lib/data/dexscreener');
    const movers = await getTopMovers(chain);
    const match = movers.find(m =>
      m.baseToken?.symbol?.toUpperCase() === tokenSymbol.toUpperCase()
    );
    if (match) return parseFloat(match.priceChange?.h1 ?? '0');
  } catch { /* ignore */ }
  return undefined;
}

// ─── Core pipeline ────────────────────────────────────────────────────────────

/**
 * Run the full signal pipeline for a single chain.
 */
export async function runSignalPipeline(chain: Chain): Promise<PipelineResult> {
  const start = Date.now();
  const errors: string[] = [];
  let signalsGenerated = 0;
  let highConvictionSignals = 0;

  try {
    // 1. Fetch whale transactions
    let txns: WhaleTx[];
    try {
      txns = await getWhaleTransfers(chain);
    } catch (e) {
      txns = getMockWhaleTxs(chain);
      errors.push(`Etherscan fetch failed (using mock): ${e}`);
    }

    if (txns.length === 0) {
      return { chain, signalsGenerated: 0, highConvictionSignals: 0, errors, durationMs: Date.now() - start };
    }

    // 2. Score all transactions
    const scoredSignals = scoreBatch(txns, {}, 10);

    // 3. For high-conviction signals, generate AI narratives
    for (const scored of scoredSignals) {
      if (scored.convictionScore < 45) continue; // Skip low-confidence

      try {
        // Check wallet cache first
        let walletClassification = await getWallet(scored.walletAddress, chain);

        if (!walletClassification) {
          // Build wallet classification from available tx data
          const walletTxns = txns.filter(t => t.from === scored.walletAddress);
          const classification = classifyFromTxns(scored.walletAddress, chain, walletTxns);

          await setWallet({
            address: scored.walletAddress,
            chain,
            archetype: classification.archetype,
            convictionScore: classification.convictionScore,
            followWorthiness: classification.followWorthiness,
            tags: classification.tags,
            lastSeenTxHash: scored.txHash,
            lastSeenAt: Date.now(),
            totalVolumeUSD: scored.valueUSD,
            txCount: walletTxns.length,
            addedAt: Date.now(),
          });

          walletClassification = await getWallet(scored.walletAddress, chain);
        }

        // Get price context
        const priceChange1h = await getPriceChange1h(scored.tokenSymbol, chain);

        // Generate AI narrative for high-conviction signals
        let cachedSignal: CachedSignal;

        if (scored.convictionScore >= 65) {
          const narrativeInput: SignalInput = {
            walletAddress: scored.walletAddress,
            chain,
            walletArchetype: walletClassification?.archetype ?? 'Unknown',
            convictionScore: scored.convictionScore,
            tokenSymbol: scored.tokenSymbol,
            tokenName: scored.tokenName,
            txHash: scored.txHash,
            valueUSD: scored.valueUSD,
            priceChange1h,
            anomalyReasons: scored.anomalyReasons,
          };

          const narrative = await generateSignalNarrative(narrativeInput);

          cachedSignal = {
            id: scored.id,
            walletAddress: scored.walletAddress,
            chain,
            tokenSymbol: scored.tokenSymbol,
            direction: narrative.direction,
            convictionScore: narrative.confidenceScore,
            title: narrative.title,
            catalystSummary: narrative.catalystSummary,
            invalidationCriteria: narrative.invalidationCriteria,
            riskRating: narrative.riskRating,
            timeHorizon: narrative.timeHorizon,
            keyTags: narrative.keyTags,
            valueUSD: scored.valueUSD,
            txHash: scored.txHash,
            generatedAt: Date.now(),
          };
        } else {
          // Low conviction — use basic signal without GPT-4o
          cachedSignal = {
            id: scored.id,
            walletAddress: scored.walletAddress,
            chain,
            tokenSymbol: scored.tokenSymbol,
            direction: scored.direction,
            convictionScore: scored.convictionScore,
            title: `${walletClassification?.archetype ?? 'Wallet'} activity in ${scored.tokenSymbol} on ${chain.toUpperCase()}`,
            catalystSummary: scored.anomalyReasons.join('. ') + '.',
            invalidationCriteria: 'Monitor for reversal pattern.',
            riskRating: scored.convictionScore > 70 ? 'LOW' : 'MEDIUM',
            timeHorizon: '4H',
            keyTags: scored.anomalyReasons.slice(0, 3),
            valueUSD: scored.valueUSD,
            txHash: scored.txHash,
            generatedAt: Date.now(),
          };
        }

        await pushSignal(cachedSignal);
        signalsGenerated++;
        if (cachedSignal.convictionScore >= 75) highConvictionSignals++;

      } catch (e) {
        errors.push(`Signal generation failed for ${scored.txHash}: ${e}`);
      }
    }
  } catch (e) {
    errors.push(`Pipeline error for ${chain}: ${e}`);
  }

  return {
    chain,
    signalsGenerated,
    highConvictionSignals,
    errors,
    durationMs: Date.now() - start,
  };
}

/**
 * Run pipeline across all chains in parallel.
 */
export async function runAllChains(): Promise<PipelineResult[]> {
  const results = await Promise.allSettled(
    ALL_CHAINS.map(chain => runSignalPipeline(chain))
  );

  return results.map((result, i) => {
    if (result.status === 'fulfilled') {
      console.log(`[CELSOR] Chain ${result.value.chain} finished: ${result.value.signalsGenerated} signals, ${result.value.errors.length} errors`);
      return result.value;
    }
    console.error(`[CELSOR] Chain pipeline failed: ${result.reason}`);
    return {
      chain: ALL_CHAINS[i],
      signalsGenerated: 0,
      highConvictionSignals: 0,
      errors: [String(result.reason)],
      durationMs: 0,
    };
  });
}

/** Get cached signals from store */
export async function getCachedSignals(count = 50): Promise<CachedSignal[]> {
  return getRecentSignals(count);
}
