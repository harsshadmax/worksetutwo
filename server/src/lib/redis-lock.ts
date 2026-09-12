// src/lib/redis-lock.ts
import Redis from "ioredis";

export const redis = new Redis(process.env.REDIS_URL as string);

const LOCK_TTL_MS = 5000;

// Phase-13 finding: unlike the cache (lib/cache.ts) and rate limiter
// (middleware/rate-limit.ts), a booking-accept lock is correctness-
// critical — it exists specifically to prevent a double-assignment race
// (Section 11.2), so a Redis outage here must not "fail open" and let the
// accept proceed unprotected. But an unwrapped ioredis call can queue and
// retry against an unreachable Redis for up to ~40s before rejecting
// (same root cause fixed elsewhere this phase), which turns "dispatch
// pauses while Redis is down" (Section 3.3 rule 1) into "the accept
// request hangs for tens of seconds" instead of failing fast and
// visibly. Bounding it makes the failure prompt and honest — the caller
// (dispatch.controller.ts) already turns an unhandled rejection here into
// a normal 500 error envelope, never a silent success.
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([promise, new Promise<T>((_, reject) => setTimeout(() => reject(new Error("redis lock timeout")), ms))]);
}

/**
 * Attempts to acquire an exclusive lock on a booking for a specific worker.
 * Mirrors: SET lock:booking:<id> <worker_id> NX PX 5000
 */
export async function acquireBookingLock(bookingId: string, workerId: string): Promise<boolean> {
  const key = `lock:booking:${bookingId}`;
  const result = await withTimeout(redis.set(key, workerId, "PX", LOCK_TTL_MS, "NX"), 3000);
  return result === "OK";
}

export async function releaseBookingLock(bookingId: string, workerId: string): Promise<void> {
  // Lua script ensures a worker can only release a lock it holds (compare-and-delete)
  const script = `
    if redis.call("GET", KEYS[1]) == ARGV[1] then
      return redis.call("DEL", KEYS[1])
    else
      return 0
    end
  `;
  await withTimeout(redis.eval(script, 1, `lock:booking:${bookingId}`, workerId), 3000);
}

export async function getBookingLockHolder(bookingId: string): Promise<string | null> {
  return withTimeout(redis.get(`lock:booking:${bookingId}`), 3000);
}
