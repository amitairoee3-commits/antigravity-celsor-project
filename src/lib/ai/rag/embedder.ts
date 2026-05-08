/**
 * CELSOR NEXUS — RAG Embedder
 * Generates embeddings for signal narratives using text-embedding-3-small.
 */

import { embed } from '@/lib/ai/openai';

export interface EmbeddedSignal {
  id: string;
  text: string;
  embedding: number[];
  metadata: {
    walletAddress: string;
    chain: string;
    tokenSymbol: string;
    convictionScore: number;
    timestamp: number;
  };
}

// In-memory vector store for demo (replace with pgvector in Supabase later)
let vectorStore: EmbeddedSignal[] = [];

/**
 * Creates an embedding for a signal and adds it to the vector store.
 */
export async function indexSignal(
  id: string,
  summary: string,
  metadata: EmbeddedSignal['metadata']
): Promise<void> {
  const embedding = await embed(summary);
  
  vectorStore.push({
    id,
    text: summary,
    embedding: embedding[0],
    metadata
  });
  
  console.log(`[RAG] Indexed signal ${id} into vector store.`);
}

/**
 * Calculates cosine similarity between two vectors.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Performs a vector search over the indexed signals.
 */
export async function searchSignals(query: string, limit = 5): Promise<EmbeddedSignal[]> {
  const queryEmbedding = await embed(query);
  const qVec = queryEmbedding[0];
  
  const results = vectorStore.map(doc => ({
    doc,
    similarity: cosineSimilarity(qVec, doc.embedding)
  }));
  
  results.sort((a, b) => b.similarity - a.similarity);
  
  return results.slice(0, limit).map(r => r.doc);
}
