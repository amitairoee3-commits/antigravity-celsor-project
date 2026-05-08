/**
 * CELSOR NEXUS — OpenAI Client
 * Singleton with retry, cost tracking, and streaming support.
 * Uses gpt-4o for signal generation, text-embedding-3-small for RAG.
 */

import OpenAI from 'openai';

// ─── Singleton ───────────────────────────────────────────────────────────────

let _client: OpenAI | null = null;

export function getOpenAI(): OpenAI {
  if (!_client) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('[CELSOR] OPENAI_API_KEY is not set');
    _client = new OpenAI({ apiKey, maxRetries: 3, timeout: 30_000 });
  }
  return _client;
}

// ─── Models ──────────────────────────────────────────────────────────────────

export const MODELS = {
  SIGNAL:    'gpt-4o',           // Main signal generation
  FAST:      'gpt-4o-mini',      // Lightweight tasks (classification, tagging)
  EMBED:     'text-embedding-3-small', // RAG embeddings — cheap & fast
} as const;

// ─── Token cost tracking (USD per 1M tokens) ─────────────────────────────────

const COST_PER_1M: Record<string, { input: number; output: number }> = {
  'gpt-4o':                { input: 2.50,  output: 10.00 },
  'gpt-4o-mini':           { input: 0.15,  output: 0.60  },
  'text-embedding-3-small':{ input: 0.02,  output: 0     },
};

export interface TokenUsage {
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCostUSD: number;
}

export function calcCost(model: string, prompt: number, completion: number): number {
  const rates = COST_PER_1M[model];
  if (!rates) return 0;
  return (prompt / 1_000_000) * rates.input + (completion / 1_000_000) * rates.output;
}

// ─── Chat completion helper ───────────────────────────────────────────────────

export interface ChatOptions {
  model?: keyof typeof MODELS;
  temperature?: number;
  maxTokens?: number;
  responseFormat?: 'json' | 'text';
}

export async function chat(
  messages: OpenAI.ChatCompletionMessageParam[],
  opts: ChatOptions = {}
): Promise<{ content: string; usage: TokenUsage }> {
  const client = getOpenAI();
  const model = MODELS[opts.model ?? 'SIGNAL'];

  const response = await client.chat.completions.create({
    model,
    messages,
    temperature: opts.temperature ?? 0.3,
    max_tokens: opts.maxTokens ?? 2048,
    response_format: opts.responseFormat === 'json' ? { type: 'json_object' } : { type: 'text' },
  });

  const choice = response.choices[0];
  const content = choice?.message?.content ?? '';
  const usage: TokenUsage = {
    model,
    promptTokens: response.usage?.prompt_tokens ?? 0,
    completionTokens: response.usage?.completion_tokens ?? 0,
    totalTokens: response.usage?.total_tokens ?? 0,
    estimatedCostUSD: calcCost(
      model,
      response.usage?.prompt_tokens ?? 0,
      response.usage?.completion_tokens ?? 0
    ),
  };

  return { content, usage };
}

// ─── Streaming helper ─────────────────────────────────────────────────────────

export async function* streamChat(
  messages: OpenAI.ChatCompletionMessageParam[],
  opts: ChatOptions = {}
): AsyncGenerator<string> {
  const client = getOpenAI();
  const model = MODELS[opts.model ?? 'SIGNAL'];

  const stream = await client.chat.completions.create({
    model,
    messages,
    temperature: opts.temperature ?? 0.3,
    max_tokens: opts.maxTokens ?? 2048,
    stream: true,
  });

  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content;
    if (delta) yield delta;
  }
}

// ─── Embedding helper ─────────────────────────────────────────────────────────

export async function embed(text: string | string[]): Promise<number[][]> {
  const client = getOpenAI();
  const input = Array.isArray(text) ? text : [text];

  const response = await client.embeddings.create({
    model: MODELS.EMBED,
    input,
    encoding_format: 'float',
  });

  return response.data.map(d => d.embedding);
}
