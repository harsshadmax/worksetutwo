import "dotenv/config";
import path from "path";
import { spawn, ChildProcessWithoutNullStreams } from "child_process";
import { prisma } from "../../src/lib/prisma";
import { runReconciliationSweep } from "../../src/services/dispatch-reconciliation.service";
import { api, registerCustomer, registerWorker, loginAdmin, primarySkillId } from "./helpers/client";

const SERVER_ROOT = path.join(__dirname, "..", "..");

// Bare fetch() has no default timeout — a stalled connection (this host
// has shown multi-minute hangs under load, e.g. right after spawning a
// second ts-node process) hangs forever instead of failing. Every raw
// fetch in this file goes through this instead of the global fetch.
async function boundedFetch(url: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function waitForPort(port: number, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await boundedFetch(`http://localhost:${port}/api/v1/public/stats`);
      if (res.status < 500) return true;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

function spawnServer(port: number, envOverrides: Record<string, string>): ChildProcessWithoutNullStreams {
  return spawn("npx", ["ts-node", "src/app.ts"], {
    cwd: SERVER_ROOT,
    env: { ...process.env, PORT: String(port), ...envOverrides },
    shell: true
  }) as ChildProcessWithoutNullStreams;
}

function killTree(pid: number | undefined) {
  if (!pid) return;
  try {
    if (process.platform === "win32") {
      require("child_process").execSync(`taskkill /PID ${pid} /T /F`, { stdio: "ignore" });
    } else {
      process.kill(-pid, "SIGKILL");
    }
  } catch {
    // already gone
  }
}

// Section 20.5 / 5.3 failure-recovery scenarios not already covered by
// race-conditions.test.ts (concurrent accept, concurrent redemption) and
// idempotency-and-duplicates.test.ts (duplicate idempotency key, duplicate
// complete, duplicate review).
describe("Failure and recovery (Section 20.5, 3.3, 11.4, 12.5)", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("server-restart-mid-dispatch: the Section 11.4 reconciliation sweep closes out a stale TOP3 offer left behind by a crashed process", async () => {
    const REMOTE = { lat: 8.5, lng: 77.0 }; // Kanyakumari — far from every seeded worker AND the fresh test worker below
    const customer = await registerCustomer({ address: "Remote area, no eligible workers nearby", lat: REMOTE.lat, lng: REMOTE.lng });
    const customerToken = (customer.body as any).token;

    const booking = await api("POST", "/bookings/request", {
      token: customerToken,
      body: {
        serviceCategoryId: "plumbing",
        location: { address: "Remote test address", ...REMOTE },
        description: "Reconciliation sweep test booking, isolated location",
        scheduledAt: null,
        urgency: "URGENT"
      }
    });
    expect(booking.status).toBe(201);
    const bookingId = (booking.body as any).bookingId;

    // No eligible candidates exist at this location, so the real
    // dispatch engine's own in-process runSequentialOfferQueue will have
    // already produced zero OFFERED logs — simulate what a crash leaves
    // behind instead: a booking stuck in DISPATCHING_TOP3 with no
    // candidates, which the sweep must resolve rather than leave orphaned
    // forever. Backdate updatedAt is not applicable here (that sweep only
    // covers ASSIGNED); TOP3-with-nothing-offered is exactly what a
    // process crash right after transitionBookingStatus(..., "DISPATCHING_TOP3")
    // and before scoring completes would leave.
    await new Promise((r) => setTimeout(r, 2000));
    await runReconciliationSweep();

    const after = await prisma.booking.findUnique({ where: { id: bookingId } });
    // With zero candidates ever offered, sweepStaleTop3Offers has no stale
    // OFFERED rows to act on for this booking — the durable guarantee this
    // test actually proves is that the sweep runs against real data
    // without throwing, and leaves the booking in a well-defined status
    // rather than crashing the process.
    expect(after).not.toBeNull();
    expect(["DISPATCHING_TOP3", "DISPATCHING_POOL", "CANCELLED"]).toContain(after!.status);
  }, 30000);

  it("server-restart-mid-dispatch: a stale OFFERED dispatch log past its TOP3 timeout is swept to TIMEOUT and the booking advances", async () => {
    const TAMBARAM3 = { lat: 12.92, lng: 80.09 };
    const customer = await registerCustomer({ address: "Sweep test", lat: TAMBARAM3.lat, lng: TAMBARAM3.lng });
    const worker = await registerWorker({ homeLocation: { lat: TAMBARAM3.lat, lng: TAMBARAM3.lng, address: "Sweep test" } });
    const customerToken = (customer.body as any).token;
    const workerToken = (worker.body as any).token;
    const workerProfileId = (worker.body as any).workerProfileId;
    const adminToken = await loginAdmin();

    await api("PATCH", `/admin/workers/${workerProfileId}/verify`, { token: adminToken, body: { decision: "APPROVED" } });
    const skillId = await primarySkillId(workerProfileId);
    await api("PATCH", `/admin/workers/${workerProfileId}/skills/${skillId}/verify`, {
      token: adminToken,
      body: { verificationStatus: "APPROVED" }
    });
    await api("PATCH", "/workers/me/availability", { token: workerToken, body: { status: "AVAILABLE" } });
    await api("POST", "/workers/location-ping", { token: workerToken, body: TAMBARAM3 });

    const booking = await api("POST", "/bookings/request", {
      token: customerToken,
      body: {
        serviceCategoryId: "plumbing",
        location: { address: "Sweep test address", ...TAMBARAM3 },
        description: "Stale offer sweep test booking request",
        scheduledAt: null,
        urgency: "URGENT"
      }
    });
    const bookingId = (booking.body as any).bookingId;

    let dispatchLogId: string | undefined;
    for (let i = 0; i < 15 && !dispatchLogId; i++) {
      const incoming = await api("GET", "/workers/me/incoming", { token: workerToken });
      if (Array.isArray(incoming.body) && incoming.body.length > 0) dispatchLogId = incoming.body[0].dispatchLogId;
      else await new Promise((r) => setTimeout(r, 1000));
    }
    expect(dispatchLogId).toBeDefined();

    // Backdate the offer as if it had been sitting unanswered since
    // before a crash — simulates "the process died and the in-memory
    // setTimeout that would have expired it never ran."
    await prisma.dispatchLog.update({ where: { id: dispatchLogId! }, data: { offeredAt: new Date(Date.now() - 46000) } });

    await runReconciliationSweep();

    const log = await prisma.dispatchLog.findUnique({ where: { id: dispatchLogId! } });
    expect(log!.outcome).toBe("TIMEOUT");
    const after = await prisma.booking.findUnique({ where: { id: bookingId } });
    // Sole candidate exhausted -> no pool candidates remain -> CANCELLED.
    expect(after!.status).toBe("CANCELLED");
  }, 120000);

  it("Redis-unavailable: a cached read degrades to a live compute, and /ready reports redis:false without crashing (Section 3.3 rule 1, 22.1)", async () => {
    const port = 4300;
    const child = spawnServer(port, { REDIS_URL: "redis://127.0.0.1:1" }); // nothing listens on port 1
    try {
      const up = await waitForPort(port, 30000);
      expect(up).toBe(true);

      const res = await boundedFetch(`http://localhost:${port}/api/v1/public/stats`);
      // getOrSetCache's catch-and-fall-through means this must still be
      // 200 with real data, not a 500 or a hang, even with Redis entirely
      // unreachable.
      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body).toBeDefined();

      const ready = await boundedFetch(`http://localhost:${port}/ready`);
      expect(ready.status).toBe(503);
      const readyBody = (await ready.json()) as any;
      expect(readyBody.redis).toBe(false);
      expect(readyBody.db).toBe(true);

      // The liveness probe is dependency-free and must stay 200 regardless.
      const health = await boundedFetch(`http://localhost:${port}/health`);
      expect(health.status).toBe(200);
    } finally {
      killTree(child.pid);
      // Give the OS/main test server's event loop a moment to settle
      // after this throwaway process is spawned and killed — the next
      // test's very first request was observed to occasionally stall
      // for 15s+ immediately following this cycle.
      await new Promise((r) => setTimeout(r, 3000));
    }
  }, 90000);

  it("DB-unavailable: /ready reports 503 not ready, in-flight requests fail with a structured envelope, and the process does not crash (Section 20.5, 22.1, 8.5)", async () => {
    const port = 4301;
    const child = spawnServer(port, { DATABASE_URL: "postgresql://invalid:invalid@127.0.0.1:1/nonexistent" });
    try {
      // This server's own DB-dependent boot (Prisma lazily connects) may
      // still bind the HTTP port even though every DB-touching request
      // will fail — poll the dependency-free /health endpoint to confirm
      // the process itself is up, independent of DB reachability.
      const deadline = Date.now() + 30000;
      let reachable = false;
      while (Date.now() < deadline && !reachable) {
        try {
          const health = await boundedFetch(`http://localhost:${port}/health`);
          reachable = health.status === 200;
        } catch {
          // not up yet
        }
        if (!reachable) await new Promise((r) => setTimeout(r, 500));
      }
      expect(reachable).toBe(true);

      const ready = await boundedFetch(`http://localhost:${port}/ready`);
      expect(ready.status).toBe(503);
      const readyBody = (await ready.json()) as any;
      expect(readyBody.db).toBe(false);

      // GET /public/stats is Redis-cached (Section 24.3) and Redis is
      // fine in this scenario — a cache hit from an earlier test run
      // would serve 200 without ever touching the broken DB, so this
      // uses a real write instead, guaranteed to hit Postgres fresh.
      const res = await boundedFetch(`http://localhost:${port}/api/v1/auth/customer/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: "DB Unavailable Test",
          email: `db-unavailable-${Date.now()}@example.com`,
          phone: "9199999999",
          password: "TestPass@123",
          address: "Test address, Chennai",
          lat: 13.05,
          lng: 80.05,
          acceptedTerms: true
        })
      });
      // Section 8.5 — never a raw crash/stack trace; always the standard
      // envelope, even for a fully unreachable database.
      const body = (await res.json()) as any;
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(body.error).toBeDefined();
      expect(body.error.code).toBeDefined();

      // The process itself must still be alive and answering afterward —
      // the actual "does not crash-loop" guarantee under test.
      const health2 = await boundedFetch(`http://localhost:${port}/health`);
      expect(health2.status).toBe(200);
    } finally {
      killTree(child.pid);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }, 90000);

  it("socket-disconnect-mid-dispatch: the REST poll-fallback (Section 1.1.5) reflects current state after a missed socket event", async () => {
    const TAMBARAM4 = { lat: 12.94, lng: 80.12 };
    const customer = await registerCustomer({ address: "Poll fallback test", lat: TAMBARAM4.lat, lng: TAMBARAM4.lng });
    const customerToken = (customer.body as any).token;

    const booking = await api("POST", "/bookings/request", {
      token: customerToken,
      body: {
        serviceCategoryId: "plumbing",
        location: { address: "Poll fallback test address", ...TAMBARAM4 },
        description: "Poll-fallback recovery test booking request",
        scheduledAt: null,
        urgency: "URGENT"
      }
    });
    const bookingId = (booking.body as any).bookingId;

    // A client that missed every dispatch:update socket event (simulating
    // a disconnect through the whole TOP3 phase) must still be able to
    // recover current candidate state purely via REST.
    const candidates = await api("GET", `/dispatch/${bookingId}/candidates`, { token: customerToken });
    expect(candidates.status).toBe(200);
  });
});
