/**
 * CELSOR NEXUS — /api/ai/signal/[id]/narrative
 * Streams a GPT-4o narrative for a specific signal ID.
 * GET /api/ai/signal/:id/narrative
 */

import { NextRequest } from 'next/server';
import { getSignalById } from '@/lib/cache/signalCache';
import { streamSignalNarrative } from '@/lib/ai/prompts/signalNarrative';

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const signal = await getSignalById(params.id);

  if (!signal) {
    return new Response(JSON.stringify({ error: 'Signal not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Stream the narrative back as text/event-stream (SSE)
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const gen = streamSignalNarrative({
          walletAddress: signal.walletAddress,
          chain: signal.chain,
          walletArchetype: 'Smart Money',
          convictionScore: signal.convictionScore,
          tokenSymbol: signal.tokenSymbol,
          tokenName: signal.tokenSymbol,
          txHash: signal.txHash,
          valueUSD: signal.valueUSD,
          anomalyReasons: signal.keyTags,
        });

        for await (const chunk of gen) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: chunk })}\n\n`));
        }
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      } catch (err) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: String(err) })}\n\n`));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
    },
  });
}
