const path = require("path");
const os = require("os");
const fs = require("fs");
const { spawn } = require("child_process");
const http = require("http");

const STATE_FILE = path.join(os.tmpdir(), "worksetu-test-server-state.json");
const LOG_FILE = path.join(os.tmpdir(), "worksetu-test-server.log");
const PORT = 4100;
const SERVER_ROOT = path.join(__dirname, "..", "..");

function waitForHealth(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    function attempt() {
      const req = http.get({ host: "localhost", port, path: "/api/v1/public/stats", timeout: 2000 }, (res) => {
        res.resume();
        if (res.statusCode && res.statusCode < 500) {
          resolve();
        } else if (Date.now() > deadline) {
          reject(new Error(`Test server unhealthy, last status ${res.statusCode}`));
        } else {
          setTimeout(attempt, 1000);
        }
      });
      req.on("error", () => {
        if (Date.now() > deadline) {
          reject(new Error("Test server did not become healthy in time"));
        } else {
          setTimeout(attempt, 1000);
        }
      });
    }
    attempt();
  });
}

async function clearRateLimitState() {
  // Test-environment-only cleanup: rate-limiter-flexible's Redis counters
  // are pure coordination state (Section 3.3 rule 1 — never the source of
  // truth), so clearing them between test runs is safe and reversible.
  // Without this, repeated suite runs from the same loopback IP trip the
  // real registration limiter (5/hour, Section 4.10) that Phase 13's own
  // security matrix intentionally tests.
  const Redis = require("ioredis");
  const client = new Redis(process.env.REDIS_URL);
  try {
    const keys = await client.keys("rl:*");
    if (keys.length > 0) await client.del(keys);
  } finally {
    client.disconnect();
  }
}

module.exports = async function globalSetup() {
  require("dotenv").config({ path: require("path").join(SERVER_ROOT, ".env") });
  await clearRateLimitState();

  // Phase-13 finding: this used to accumulate the whole run's stdout+
  // stderr (a JSON log line per request, Section 8.3/22.4) into an
  // unbounded in-memory string for the entire suite's duration, kept
  // alive only for a boot-failure diagnostic that's only ever read in
  // the first 60s. Over a long multi-file run that's a real, growing
  // memory footprint in the process holding the child's pipes; on
  // Windows a destabilized/killed parent can take a child tied to the
  // same console group down with it. Streamed to a file instead — same
  // diagnostic value, no in-process accumulation.
  if (fs.existsSync(LOG_FILE)) fs.unlinkSync(LOG_FILE);
  const logStream = fs.createWriteStream(LOG_FILE, { flags: "a" });

  const child = spawn("npx", ["ts-node", "src/app.ts"], {
    cwd: SERVER_ROOT,
    env: { ...process.env, PORT: String(PORT) },
    shell: true,
    stdio: ["ignore", "pipe", "pipe"],
    detached: false
  });

  child.stdout.pipe(logStream);
  child.stderr.pipe(logStream);

  await waitForHealth(PORT, 60000).catch((err) => {
    const tail = fs.existsSync(LOG_FILE) ? fs.readFileSync(LOG_FILE, "utf-8").slice(-4000) : "(no log)";
    console.error(`Test server boot log (tail):\n${tail}`);
    throw err;
  });

  fs.writeFileSync(
    STATE_FILE,
    JSON.stringify({ pid: child.pid, port: PORT, baseUrl: `http://localhost:${PORT}/api/v1`, logFile: LOG_FILE })
  );

  console.log(`Integration test server up on port ${PORT} (pid ${child.pid}); log: ${LOG_FILE}`);
};
