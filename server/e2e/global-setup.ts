// Phase-13 finding: without this, the E2E run shares the same Redis-
// backed registration rate limiter (5/hour/IP, Section 4.10) as every
// other test run this session against the same loopback IP — confirmed
// live: a customer-flow run failed with a genuine 429 from cumulative
// volume, not an app or selector bug. Clearing here handles cross-run
// buildup; it is NOT enough on its own — see clearRateLimitState in
// helpers.ts, called per-test, for why.
async function globalSetup() {
  require("dotenv").config();
  const Redis = require("ioredis");
  const client = new Redis(process.env.REDIS_URL);
  try {
    const keys = await client.keys("rl:*");
    if (keys.length > 0) await client.del(keys);
  } finally {
    client.disconnect();
  }
}

export default globalSetup;
