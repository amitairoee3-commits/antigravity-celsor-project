/**
 * CELSOR — Signal Pipeline v5
 *
 * Flow:
 *   Macro Controller → Etherscan/Mock → Stablecoin Ban → DexScreener Enrichment
 *   → Conviction Scoring + Wallet Reputation Boost → Wallet Classification
 *   → Rule-Based OR GPT-4o Narrative (with RAG wallet history)
 *   → Persist → PnL Tracker opens position → Tick existing positions
 *
 * v5 additions:
 *  - getMacroSnapshot() gates the pipeline: Fear & Greed adjusts minConviction dynamically
 *  - Wallet Reputation boost/penalty applied to conviction score
 *  - getWalletReputationContext() injected into GPT-4o prompt for RAG wallet memory
 *  - openPosition() called after every LONG/SHORT signal at live DexScreener entry price
 *  - tickPositions() runs at the start of each pipeline cycle to close expired/hit positions
 */

import { z } from 'zod';
import { getWhaleTransfers, getMockWhaleTxs, isStablecoin, isMemeOrJunkCoin, type WhaleTx } from '@/lib/data/etherscan';
import { scoreBatch, type SignalScoringContext } from '@/lib/engine/signalScorer';
import { classifyFromTxns, quickScore } from '@/lib/engine/walletClassifier';
import { chat } from '@/lib/ai/openai';
import { persistSignal, type CachedSignal } from '@/lib/db/signalRepository';
import { embedWallet, getWalletRAGContext, type WalletProfile } from '@/lib/ml/walletEmbeddings';
import { cacheGet, cacheSet } from '@/lib/db/redis';
import { batchGetPairData, type DexPairData } from '@/lib/data/dexscreener';
import { getMacroSnapshot } from '@/lib/engine/macroController';
import { openPosition, tickPositions } from '@/lib/engine/pnlTracker';
import { getReputationBoost, getWalletReputationContext, incrementWalletSignalCount } from '@/lib/engine/walletReputation';
import { notifyEliteSignal } from '@/lib/notifications/webhookService';

// ─── Types ─────────────────────────────────────────────────────────────────────

export type Chain = 'eth' | 'arb' | 'base' | 'bsc' | 'op';
export const ALL_CHAINS: Chain[] = ['eth', 'arb', 'base', 'bsc', 'op'];

export interface PipelineResult {
  chain: Chain;
  signalsGenerated: number;
  highConvictionSignals: number;
  errors: string[];
  durationMs: number;
}

// ─── Zod Schema for Structured GPT-4o Output ──────────────────────────────────

const SignalNarrativeSchema = z.object({
  title:               z.string().max(100),
  catalystSummary:     z.string(),
  invalidationCriteria: z.string(),
  tradingVehicle:      z.string(),   // e.g. 'BTCUSDT.P (Futures) 5x' or 'Spot'
  fundingRateWarning:  z.string().optional(), // funding rate caution for perp longs
  direction:           z.enum(['LONG', 'SHORT', 'WATCH']),
  riskRating:          z.enum(['LOW', 'MEDIUM', 'HIGH']),
  timeHorizon:         z.enum(['1H', '4H', '1D', '1W']),
  keyTags:             z.array(z.string()).max(5),
  confidenceScore:     z.number().min(0).max(100),
});

type SignalNarrative = z.infer<typeof SignalNarrativeSchema>;

// ─── System prompt ─────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are CELSOR's Institutional Signal Intelligence Engine — quant-grade on-chain analysis for REAL tradeable assets.

ABSOLUTE RULES:
- NEVER generate signals for stablecoins (USDT/USDC/DAI/BUSD/FRAX/etc): return {"error":"stablecoin_rejected"}
- NEVER generate signals for memecoins (PEPE/DOGE/SHIB/WIF/BONK/FLOKI/BRETT/etc): return {"error":"memecoin_rejected"}
- ONLY analyze: BTC, ETH, SOL, TON, TRX, BIO, LAB, RIVER, POL, ALT, ARB, OP, LINK, AAVE, UNI, MKR, LDO, CRV, GMX, PENDLE, and similar institutional-grade assets.
- Be a SENIOR QUANT ANALYST. Explain specifically WHY LONG or SHORT with data.

