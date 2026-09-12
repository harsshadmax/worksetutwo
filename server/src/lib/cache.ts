import { redis } from "./redis-lock";

// Phase-13 finding: ioredis's default retry behavior on a refused/
// unreachable connection (maxRetriesPerRequest: 20, backoff up to 2s per
// attempt) means an unwrapped `await redis.get(...)` can take up to ~40s
// to finally reject during a real Redis outage — the try/catch below was
// always correct about *what* happens on failure, but not about *how
// fast*. A cached-read endpoint hanging for tens of seconds during a
// Redis outage is not the "degrades to a live compute" behavior Section
// 3.3 rule 1 promises; every Redis call here races a short timeout so the
// fallback kicks in quickly regardless of ioredis's own retry pacing.
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([promise, new Promise<T>((_, reject) => setTimeout(() => reject(new Error("redis timeout")), ms))]);
}

// Section 24.3 — Redis caches: service catalog, platform stats (TTL
// 300s), platform config (TTL 60s, wired when PHASE 11 builds
// GET/PATCH /admin/config). Failure to reach Redis degrades to a live
// compute rather than failing the request (Section 3.3 rule 1).
export async function getOrSetCache<T>(key: string, ttlSeconds: number, compute: () => Promise<T>): Promise<T> {
  try {
    const cached = await withTimeout(redis.get(key), 1000);
    if (cached !== null) return JSON.parse(cached) as T;
  } catch {
    // Redis unreachable or too slow to answer — fall through to a live compute.
  }

  const value = await compute();

  withTimeout(redis.set(key, JSON.stringify(value), "EX", ttlSeconds), 1000).catch(() => {
    // Best-effort; a failed or slow cache write never fails the request,
    // and is not awaited past the timeout above.
  });

  return value;
}

export async function invalidateCache(key: string): Promise<void> {
  await withTimeout(redis.del(key), 1000).catch(() => {});
}
