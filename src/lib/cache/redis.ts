/**
 * CELSOR — Legacy Redis shim
 * Re-exports from the new @/lib/db/redis location.
 * Keeps backward compatibility with any code still importing from cache/redis.
 */

export {
  getRedis,
  isUsingMemory as isUsingFallback,
  cacheGet,
  cacheSet,
  cacheDel,
  ringPush as ringBufferPush,
  ringGet as ringBufferGet,
  rateLimit,
} from '@/lib/db/redis';
