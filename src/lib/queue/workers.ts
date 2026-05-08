/**
 * CELSOR NEXUS — BullMQ Workers
 * Processes background jobs for scanning, signaling, and alerts.
 */

import { Worker, type Job } from 'bullmq';
import { getScanQueue, getSignalQueue, getAlertQueue, type ScanJobData, type SignalJobData, type AlertJobData } from './queues';
import { runSignalPipeline, runAllChains } from '@/lib/engine/signalPipeline';

// Helper to get Redis connection options
function getRedisConnection() {
  const url = process.env.REDIS_URL ?? process.env.UPSTASH_REDIS_URL;
  if (!url || url === 'redis://localhost:6379') return { host: 'localhost', port: 6379 };
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

let _scanWorker: Worker | null = null;
let _alertWorker: Worker | null = null;

export function startWorkers() {
  const connection = getRedisConnection();
  
  if (_scanWorker || _alertWorker) return; // Already started

  console.log('[CELSOR] Starting background workers...');

  // ─── Scan Worker ────────────────────────────────────────────────────────────
  _scanWorker = new Worker<ScanJobData>('celsor:scan', async (job) => {
    console.log(`[Worker:Scan] Starting job ${job.id} for chain: ${job.data.chain}`);
    const start = Date.now();
    
    if (job.data.chain === 'all') {
      await runAllChains();
    } else {
      await runSignalPipeline(job.data.chain as any);
    }
    
    console.log(`[Worker:Scan] Job ${job.id} completed in ${Date.now() - start}ms`);
  }, { connection, concurrency: 2 });

  _scanWorker.on('failed', (job, err) => {
    console.error(`[Worker:Scan] Job ${job?.id} failed:`, err);
  });

  // ─── Alert Worker ───────────────────────────────────────────────────────────
  _alertWorker = new Worker<AlertJobData>('celsor:alerts', async (job) => {
    console.log(`[Worker:Alert] Dispatching alert for signal ${job.data.signalId} (${job.data.tokenSymbol})`);
    
    // In production, this would call Resend API for emails and Web-Push for push notifications
    // Mock dispatch for now
    await new Promise(resolve => setTimeout(resolve, 500));
    console.log(`[Worker:Alert] Alert dispatched successfully`);
  }, { connection, concurrency: 5 });

  _alertWorker.on('failed', (job, err) => {
    console.error(`[Worker:Alert] Job ${job?.id} failed:`, err);
  });
}

export async function stopWorkers() {
  if (_scanWorker) await _scanWorker.close();
  if (_alertWorker) await _alertWorker.close();
  _scanWorker = null;
  _alertWorker = null;
}