catalystSummary REQUIREMENTS (must include ALL of these):
  1. WHAT specific on-chain event happened (wallet type, size in USD, direction)
  2. WHY this matters — is the whale accumulating during weakness (bullish) or distributing into strength (bearish)?
  3. WHAT the order flow says — buy/sell ratio, volume quality
  4. WHAT the price structure confirms or denies
  5. WHAT timeframe this plays out over and why

NEVER write: "A whale bought X of the coin." That is not analysis.
ALWAYS write: specific price levels, specific percentages, specific conditions.

tradingVehicle RULES (MANDATORY — always output this field):
  - High volatility (1h change > 8%) + LONG → use Futures with CONSERVATIVE leverage: e.g. "BTCUSDT.P (Futures) 3x"
  - Low volatility accumulation signal → use "Spot" position
  - Conviction >= 80 + large cap (BTC/ETH) → can suggest up to "5x leverage"
  - NEVER suggest leverage > 5x. NEVER suggest futures for assets with liquidity < $1M.

fundingRateWarning (MANDATORY for any Futures LONG signal):
  - Always add: "⚠️ Check Funding Rate before entry. If Funding Rate > 0.03%, longs are crowded — reduce leverage or avoid. High funding = Long Squeeze risk."
  - For SHORT signals: "⚠️ Verify Open Interest trend. Shorts in downtrend may face squeeze if OI declines rapidly."
  - For SPOT: omit this field or set to null.

