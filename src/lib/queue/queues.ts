/**
 * CELSOR NEXUS — BullMQ Queue Definitions
 * Defines all background job queues with their types.
 * Workers are started by the custom server (server.ts).
 */

import { Queue, type ConnectionOptions } from 'bullmq';

// ─── Connection config ────────────────────────────────────────────────────────

function getRedisConnection(): ConnectionOptions | null {
  const url = process.env.REDIS_URL ?? process.env.UPSTASH_REDIS_URL;
  if (!url || url === 'redis://localhost:6379') {
    // Try localhost
    return { host: 'localhost', port: 6379 };
  }
  // Parse URL
  try {
    const parsed = new URL(url);
    return {
      host: parsed.hostname,
      port: parseInt(parsed.port || '6379'),
      password: parsed.password || undefined,
      tls: url.startsWith('rediss://') ? {} : undefined,
    };
  } catch {
    return { host: 'localhost', port: 6379 };
  }
}

// ─── Job type definitions ─────────────────────────────────────────────────────

export interface ScanJobData {
  chain: 'eth' | 'arb' | 'base' | 'bsc' | 'op' | 'all';
  triggeredBy?: 'cron' | 'manual' | 'api';
}

export interface SignalJobData {
  signalId: string;
  walletAddress: string;
  chain: string;
  txHash: string;
  tokenSymbol: string;
  valueUSD: number;
  convictionScore: number;
  anomalyReasons: string[];
}

export interface AlertJobData {
  signalId: string;
  userId?: string;        // null = broadcast to all subscribers
  walletAddress: string;
  tokenSymbol: string;
  direction: 'LONG' | 'SHORT' | 'WATCH';
  convictionScore: number;
  title: string;
  catalystSummary: string;
}

// ─── Queue instances ──────────────────────────────────────────────────────────

let _scanQueue: Queue<ScanJobData> | null = null;
let _signalQueue: Queue<SignalJobData> | null = null;
let _alertQueue: Queue<AlertJobData> | null = null;

function createQueue<T extends object>(name: string): Queue<T> | null {
  // Force returning null to bypass BullMQ and run pipelines directly 
  // since we disabled Redis in the cache layer.
  return null;
}

export function getScanQueue(): Queue<ScanJobData> | null {
  if (!_scanQueue) _scanQueue = createQueue<ScanJobData>('celsor:scan');
  return _scanQueue;
}

export function getSignalQueue(): Queue<SignalJobData> | null {
  if (!_signalQueue) _signalQueue = createQueue<SignalJobData>('celsor:signals');
  return _signalQueue;
}

export function getAlertQueue(): Queue<AlertJobData> | null {
  if (!_alertQueue) _alertQueue = createQueue<AlertJobData>('celsor:alerts');
  return _alertQueue;
}

// ─── Job producers ────────────────────────────────────────────────────────────

/**
 * Enqueue a chain scan job.
 * Falls back to direct pipeline execution if Redis unavailable.
 */
export async function enqueueScan(
  chain: ScanJobData['chain'] = 'all',
  triggeredBy: ScanJobData['triggeredBy'] = 'api'
): Promise<string | 'direct'> {
  const queue = getScanQueue();
  if (!queue) {
    // No Redis — run directly
    console.log('[CELSOR] No Redis — running scan directly');
    const { runAllChains, runSignalPipeline } = await import('@/lib/engine/signalPipeline');
    if (chain === 'all') runAllChains().catch(console.error);
    else runSignalPipeline(chain).catch(console.error);
    return 'direct';
  }

  const job = await queue.add(`scan:${chain}`, { chain, triggeredBy }, {
    jobId: `scan:${chain}:${Date.now()}`,
  });
  return job.id ?? 'queued';
}

/**
 * Enqueue an alert dispatch job.
 */
export async function enqueueAlert(data: AlertJobData): Promise<void> {
  const queue = getAlertQueue();
  if (!queue) {
    // No Redis — log to console for now
    console.log('[CELSOR] Alert (no queue):', data.title);
    return;
  }
  await queue.add('dispatch-alert', data);
}
