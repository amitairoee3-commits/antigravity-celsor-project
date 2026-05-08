/**
 * CELSOR — Upstash Redis Client
 * Uses @upstash/redis which is HTTP-based (serverless-safe, no TCP connection issues).
 * Falls back to in-memory store when UPSTASH_REDIS_REST_URL is not set.
 */

// ─── In-Memory Fallback (dev without Upstash) ─────────────────────────────────
class InMemoryStore {
  private store = new Map<string, { value: string; expiresAt?: number }>();
  private lists = new Map<string, string[]>();

  async get(key: string): Promise<string | null> {
    const item = this.store.get(key);
    if (!item) return null;
    if (item.expiresAt && Date.now() > item.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return item.value;
  }

  async set(key: string, value: string, opts?: { ex?: number }): Promise<'OK'> {
    const expiresAt = opts?.ex ? Date.now() + opts.ex * 1000 : undefined;
    this.store.set(key, { value, expiresAt });
    return 'OK';
  }

  async setex(key: string, seconds: number, value: string): Promise<'OK'> {
    return this.set(key, value, { ex: seconds });
  }

  async del(...keys: string[]): Promise<number> {
    let n = 0;
    for (const k of keys) {
      if (this.store.delete(k) || this.lists.delete(k)) n++;
    }
    return n;
  }

  async incr(key: string): Promise<number> {
    const v = parseInt((await this.get(key)) ?? '0') + 1;
    await this.set(key, String(v));
    return v;
  }

  async expire(key: string, seconds: number): Promise<number> {
    const item = this.store.get(key);
    if (!item) return 0;
    item.expiresAt = Date.now() + seconds * 1000;
    return 1;
  }

  async lpush(key: string, ...values: string[]): Promise<number> {
    const arr = this.lists.get(key) ?? [];
    arr.unshift(...values);
    this.lists.set(key, arr);
    return arr.length;
  }

  async lrange(key: string, start: number, stop: number): Promise<string[]> {
    const arr = this.lists.get(key) ?? [];
    return arr.slice(start, stop === -1 ? undefined : stop + 1);
  }

  async ltrim(key: string, start: number, stop: number): Promise<'OK'> {
    const arr = this.lists.get(key) ?? [];
    this.lists.set(key, arr.slice(start, stop + 1));
    return 'OK';
  }

  async ping(): Promise<string> { return 'PONG'; }
  isMemory = true;
}

// ─── Type interface ────────────────────────────────────────────────────────────
type RedisLike = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, opts?: { ex?: number }): Promise<'OK'>;
  setex(key: string, seconds: number, value: string): Promise<'OK'>;
  del(...keys: string[]): Promise<number>;
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<number>;
  lpush(key: string, ...values: string[]): Promise<number>;
  lrange(key: string, start: number, stop: number): Promise<string[]>;
  ltrim(key: string, start: number, stop: number): Promise<'OK'>;
  ping(): Promise<string>;
  isMemory?: boolean;
};

// ─── Singleton ────────────────────────────────────────────────────────────────
let _client: RedisLike | null = null;

export async function getRedis(): Promise<RedisLike> {
  if (_client) return _client;

  const restUrl = process.env.UPSTASH_REDIS_REST_URL;
  const restToken = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (restUrl && restToken && !restUrl.includes('placeholder')) {
    try {
      const { Redis } = await import('@upstash/redis');
      const client = new Redis({ url: restUrl, token: restToken });
      await client.ping();
      console.log('[CELSOR] Upstash Redis connected ✓');
      _client = client as unknown as RedisLike;
      return _client;
    } catch (e) {
      console.warn('[CELSOR] Upstash Redis failed, using in-memory store:', e);
    }
  } else {
    console.warn('[CELSOR] UPSTASH_REDIS_REST_URL not set — using in-memory store');
  }

  _client = new InMemoryStore();
  return _client;
}

export function isUsingMemory(): boolean {
  return (_client as any)?.isMemory === true;
}

// ─── High-level helpers ────────────────────────────────────────────────────────

export async function cacheGet<T>(key: string): Promise<T | null> {
  const r = await getRedis();
  const raw = await r.get(key);
  if (!raw) return null;
  try { return JSON.parse(raw) as T; } catch { return null; }
}

export async function cacheSet<T>(key: string, value: T, ttlSeconds = 300): Promise<void> {
  const r = await getRedis();
  await r.setex(key, ttlSeconds, JSON.stringify(value));
}

export async function cacheDel(key: string): Promise<void> {
  const r = await getRedis();
  await r.del(key);
}

/** Push to a ring buffer (e.g. signal feed) */
export async function ringPush(key: string, value: unknown, maxLen = 200): Promise<void> {
  const r = await getRedis();
  await r.lpush(key, JSON.stringify(value));
  await r.ltrim(key, 0, maxLen - 1);
}

export async function ringGet<T>(key: string, count = 50): Promise<T[]> {
  const r = await getRedis();
  const items = await r.lrange(key, 0, count - 1);
  return items
    .map(i => { try { return JSON.parse(i) as T; } catch { return null; } })
    .filter(Boolean) as T[];
}

/** Rate limit check — returns remaining requests */
export async function rateLimit(key: string, maxPerWindow: number, windowSeconds: number): Promise<{ allowed: boolean; remaining: number }> {
  const r = await getRedis();
  const current = await r.incr(key);
  if (current === 1) await r.expire(key, windowSeconds);
  const remaining = Math.max(0, maxPerWindow - current);
  return { allowed: current <= maxPerWindow, remaining };
}
