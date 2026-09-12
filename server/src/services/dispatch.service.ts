// src/services/dispatch.service.ts
import { prisma } from "../lib/prisma";
import { redis } from "../lib/redis-lock";
import { scoreCandidateWorkers } from "./continuity-scoring.service";
import { io } from "../lib/socket";
import { transitionBookingStatus } from "./booking-state-machine.service";
import { log } from "../lib/logger";

// Phase-13 finding: an async setTimeout/setInterval callback that throws
// (e.g. a transient DB blip — this environment's Supabase pooler is known
// to drop connections intermittently) becomes an unhandled promise
// rejection with no global handler anywhere in the app, which crashes the
// entire Node process by default. These timers fire on every single
// dispatch offer (every booking, every candidate, every 45s/120s
// timeout), so this was a live, repeatedly-triggered crash risk, not a
// theoretical one — confirmed by the integration test server going down
// mid-suite and never coming back. Every async timer callback in this
// file is wrapped so a transient failure is logged, not fatal.
function safeAsyncTimer(fn: () => Promise<void>, context: string, onError?: () => void): () => void {
  return () => {
    fn().catch((err) => {
      log({ level: "error", message: `Unhandled error in ${context}: ${err instanceof Error ? err.message : String(err)}` });
      onError?.();
    });
  };
}

const MAX_SEARCH_RADIUS_KM = 15;

// Deviation from the literal Section 4.4.3 listing, flagged: that code
// hardcoded TOP3_OFFER_TIMEOUT_SECONDS=45 / POOL_OFFER_TIMEOUT_SECONDS=120
// as module constants, even though Section 3's PlatformConfig model exists
// specifically to hold these same two values (top3TimeoutSeconds,
// poolTimeoutSeconds) so an admin can change them via PATCH /admin/config
// (Section 1.3.11/15.6). Hardcoding would make that entire admin feature a
// silent no-op. Reading live from PlatformConfig instead, with the same
// 45/120 values as the fallback default if the config row is somehow
// missing. acquireBookingLock is unaffected — that's not config-adjustable.
async function getDispatchTimeouts(): Promise<{ top3: number; pool: number }> {
  const config = await prisma.platformConfig.findUnique({ where: { id: 1 } });
  return { top3: config?.top3TimeoutSeconds ?? 45, pool: config?.poolTimeoutSeconds ?? 120 };
}

export async function enqueueDispatch(bookingId: string): Promise<void> {
  const booking = await prisma.booking.findUniqueOrThrow({
    where: { id: bookingId },
    include: { customer: true }
  });

  const [lng, lat] = await getBookingCoordinates(bookingId);
  const { top3: TOP3_OFFER_TIMEOUT_SECONDS, pool: POOL_OFFER_TIMEOUT_SECONDS } = await getDispatchTimeouts();

  const candidates = await scoreCandidateWorkers({
    serviceCategoryId: booking.serviceCategoryId,
    customerId: booking.customerId,
    lng,
    lat,
    maxRadiusKm: MAX_SEARCH_RADIUS_KM
  });

  await transitionBookingStatus(bookingId, "DISPATCHING_TOP3");

  const top3 = candidates.slice(0, 3);
  const pool = candidates.slice(3);

  await runSequentialOfferQueue(bookingId, top3, "TOP3", TOP3_OFFER_TIMEOUT_SECONDS);

  const stillOpen = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (stillOpen && stillOpen.status === "DISPATCHING_TOP3") {
    await transitionBookingStatus(bookingId, "DISPATCHING_POOL");
    await runBroadcastOfferPool(bookingId, pool, POOL_OFFER_TIMEOUT_SECONDS);
  }
}

async function runSequentialOfferQueue(
  bookingId: string,
  candidates: { workerId: string; distanceKm: number; continuityScore: number }[],
  phaseLabel: "TOP3",
  timeoutSeconds: number
): Promise<void> {
  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i];
    const attemptNumber = (["ATTEMPT_1", "ATTEMPT_2", "ATTEMPT_3"] as const)[i];

    const dispatchLog = await prisma.dispatchLog.create({
      data: {
        bookingId,
        workerId: candidate.workerId,
        attemptNumber,
        distanceKm: candidate.distanceKm,
        continuityScore: candidate.continuityScore,
        outcome: "OFFERED"
      }
    });

    // Section 12.3 — a worker's currently-connected sockets join the
    // booking room the moment they're offered it (not just at their own
    // connect-time snapshot, since this offer may be created well after
    // they connected).
    await io.in(`worker:${candidate.workerId}`).socketsJoin(`booking:${bookingId}`);

    io.to(`worker:${candidate.workerId}`).emit("dispatch:offer", {
      dispatchLogId: dispatchLog.id,
      bookingId,
      phase: phaseLabel,
      offerExpiresInSeconds: timeoutSeconds
    });
    io.to(`booking:${bookingId}`).emit("dispatch:update", {
      bookingId,
      phase: phaseLabel,
      candidateStatus: { workerId: candidate.workerId, offerStatus: "WAITING" }
    });

    const outcome = await waitForResponseOrTimeout(dispatchLog.id, timeoutSeconds);

    if (outcome === "ACCEPTED") {
      return; // acceptBooking() already transitioned status inside the respond handler
    }
    // DECLINED or TIMEOUT: continue to the next candidate in the sequence
  }
}

