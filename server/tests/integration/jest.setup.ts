import { redis } from "../../src/lib/redis-lock";

// Running the full integration project in one process (--runInBand) means
// every test's registrations/logins share the same Redis-backed rate
// limiters (Section 4.10) for the whole run — global-setup.js only clears
// them once, at process start. The registration limiter in particular
// (5/hour) is keyed by IP alone, covering both customer and worker
// registration together, and several individual test *files* already do
// more than 5 registrations on their own — clearing once per file isn't
// enough. Clearing before every test keeps each test's own assertions
// about real rate-limit behavior (Section 9 threat #12) intact — nothing
// is cleared *during* a test, only before it starts — while stopping
// unrelated tests from tripping over each other's cumulative volume.
// Bounded so a real transient Redis outage (this environment's Upstash
// instance has been observed to degrade for extended periods) fails this
// hook fast rather than eating the default hook timeout on every single
// test for the rest of the run — if Redis is genuinely down, rate limits
// are the least of the suite's problems, and letting other tests proceed
// to fail with their own clear errors is more useful than stalling here.
beforeEach(async () => {
  try {
    const keys = await Promise.race([
      redis.keys("rl:*"),
      new Promise<string[]>((_, reject) => setTimeout(() => reject(new Error("redis timeout")), 3000))
    ]);
    if (keys.length > 0) await Promise.race([redis.del(keys), new Promise((_, reject) => setTimeout(() => reject(new Error("redis timeout")), 3000))]);
  } catch {
    // Redis unreachable/slow — proceed without clearing; the test itself
    // will surface whatever that means for it.
  }
});