invalidationCriteria: Name EXACT price levels or conditions that kill the thesis.
direction: LONG=strong bullish entry thesis. SHORT=strong bearish thesis. WATCH=insufficient evidence.
riskRating: LOW=deep liquidity + institutional wallet + confirmed trend. HIGH=thin market or contradictory signals.
timeHorizon: 1H=momentum scalp. 4H=swing setup. 1D=trend continuation. 1W=accumulation.
confidenceScore: 0-100. Requires: whale size >=\$500K for 70+. Requires: confirmed trend for 80+.
Return ONLY valid JSON. No markdown. No extra text.`;

// ─── Rule-based narrative (fires when no OpenAI key or low conviction) ─────────

function buildRuleNarrative(
  tx: WhaleTx,
  walletArchetype: string,
  convictionScore: number,
  anomalyReasons: string[],
  dexData: DexPairData | null,
): SignalNarrative {
  const sym    = tx.tokenSymbol ?? 'UNKNOWN';
  const chain  = tx.chain.toUpperCase();
  const valK   = Math.round((tx.valueEth) / 1000);

  // Direction from price action
  let direction: 'LONG' | 'SHORT' | 'WATCH' = 'WATCH';
  if (dexData) {
    const p1h  = dexData.priceChange1h ?? 0;
    const p24h = dexData.priceChange24h ?? 0;
    const buys = dexData.txns1h?.buys ?? 0;
    const sells = dexData.txns1h?.sells ?? 0;
    if ((p1h > 3 || (buys > sells * 1.3)) && convictionScore >= 55) direction = 'LONG';
    else if (p1h < -5 && buys < sells * 0.7) direction = 'SHORT';
    else if (convictionScore >= 65) direction = 'LONG'; // whale buying = bullish default
  } else if (convictionScore >= 65) {
    direction = 'LONG';
  }

  // Risk from conviction + liquidity
  let riskRating: 'LOW' | 'MEDIUM' | 'HIGH';
  const liq = dexData?.liquidity ?? 0;
  if (convictionScore >= 82 && liq > 500_000)       riskRating = 'LOW';
  else if (convictionScore >= 62 && liq > 100_000)  riskRating = 'MEDIUM';
  else                                               riskRating = 'HIGH';

  // Time horizon from volatility + conviction
  let timeHorizon: '1H' | '4H' | '1D' | '1W';
  const p1h = dexData?.priceChange1h ?? 0;
  if (Math.abs(p1h) > 15)                      timeHorizon = '1H';  // high volatility = scalp
  else if (convictionScore >= 80)               timeHorizon = '4H';  // strong conviction = swing
  else if (dexData?.marketCap && dexData.marketCap > 50_000_000) timeHorizon = '1D'; // large cap = daily
  else if (tx.valueEth > 1_000_000)             timeHorizon = '1W';  // mega whale = accumulation
  else                                           timeHorizon = '4H';

  // Build catalyst from real data
  const priceLine = dexData
    ? `${sym} is ${dexData.priceChange24h >= 0 ? '+' : ''}${dexData.priceChange24h.toFixed(1)}% (24h), `
      + `${dexData.priceChange1h >= 0 ? '+' : ''}${dexData.priceChange1h.toFixed(1)}% (1h).`
    : `On-chain ${sym} movement detected.`;

  const flowLine = dexData?.txns1h
    ? ` ${dexData.txns1h.buys}B/${dexData.txns1h.sells}S in last 1h (${((dexData.txns1h.buys / Math.max(dexData.txns1h.buys + dexData.txns1h.sells, 1)) * 100).toFixed(0)}% buy pressure).`
    : '';

  const catalystSummary =
    `${walletArchetype} moved $${valK}K in ${sym} on ${chain}. `
    + priceLine + flowLine + ' '
    + (anomalyReasons[0] ?? `$${valK}K ${sym} transaction.`);

  const invalidationCriteria = dexData
    ? `Signal invalidates if price drops below ${(dexData.price * 0.92).toFixed(6)} (−8%), `
      + `volume drops below $${(dexData.volume24h * 0.5 / 1000).toFixed(0)}K/24h, `
      + `or wallet distributes within ${timeHorizon}.`
    : 'Signal invalidates on price reversal >8% or wallet distribution detected within 4 hours.';

  // Tags from real data
  const keyTags: string[] = [walletArchetype.split(' ')[0].toLowerCase()];
  if (dexData?.priceChange1h && dexData.priceChange1h > 5)  keyTags.push('momentum');
  if (dexData?.priceChange1h && dexData.priceChange1h < -10) keyTags.push('dip-buy');
  if (tx.valueEth > 500_000) keyTags.push('mega-whale');
  else if (tx.valueEth > 100_000) keyTags.push('whale');
  if (liq > 1_000_000) keyTags.push('deep-liquidity');
  if (riskRating === 'HIGH') keyTags.push('high-risk');

  // Trading vehicle: infer from asset type, volatility, and conviction
  const isLargeCap = ['BTC', 'ETH', 'SOL', 'BNB', 'TON', 'TRX', 'LINK', 'ARB', 'OP'].includes(sym.toUpperCase());
  const isHighVol = Math.abs(p1h) > 8;
  const maxLeverage = (convictionScore >= 80 && isLargeCap) ? 5 : (convictionScore >= 65 && liq > 1_000_000) ? 3 : 0;
  let tradingVehicle: string;
  let fundingRateWarning: string | undefined;
  if (direction === 'WATCH' || liq < 1_000_000 || maxLeverage === 0) {
    tradingVehicle = `${sym} — Spot (liquidity/conviction too low for leverage)`;
    fundingRateWarning = undefined;
  } else if (isHighVol && direction === 'LONG') {
    tradingVehicle = `${sym}USDT.P (Futures) ${maxLeverage}x — momentum entry`;
    fundingRateWarning = `⚠️ Check Funding Rate before entry. If Funding Rate > 0.03%, longs are crowded — reduce to ${Math.max(1, maxLeverage - 2)}x or await reset. High funding = Long Squeeze risk.`;
  } else if (direction === 'LONG') {
    tradingVehicle = convictionScore >= 75 ? `${sym}USDT.P (Futures) ${maxLeverage}x` : `${sym} — Spot (accumulation phase)`;
    fundingRateWarning = convictionScore >= 75 ? `⚠️ Check Funding Rate before entry. If Funding Rate > 0.03%, longs are crowded — reduce leverage or avoid. High funding = Long Squeeze risk.` : undefined;
  } else if (direction === 'SHORT') {
    tradingVehicle = `${sym}USDT.P (Futures) ${maxLeverage}x SHORT`;
    fundingRateWarning = `⚠️ Verify Open Interest trend. If OI is declining rapidly, avoid shorting — squeeze risk elevated.`;
  } else {
    tradingVehicle = `${sym} — Spot (monitoring)`;
    fundingRateWarning = undefined;
  }

  return {
    title: `${walletArchetype}: ${sym} ${direction === 'LONG' ? 'accumulation' : direction === 'SHORT' ? 'distribution' : 'activity'} on ${chain}`,
    catalystSummary,
    invalidationCriteria,
    tradingVehicle,
    fundingRateWarning,
    direction,
    riskRating,
    timeHorizon,
    keyTags: keyTags.slice(0, 5),
    confidenceScore: convictionScore,
  };
}

// ─── GPT-4o narrative ──────────────────────────────────────────────────────────

async function generateNarrative(
  tx: WhaleTx,
  walletProfile: WalletProfile,
  ragContext: Awaited<ReturnType<typeof getWalletRAGContext>>,
  convictionScore: number,
  anomalyReasons: string[],
  dexData: DexPairData | null,
  reputationContext?: string,
): Promise<SignalNarrative> {
  const sym = tx.tokenSymbol ?? 'UNKNOWN';
  const priceContext = dexData
    ? `LIVE MARKET DATA:
- Price: $${dexData.price}
- 1h change: ${dexData.priceChange1h >= 0 ? '+' : ''}${dexData.priceChange1h.toFixed(2)}%
- 24h change: ${dexData.priceChange24h >= 0 ? '+' : ''}${dexData.priceChange24h.toFixed(2)}%
- 24h Volume: $${(dexData.volume24h / 1000).toFixed(0)}K
- Liquidity: $${(dexData.liquidity / 1000).toFixed(0)}K
- MCap: ${dexData.marketCap ? '$' + (dexData.marketCap / 1_000_000).toFixed(2) + 'M' : 'Unknown'}
- Buy/Sell 1h: ${dexData.txns1h?.buys ?? '?'}B / ${dexData.txns1h?.sells ?? '?'}S`
    : 'MARKET DATA: Not available — use on-chain data only.';

  const userMessage = `SIGNAL DATA:
- Wallet: ${tx.from} (${walletProfile.archetype}) on ${tx.chain.toUpperCase()}
- Token: ${sym} (${tx.tokenName ?? 'Unknown'})
- TX: ${tx.hash}
- Value: $${(tx.valueEth / 1000).toFixed(0)}K USD
- Raw Conviction: ${convictionScore}/100
- Anomalies: ${anomalyReasons.join(', ')}

WALLET INTELLIGENCE:
- Pattern: ${ragContext.behaviorPattern}
- Cluster: ${ragContext.clusterSummary}
- Tags: ${walletProfile.tags.join(', ') || 'None'}
${ragContext.historicalAccuracy !== undefined ? `- Historical Accuracy: ${(ragContext.historicalAccuracy * 100).toFixed(0)}%` : ''}

${priceContext}

WALLET TRACK RECORD (Long-Term Memory):
${reputationContext ?? 'No historical data available for this wallet.'}

