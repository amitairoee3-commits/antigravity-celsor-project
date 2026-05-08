/**
 * CELSOR — Wallet Intelligence Layer
 * 
 * Uses OpenAI text-embedding-3-small to create 1536-dim behavioral vectors
 * for each wallet, enabling:
 *   1. Similarity search ("find wallets like this one")
 *   2. RAG context injection for GPT-4o signal generation
 *   3. Automatic wallet clustering (Smart Money / Insider / MEV / etc.)
 * 
 * Stored in Supabase pgvector when DB is available.
 * Falls back to in-memory cosine similarity search in dev.
 */

import { embed } from '@/lib/ai/openai';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface WalletProfile {
  address: string;
  chain: string;
  archetype: string;
  tags: string[];
  convictionScore: number;
  followWorthiness: number;
  totalVolumeUsd: number;
  txCount: number;
}

export interface SimilarWallet extends WalletProfile {
  similarity: number;
}

export interface WalletEmbeddingContext {
  walletAddress: string;
  chain: string;
  similarWallets: SimilarWallet[];
  clusterSummary: string;
  historicalAccuracy?: number;       // % of past signals that played out
  behaviorPattern: string;           // Human-readable pattern description
}

// ─── In-memory store for embeddings (dev fallback) ────────────────────────────

interface StoredEmbedding {
  address: string;
  chain: string;
  profile: WalletProfile;
  vector: number[];
  storedAt: number;
}

const _embeddingStore = new Map<string, StoredEmbedding>();

// ─── Build embedding text from wallet profile ──────────────────────────────────

function buildWalletEmbeddingText(profile: WalletProfile): string {
  return [
    `Wallet archetype: ${profile.archetype}`,
    `Chain: ${profile.chain.toUpperCase()}`,
    `Conviction score: ${profile.convictionScore}/100`,
    `Follow worthiness: ${profile.followWorthiness}/100`,
    `Tags: ${profile.tags.join(', ')}`,
    `Total volume: $${(profile.totalVolumeUsd / 1_000_000).toFixed(2)}M USD`,
    `Transaction count: ${profile.txCount}`,
  ].join('. ');
}

// ─── Generate and store wallet embedding ──────────────────────────────────────

export async function embedWallet(profile: WalletProfile): Promise<number[]> {
  const text = buildWalletEmbeddingText(profile);
  const key = `${profile.address}:${profile.chain}`;

  try {
    const [vector] = await embed(text);

    // Try to persist to Supabase (pgvector)
    try {
      const { prisma } = await import('@/lib/db/prisma');
      const wallet = await prisma.wallet.findUnique({
        where: { address_chain: { address: profile.address, chain: profile.chain as any } },
      });
      if (wallet) {
        // Store raw via Supabase client (Prisma doesn't support vector write yet natively)
        const { createClient } = await import('@/utils/supabase/server');
        const supabase = createClient();
        await (supabase as any)
          .from('wallets')
          .update({ embedding: `[${vector.join(',')}]` })
          .eq('id', wallet.id);
      }
    } catch {
      // DB not configured — store in memory
    }

    // Always store in memory cache
    _embeddingStore.set(key, {
      address: profile.address,
      chain: profile.chain,
      profile,
      vector,
      storedAt: Date.now(),
    });

    return vector;
  } catch (e) {
    console.warn('[CELSOR Embedding] Failed to embed wallet:', e);
    return [];
  }
}

// ─── Cosine similarity ────────────────────────────────────────────────────────

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

// ─── Find similar wallets ─────────────────────────────────────────────────────

export async function findSimilarWallets(
  profile: WalletProfile,
  topK = 5,
  threshold = 0.75
): Promise<SimilarWallet[]> {
  const text = buildWalletEmbeddingText(profile);

  let queryVector: number[];
  try {
    [queryVector] = await embed(text);
  } catch {
    return [];
  }

  // Try Supabase pgvector first
  try {
    const { createClient } = await import('@/utils/supabase/server');
    const supabase = createClient();
    const { data, error } = await (supabase as any).rpc('find_similar_wallets', {
      query_embedding: `[${queryVector.join(',')}]`,
      match_threshold: threshold,
      match_count: topK,
    });
    if (!error && data?.length > 0) {
      return data.map((w: any) => ({
        address: w.address,
        chain: w.chain,
        archetype: w.archetype,
        convictionScore: w.conviction_score,
        followWorthiness: w.conviction_score,
        tags: w.tags ?? [],
        totalVolumeUsd: 0,
        txCount: 0,
        similarity: w.similarity,
      }));
    }
  } catch { /* fallthrough to in-memory */ }

  // In-memory cosine search
  const results: SimilarWallet[] = [];
  const queryKey = `${profile.address}:${profile.chain}`;

  for (const [key, stored] of _embeddingStore.entries()) {
    if (key === queryKey) continue;
    const sim = cosineSimilarity(queryVector, stored.vector);
    if (sim >= threshold) {
      results.push({ ...stored.profile, similarity: sim });
    }
  }

  return results.sort((a, b) => b.similarity - a.similarity).slice(0, topK);
}