async function runBroadcastOfferPool(
  bookingId: string,
  pool: { workerId: string; distanceKm: number; continuityScore: number }[],
  timeoutSeconds: number
): Promise<void> {
  const dispatchLogs = await prisma.$transaction(
    pool.map((candidate) =>
      prisma.dispatchLog.create({
        data: {
          bookingId,
          workerId: candidate.workerId,
          attemptNumber: "POOL",
          distanceKm: candidate.distanceKm,
          continuityScore: candidate.continuityScore,
          outcome: "OFFERED"
        }
      })
    )
  );

  for (const candidate of pool) {
    await io.in(`worker:${candidate.workerId}`).socketsJoin(`booking:${bookingId}`);
    io.to(`worker:${candidate.workerId}`).emit("dispatch:offer", {
      bookingId,
      phase: "POOL",
      offerExpiresInSeconds: timeoutSeconds
    });
  }
  io.to(`booking:${bookingId}`).emit("dispatch:update", {
    bookingId,
    phase: "POOL",
    candidates: pool.map((c) => ({ workerId: c.workerId, offerStatus: "WAITING" }))
  });

  await new Promise<void>((resolve) => {
    const pollInterval = setInterval(
      safeAsyncTimer(async () => {
        const current = await prisma.booking.findUnique({ where: { id: bookingId } });
        if (!current || current.status !== "DISPATCHING_POOL") {
          clearInterval(pollInterval);
          resolve();
        }
      }, "runBroadcastOfferPool poll"),
      2000
    );
    setTimeout(
      safeAsyncTimer(
        async () => {
          clearInterval(pollInterval);
          const current = await prisma.booking.findUnique({ where: { id: bookingId } });
          if (current && current.status === "DISPATCHING_POOL") {
            await prisma.dispatchLog.updateMany({
              where: { id: { in: dispatchLogs.map((d) => d.id) }, outcome: "OFFERED" },
              data: { outcome: "TIMEOUT", respondedAt: new Date() }
            });
            await transitionBookingStatus(bookingId, "CANCELLED");
            io.to(`booking:${bookingId}`).emit("dispatch:exhausted", { bookingId });
          }
          resolve();
        },
        "runBroadcastOfferPool timeout",
        // This is the terminal fallback for the whole wait — if it
        // itself throws (e.g. a transient DB blip mid-write), the
        // awaiting caller must still be unblocked rather than hang
        // forever waiting on a promise nothing will ever resolve.
        resolve
      ),
      timeoutSeconds * 1000
    );
  });
}

function waitForResponseOrTimeout(dispatchLogId: string, timeoutSeconds: number): Promise<"ACCEPTED" | "DECLINED" | "TIMEOUT"> {
  return new Promise((resolve) => {
    const channel = `dispatch-response:${dispatchLogId}`;
    const subscriber = redis.duplicate();
    let settled = false;

    // Self-protecting: every caller below fires this without awaiting it
    // (a pub/sub message handler, a timer callback), so it must never
    // throw — resolve() is this whole promise's only way out, and a
    // transient Redis error unsubscribing/disconnecting must not prevent
    // it from firing.
    const finish = async (outcome: "ACCEPTED" | "DECLINED" | "TIMEOUT") => {
      if (settled) return;
      settled = true;
      try {
        await subscriber.unsubscribe(channel);
        subscriber.disconnect();
      } catch (err) {
        log({ level: "error", message: `dispatch subscriber cleanup failed: ${err instanceof Error ? err.message : String(err)}` });
      }
      resolve(outcome);
    };

    subscriber.subscribe(channel, () => {
      subscriber.on("message", (_chan, message) => {
        finish(message as "ACCEPTED" | "DECLINED");
      });
    });

    setTimeout(
      safeAsyncTimer(
        async () => {
          await prisma.dispatchLog.updateMany({
            where: { id: dispatchLogId, outcome: "OFFERED" },
            data: { outcome: "TIMEOUT", respondedAt: new Date() }
          });
          finish("TIMEOUT");
        },
        "waitForResponseOrTimeout",
        () => finish("TIMEOUT")
      ),
      timeoutSeconds * 1000
    );
  });
}

async function getBookingCoordinates(bookingId: string): Promise<[number, number]> {
  const rows = await prisma.$queryRaw<{ lng: number; lat: number }[]>`
    SELECT ST_X("customerLocation") AS lng, ST_Y("customerLocation") AS lat
    FROM bookings WHERE id = ${bookingId}
  `;
  return [rows[0].lng, rows[0].lat];
}
