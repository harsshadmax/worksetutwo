import { Request, Response, NextFunction } from "express";
import { RateLimiterRedis, RateLimiterRes } from "rate-limiter-flexible";
import { AppError } from "../utils/app-error";
import { AuthenticatedRequest } from "./auth";
import { redis } from "../lib/redis-lock";
import { log } from "../lib/logger";

// Section 4.10's storage backend, now Redis-backed (Section 28 PHASE 7:
// "rate-limiter store (4.10)") — same .consume() interface the in-memory
// version used through PHASE 4-6, just swapping RateLimiterMemory for
// RateLimiterRedis on the shared connection from lib/redis-lock.ts.
// Distinct keyPrefixes keep the four buckets from colliding on one
// connection (previously unnecessary — each in-memory instance was its
// own isolated store).

function makeLimiter(keyPrefix: string, points: number, durationSeconds: number): RateLimiterRedis {
  return new RateLimiterRedis({ storeClient: redis, keyPrefix, points, duration: durationSeconds });
}

const loginLimiter = makeLimiter("rl:login", 10, 15 * 60); // 10 / 15 min per IP+identifier
const registerLimiter = makeLimiter("rl:register", 5, 60 * 60); // 5 / hour per IP
const authenticatedGenericLimiter = makeLimiter("rl:auth", 300, 5 * 60); // 300 / 5 min per user
const publicGenericLimiter = makeLimiter("rl:public", 100, 5 * 60); // 100 / 5 min per IP
const locationPingLimiter = makeLimiter("rl:location-ping", 1, 5); // 1 / 5s per worker
const walletRedeemLimiter = makeLimiter("rl:wallet-redeem", 5, 24 * 60 * 60); // 5 / day per worker
const reviewLimiter = makeLimiter("rl:review", 30, 24 * 60 * 60); // 30 / day per customer (abuse ceiling; 1/booking is schema-enforced)

const STORE_TIMEOUT_SYMBOL = Symbol("rate-limiter-store-timeout");

// Phase-13 finding: RateLimiterRedis.consume() sits on top of ioredis,
// which by default queues and retries a command against an unreachable
// Redis for up to ~40s (maxRetriesPerRequest, with backoff) before it
// finally rejects. The catch block below was always correct about
// degrading to fail-open on a genuine store error — but without a bound
// on how long that takes, every request behind a rate limiter (which is
// nearly every route) hangs for tens of seconds during a real Redis
// outage instead of failing open promptly, which is a de facto full
// outage of the API, not the graceful degrade Section 3.3 rule 1 calls
// for.
function consumeOrReject(limiter: RateLimiterRedis, key: string, res: Response, next: NextFunction) {
  Promise.race([
    limiter.consume(key),
    new Promise((_, reject) => setTimeout(() => reject(STORE_TIMEOUT_SYMBOL), 1000))
  ])
    .then(() => next())
    .catch((rej: unknown) => {
      if (rej instanceof RateLimiterRes) {
        res.setHeader("Retry-After", Math.ceil(rej.msBeforeNext / 1000).toString());
        return next(new AppError(429, "RATE_LIMITED", "Too many requests, please try again later"));
      }
      // Section 3.3 rule 1 — Redis is coordination/cache, not the source
      // of truth; a genuine Redis-connectivity error (or one too slow to
      // answer within the race above) degrades to fail-open (request
      // proceeds unlimited) rather than blocking all traffic, which a
      // protective-but-optional layer must never do.
      const message = rej === STORE_TIMEOUT_SYMBOL ? "Rate limiter store timed out" : `Rate limiter store error: ${rej instanceof Error ? rej.message : String(rej)}`;
      log({ level: "error", message });
      next();
    });
}

// Section 4.10: "10 attempts / 15 min per IP+identifier pair".
export function loginRateLimit(req: Request, res: Response, next: NextFunction) {
  const identifier = typeof req.body?.identifier === "string" ? req.body.identifier : "";
  consumeOrReject(loginLimiter, `${req.ip}:${identifier}`, res, next);
}

export function registerRateLimit(req: Request, res: Response, next: NextFunction) {
  consumeOrReject(registerLimiter, req.ip ?? "unknown", res, next);
}

// Mount after requireAuth so req.user is populated.
export function authenticatedRateLimit(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  consumeOrReject(authenticatedGenericLimiter, req.user!.id, res, next);
}

export function publicRateLimit(req: Request, res: Response, next: NextFunction) {
  consumeOrReject(publicGenericLimiter, req.ip ?? "unknown", res, next);
}

// Section 4.10: "1 / 5s per worker (in addition to the existing 10s Redis
// debounce on the write itself)". Mount after requireProvider.
export function locationPingRateLimit(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  consumeOrReject(locationPingLimiter, req.user!.id, res, next);
}

// Section 4.10: "5 / day per worker".
export function walletRedeemRateLimit(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  consumeOrReject(walletRedeemLimiter, req.user!.id, res, next);
}

// Section 4.10: "30/day per customer as an abuse ceiling" (the 1-per-
// booking rule is enforced structurally by Review.bookingId's unique
// constraint, not by this limiter).
export function reviewRateLimit(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  consumeOrReject(reviewLimiter, req.user!.id, res, next);
}