// ─── Get RAG context for a wallet (injected into GPT-4o prompt) ───────────────

export async function getWalletRAGContext(profile: WalletProfile): Promise<WalletEmbeddingContext> {
  const similarWallets = await findSimilarWallets(profile, 3);

  // Determine behavior pattern from archetype + tags
  const behaviorPattern = inferBehaviorPattern(profile);

  // Build cluster summary
  let clusterSummary = '';
  if (similarWallets.length > 0) {
    const archetypes = [...new Set(similarWallets.map(w => w.archetype))];
    const avgSim = (similarWallets.reduce((s, w) => s + w.similarity, 0) / similarWallets.length * 100).toFixed(0);
    clusterSummary = `Wallet clusters with ${archetypes.join(', ')} wallets (avg ${avgSim}% behavioral similarity). `;
    const topSimilar = similarWallets[0];
    if (topSimilar) {
      clusterSummary += `Most similar to ${topSimilar.address.slice(0, 8)}... (${topSimilar.archetype}, conviction ${topSimilar.convictionScore}).`;
    }
  } else {
    clusterSummary = 'Unique behavioral profile — no close historical matches found.';
  }

  return {
    walletAddress: profile.address,
    chain: profile.chain,
    similarWallets,
    clusterSummary,
    behaviorPattern,
  };
}

// ─── Infer behavior pattern from wallet signals ────────────────────────────────

function inferBehaviorPattern(profile: WalletProfile): string {
  const tags = profile.tags.map(t => t.toLowerCase());

  if (tags.some(t => t.includes('mev') || t.includes('sandwich') || t.includes('arbitrage'))) {
    return 'MEV/Arbitrage bot — exploits price inefficiencies across DEXes. High frequency, small margins.';
  }
  if (profile.convictionScore >= 85 && profile.totalVolumeUsd > 10_000_000) {
    return 'Smart money whale — institutional-grade positioning with consistent high-conviction moves.';
  }
  if (tags.some(t => t.includes('insider') || t.includes('early') || t.includes('pre-launch'))) {
    return 'Insider pattern detected — accumulating positions ahead of catalysts. Track closely.';
  }
  if (tags.some(t => t.includes('dca') || t.includes('accumulation'))) {
    return 'Systematic accumulator — consistent DCA pattern suggesting long-term conviction.';
  }
  if (profile.txCount > 1000 && profile.totalVolumeUsd < 1_000_000) {
    return 'Active retail trader — high frequency but smaller position sizes.';
  }
  if (profile.convictionScore >= 70) {
    return 'High-conviction trader — above-average signal quality and portfolio sizing.';
  }
  return 'Standard on-chain participant — monitoring for signal pattern emergence.';
}

// ─── Cluster analysis (batch) ─────────────────────────────────────────────────

export type WalletCluster = 'smart_money' | 'insider' | 'mev_bot' | 'whale' | 'dca_accumulator' | 'retail' | 'unknown';

export function classifyWalletCluster(profile: WalletProfile): WalletCluster {
  const tags = profile.tags.map(t => t.toLowerCase());

  if (tags.some(t => t.includes('mev') || t.includes('sandwich'))) return 'mev_bot';
  if (tags.some(t => t.includes('insider') || t.includes('early'))) return 'insider';
  if (profile.convictionScore >= 85 && profile.totalVolumeUsd > 10_000_000) return 'smart_money';
  if (profile.totalVolumeUsd > 50_000_000) return 'whale';
  if (tags.some(t => t.includes('dca') || t.includes('accumulation'))) return 'dca_accumulator';
  if (profile.txCount > 500) return 'retail';
  return 'unknown';
}
