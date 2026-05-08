/**
 * CELSOR — Legacy signalCache shim
 * Re-exports from the new @/lib/db/signalRepository location.
 */

export type { CachedSignal } from '@/lib/db/signalRepository';
export {
  persistSignal as pushSignal,
  getRecentSignals,
  getHighConvictionSignals,
  getSignalsByChain,
  getSignalById,
} from '@/lib/db/signalRepository';
