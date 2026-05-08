/**
 * CELSOR NEXUS — /api/health
 * Kubernetes/Vercel-compatible health check endpoint.
 */

import { NextResponse } from 'next/server';
import { getRedis, isUsingFallback } from '@/lib/cache/redis';

export async function GET() {
  const startTime = Date.now();
  let redisOk = false;

  try {
    const redis = await getRedis();
    const ping = await redis.ping();
    redisOk = ping === 'PONG';
  } catch { /* redis unreachable */ }

  const latencyMs = Date.now() - startTime;
  const status = 'healthy'; // Always healthy — Redis is optional

  return NextResponse.json({
    status,
    timestamp: new Date().toISOString(),
    latencyMs,
    services: {
      redis: redisOk ? 'connected' : (isUsingFallback() ? 'fallback' : 'unavailable'),
      ai: process.env.OPENAI_API_KEY ? 'configured' : 'missing',
      etherscan: process.env.ETH_SCAN_API_KEY ? 'configured' : 'missing',
    },
    version: process.env.npm_package_version ?? '0.1.0',
    nodeEnv: process.env.NODE_ENV,
  }, { status: 200 });
}