Return JSON schema:
{
  "title": "string (max 100 chars)",
  "catalystSummary": "string (2-3 sentences with specific data points)",
  "invalidationCriteria": "string (specific price/volume/time thresholds)",
  "tradingVehicle": "string (e.g. 'BTCUSDT.P (Futures) 5x' or 'BTC — Spot (accumulation phase)')",
  "fundingRateWarning": "string or null (mandatory for Futures LONG/SHORT, null for Spot)",
  "direction": "LONG | SHORT | WATCH",
  "riskRating": "LOW | MEDIUM | HIGH",
  "timeHorizon": "1H | 4H | 1D | 1W",
  "keyTags": ["string"] (max 5),
  "confidenceScore": number (0-100)
}\n\nCRITICAL: tradingVehicle and fundingRateWarning are REQUIRED fields. Do not omit them.`;

  const { content } = await chat(
    [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user',   content: userMessage },
    ],
    { model: 'SIGNAL', responseFormat: 'json', temperature: 0.1, maxTokens: 700 }
  );

  const parsed = JSON.parse(content);
  const result = SignalNarrativeSchema.safeParse(parsed);
  if (result.success) return result.data;

  // Zod failed — use rule narrative
  console.warn('[CELSOR Pipeline] GPT-4o schema mismatch, using rule narrative');
  return buildRuleNarrative(tx, walletProfile.archetype, convictionScore, anomalyReasons, dexData);
}

// ─── Core pipeline per chain ───────────────────────────────────────────────────

export async function runSignalPipeline(chain: Chain): Promise<PipelineResult> {
  const start = Date.now();
  const errors: string[] = [];
  let signalsGenerated = 0;
  let highConvictionSignals = 0;

  try {
    // 0. Tick open positions (close expired/SL/TP) — runs before new signals
    tickPositions().catch(e => errors.push(`PnL tick error: ${(e as Error).message}`));

    // 0b. Get macro snapshot — adjusts conviction threshold for this cycle
    const macroSnapshot = await getMacroSnapshot().catch(() => null);
    const macroMinConviction = macroSnapshot?.minConvictionOverride ?? 45;
    const macroLongBias = macroSnapshot?.longBias ?? 0;
    if (macroSnapshot) {
      console.log(`[CELSOR] Macro: ${macroSnapshot.sentiment} | Mode: ${macroSnapshot.pipelineMode.name} | MinConviction: ${macroMinConviction}`);
    }

    // 1. Fetch transactions
    let txns: WhaleTx[];
    try {
      txns = await getWhaleTransfers(chain);
    } catch (e) {
      txns = getMockWhaleTxs(chain);
      errors.push(`Etherscan fetch failed (mock): ${(e as Error).message}`);
    }

    if (txns.length === 0) {
      return { chain, signalsGenerated: 0, highConvictionSignals: 0, errors, durationMs: Date.now() - start };
    }

    // 2. Hard stablecoin ban
    const nonStableTxns = txns.filter(tx => !isStablecoin(tx.tokenSymbol, tx.contractAddress));
    const filteredCount = txns.length - nonStableTxns.length;
    if (filteredCount > 0) {
      console.log(`[CELSOR] 🚫 Blocked ${filteredCount} stablecoin txns on ${chain}`);
    }

    // 2b. Memecoin ban — memecoins go to Memecoin Hunt, not here
    const realCoinTxns = nonStableTxns.filter(tx => !isMemeOrJunkCoin(tx.tokenSymbol, tx.tokenName));
    const memeFiltered = nonStableTxns.length - realCoinTxns.length;
    if (memeFiltered > 0) {
      console.log(`[CELSOR] 🐸 Blocked ${memeFiltered} memecoin txns on ${chain} (route to Memecoin Hunt)`);
    }
    if (realCoinTxns.length === 0) {
      return { chain, signalsGenerated: 0, highConvictionSignals: 0, errors, durationMs: Date.now() - start };
    }


    // 3. Fetch live DexScreener data for all unique real coins (parallel)
    const uniqueTokens = Array.from(new Map(realCoinTxns.map(tx => [
      `${chain}:${tx.tokenSymbol}`,
      { symbol: tx.tokenSymbol ?? '', address: tx.contractAddress, chain },
    ])).values());

    let dexDataMap = new Map<string, DexPairData>();
    try {
      dexDataMap = await batchGetPairData(uniqueTokens);
    } catch (e) {
      errors.push(`DexScreener batch failed: ${(e as Error).message}`);
    }

    // 4. Build scoring context from live DexScreener data per transaction
    const scoredWithCtx = realCoinTxns.map(tx => {
      const dexKey = `${chain}:${tx.tokenSymbol}`;
      const dex = dexDataMap.get(dexKey);
      const ctx: SignalScoringContext = {
        priceChange1h:       dex?.priceChange1h,
        priceChange24h:      dex?.priceChange24h,
        recentAvgVolumeUSD:  dex ? dex.volume24h / 24 : undefined, // avg hourly vol
        tokenMarketCap:      dex?.marketCap,
        walletConvictionScore: quickScore(tx.from, tx.valueEth, chain),
      };
      return { tx, ctx, dex: dex ?? null };
    });

    // 5. Score all (with live context now!)
    const rawScores = scoredWithCtx
      .map(({ tx, ctx }) => {
        const { scoreTransaction } = require('@/lib/engine/signalScorer');
        return scoreTransaction(tx, ctx);
      })
      .filter(Boolean);

    // Sort by conviction and take top 10
    const scored = rawScores
      .sort((a: any, b: any) => b.convictionScore - a.convictionScore)
      .slice(0, 10);

    // 6. Process each signal
    for (const s of scored) {
      // Use macro-adjusted conviction threshold (Fear & Greed controller)
      if ((s as any).convictionScore < macroMinConviction) continue;
      const { tx: origTx, dex: dexData } = scoredWithCtx.find(
        x => x.tx.hash === (s as any).txHash
      ) ?? { tx: realCoinTxns[0], dex: null };

      try {
        // Wallet profile (cache-first)
        const walletCacheKey = `celsor:wallet:${(s as any).walletAddress}:${chain}`;
        let walletProfile = await cacheGet<WalletProfile>(walletCacheKey);

        if (!walletProfile) {
          const walletTxns = realCoinTxns.filter(t => t.from === (s as any).walletAddress);
          const classification = classifyFromTxns((s as any).walletAddress, chain, walletTxns);

          walletProfile = {
            address:          (s as any).walletAddress,
            chain,
            archetype:        classification.archetype,
            tags:             classification.tags,
            convictionScore:  classification.convictionScore,
            followWorthiness: classification.followWorthiness,
            totalVolumeUsd:   walletTxns.reduce((sum, t) => sum + t.valueEth, 0),
            txCount:          walletTxns.length,
          };

          await cacheSet(walletCacheKey, walletProfile, 3600 * 6);

          // Persist wallet
          try {
            const { createServiceClient } = await import('@/utils/supabase/service');
            const supabase = createServiceClient();
            await supabase.from('wallets').upsert({
              address:          (s as any).walletAddress,
              chain,
              archetype:        classification.archetype,
              conviction_score: classification.convictionScore,
              follow_worthiness: classification.followWorthiness,
              tags:             classification.tags,
              total_volume_usd: walletProfile.totalVolumeUsd,
              tx_count:         walletTxns.length,
              last_seen_tx_hash: (s as any).txHash,
              last_seen_at:     new Date().toISOString(),
            }, { onConflict: 'address,chain' });
          } catch { /* DB not configured */ }

          embedWallet(walletProfile).catch(e =>
            console.warn('[CELSOR] Embedding failed:', e)
          );
        }

        // RAG context (behavioral embedding similarity)
        const ragContext = await getWalletRAGContext(walletProfile);

        // Wallet Reputation boost: legend wallets score higher, serial losers score lower
        const repBoost = await getReputationBoost((s as any).walletAddress, chain);
        const boostedConviction = Math.min(100, Math.max(0, (s as any).convictionScore + repBoost));
        if (repBoost !== 0) {
          console.log(`[CELSOR] Reputation ${repBoost > 0 ? '+' : ''}${repBoost} applied to ${(s as any).walletAddress.slice(0, 10)}... conviction: ${(s as any).convictionScore} → ${boostedConviction}`);
        }

        // Wallet reputation RAG context (long-term memory for GPT-4o)
        const reputationContext = await getWalletReputationContext((s as any).walletAddress, chain);

        // Re-gate after reputation adjustment (legend wallets pass even if score was borderline)
        if (boostedConviction < macroMinConviction - 5) continue; // 5pt grace for rep-boosted signals

        // Narrative: GPT-4o when key available + boosted conviction high enough, else rule-based
        let narrative: SignalNarrative;
        const useGPT = boostedConviction >= 60 && !!process.env.OPENAI_API_KEY;
        if (useGPT) {
          try {
            narrative = await generateNarrative(
              origTx,
              walletProfile,
              ragContext,
              boostedConviction,
              (s as any).anomalyReasons,
              dexData,
              reputationContext,
            );
          } catch (e) {
            errors.push(`GPT narrative failed: ${(e as Error).message}`);
            narrative = buildRuleNarrative(
              origTx, walletProfile.archetype, boostedConviction,
              (s as any).anomalyReasons, dexData,
            );
          }
        } else {
          narrative = buildRuleNarrative(
            origTx, walletProfile.archetype, boostedConviction,
            (s as any).anomalyReasons, dexData,
          );
        }

        // Build final signal
        const signal: CachedSignal = {
          id:                   (s as any).id,
          walletAddress:        (s as any).walletAddress,
          chain,
          tokenSymbol:          (s as any).tokenSymbol,
          tokenName:            (s as any).tokenName,
          txHash:               (s as any).txHash,
          direction:            narrative.direction,
          convictionScore:      narrative.confidenceScore,
          title:                narrative.title,
          catalystSummary:      narrative.catalystSummary,
          invalidationCriteria: narrative.invalidationCriteria,
          tradingVehicle:       (narrative as any).tradingVehicle ?? `${(s as any).tokenSymbol} — Spot`,
          fundingRateWarning:   (narrative as any).fundingRateWarning ?? undefined,
          riskRating:           narrative.riskRating,
          timeHorizon:          narrative.timeHorizon,
          keyTags:              narrative.keyTags,
          valueUSD:             (s as any).valueUSD,
          generatedAt:          Date.now(),
          walletArchetype:      walletProfile.archetype,
        };

        await persistSignal(signal);
        signalsGenerated++;
        if (signal.convictionScore >= 75) highConvictionSignals++;

        console.log(`[CELSOR] ✓ ${signal.direction} ${signal.tokenSymbol} (${chain}) `
          + `score=${signal.convictionScore} risk=${signal.riskRating} horizon=${signal.timeHorizon}`
          + (dexData ? ` price=${dexData.price.toFixed(6)}` : ''));

        // Notify if conviction > 85 (Institutional Tier)
        if (signal.convictionScore > 85) {
          notifyEliteSignal({
            type: 'INSTITUTIONAL',
            title: `🐋 INSTITUTIONAL TIER: ${signal.direction} on ${signal.tokenSymbol}`,
            symbol: signal.tokenSymbol,
            chain: signal.chain,
            convictionScore: signal.convictionScore,
            narrative: signal.catalystSummary,
            address: (s as any).address,
          }).catch(e => console.warn('[CELSOR Webhook] Failed:', e));
        }

        // Open PnL position for every directional signal (async — fire and forget)
        if (signal.direction !== 'WATCH') {
          openPosition({
            signalId:        signal.id,
            tokenSymbol:     signal.tokenSymbol,
            chain:           signal.chain,
            direction:       signal.direction,
            timeHorizon:     signal.timeHorizon,
            convictionScore: signal.convictionScore,
            riskRating:      signal.riskRating,
            walletAddress:   signal.walletAddress,
            walletArchetype: walletProfile.archetype,
          }).catch(e => console.warn('[CELSOR PnL] openPosition failed:', e));
        }

        // Increment wallet signal count for reputation tracking
        incrementWalletSignalCount(signal.walletAddress, chain, walletProfile.archetype)
          .catch(e => console.warn('[CELSOR Reputation] increment failed:', e));

      } catch (e) {
        errors.push(`Signal failed: ${(e as Error).message}`);
      }
    }

    // 7. Log scan
    try {
      const { createServiceClient } = await import('@/utils/supabase/service');
      const supabase = createServiceClient();
      await supabase.from('scan_history').insert({
        chain,
        signals_generated:    signalsGenerated,
        high_conviction_count: highConvictionSignals,
        duration_ms:          Date.now() - start,
        triggered_by:         'pipeline',
        errors,
      });
    } catch { /* DB not configured */ }

  } catch (e) {
    errors.push(`Pipeline error: ${(e as Error).message}`);
  }

  return { chain, signalsGenerated, highConvictionSignals, errors, durationMs: Date.now() - start };
}

// ─── Run all chains ────────────────────────────────────────────────────────────

export async function runAllChains(): Promise<PipelineResult[]> {
  const results = await Promise.allSettled(
    ALL_CHAINS.map(chain => runSignalPipeline(chain))
  );

  return results.map((result, i) => {
    if (result.status === 'fulfilled') {
      const r = result.value;
      console.log(`[CELSOR] Chain ${r.chain}: ${r.signalsGenerated} signals | ${r.highConvictionSignals} HC | ${r.durationMs}ms`);
      return r;
    }
    console.error(`[CELSOR] Chain ${ALL_CHAINS[i]} FAILED:`, result.reason);
    return { chain: ALL_CHAINS[i], signalsGenerated: 0, highConvictionSignals: 0, errors: [String(result.reason)], durationMs: 0 };
  });
}
