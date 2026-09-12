import cron from "node-cron";
import { prisma } from "../lib/prisma";
import { io } from "../lib/socket";
import { scoreCandidateWorkers } from "./continuity-scoring.service";
import { transitionBookingStatus } from "./booking-state-machine.service";

const MAX_SEARCH_RADIUS_KM = 15;

async function getBookingCoordinates(bookingId: string): Promise<[number, number]> {
  const rows = await prisma.$queryRaw<{ lng: number; lat: number }[]>`
    SELECT ST_X("customerLocation") AS lng, ST_Y("customerLocation") AS lat
    FROM bookings WHERE id = ${bookingId}
  `;
  return [rows[0].lng, rows[0].lat];
}

async function getTimeouts(): Promise<{ top3: number; pool: number }> {
  const config = await prisma.platformConfig.findUnique({ where: { id: 1 } });
  return { top3: config?.top3TimeoutSeconds ?? 45, pool: config?.poolTimeoutSeconds ?? 120 };
}

// Section 11.4 — self-healing backstop for the dispatch.service.ts
// in-process setTimeout/pub-sub chains, lost on a server restart. Runs
// every 30 seconds. Rather than trying to serialize and resume the
// crashed process's "which candidate index was I on" loop state (not
// persisted anywhere), a stale TOP3 offer is closed out and the booking is
// advanced by re-scoring candidates and excluding every worker already
// present in this booking's DispatchLog history — functionally equivalent
// to "continue the sequence," without needing in-memory state to survive
// a restart. The in-process timer stays the fast path for the common
// (no-restart) case; this is the correctness backstop.
export async function runReconciliationSweep(): Promise<void> {
  const { top3, pool } = await getTimeouts();
  await sweepStaleTop3Offers(top3);
  await sweepStalePoolOffers(pool);
  await sweepStaleAssignedBookings();
}

async function sweepStaleTop3Offers(top3TimeoutSeconds: number): Promise<void> {
  const cutoff = new Date(Date.now() - top3TimeoutSeconds * 1000);
  const stale = await prisma.dispatchLog.findMany({
    where: {
      outcome: "OFFERED",
      offeredAt: { lt: cutoff },
      attemptNumber: { in: ["ATTEMPT_1", "ATTEMPT_2", "ATTEMPT_3"] }
    }
  });

  for (const log of stale) {
    await prisma.dispatchLog.update({ where: { id: log.id }, data: { outcome: "TIMEOUT", respondedAt: new Date() } });

    const booking = await prisma.booking.findUnique({ where: { id: log.bookingId } });
    if (!booking || booking.status !== "DISPATCHING_TOP3") continue;

    const remainingOffered = await prisma.dispatchLog.count({
      where: { bookingId: booking.id, outcome: "OFFERED", attemptNumber: { in: ["ATTEMPT_1", "ATTEMPT_2", "ATTEMPT_3"] } }
    });
    if (remainingOffered > 0) continue; // another top-3 candidate is still pending; let it play out

    const alreadyTried = await prisma.dispatchLog.findMany({ where: { bookingId: booking.id }, select: { workerId: true } });
    const triedIds = new Set(alreadyTried.map((d) => d.workerId));

    const [lng, lat] = await getBookingCoordinates(booking.id);
    const candidates = await scoreCandidateWorkers({
      serviceCategoryId: booking.serviceCategoryId,
      customerId: booking.customerId,
      lng,
      lat,
      maxRadiusKm: MAX_SEARCH_RADIUS_KM
    });
    const poolCandidates = candidates.filter((c) => !triedIds.has(c.workerId));

    await transitionBookingStatus(booking.id, "DISPATCHING_POOL");

    if (poolCandidates.length === 0) {
      await transitionBookingStatus(booking.id, "CANCELLED");
      io.to(`booking:${booking.id}`).emit("dispatch:exhausted", { bookingId: booking.id });
      continue;
    }

    await prisma.dispatchLog.createMany({
      data: poolCandidates.map((c) => ({
        bookingId: booking.id,
        workerId: c.workerId,
        attemptNumber: "POOL" as const,
        distanceKm: c.distanceKm,
        continuityScore: c.continuityScore,
        outcome: "OFFERED" as const
      }))
    });
    for (const c of poolCandidates) {
      await io.in(`worker:${c.workerId}`).socketsJoin(`booking:${booking.id}`);
      io.to(`worker:${c.workerId}`).emit("dispatch:offer", { bookingId: booking.id, phase: "POOL" });
    }
    io.to(`booking:${booking.id}`).emit("dispatch:update", {
      bookingId: booking.id,
      phase: "POOL",
      candidates: poolCandidates.map((c) => ({ workerId: c.workerId, offerStatus: "WAITING" }))
    });
  }
}

async function sweepStalePoolOffers(poolTimeoutSeconds: number): Promise<void> {
  const cutoff = new Date(Date.now() - poolTimeoutSeconds * 1000);
  const bookingsWithStalePool = await prisma.dispatchLog.findMany({
    where: { outcome: "OFFERED", offeredAt: { lt: cutoff }, attemptNumber: "POOL" },
    select: { bookingId: true },
    distinct: ["bookingId"]
  });

  for (const { bookingId } of bookingsWithStalePool) {
    const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
    if (!booking || booking.status !== "DISPATCHING_POOL") continue;

    await prisma.dispatchLog.updateMany({
      where: { bookingId, outcome: "OFFERED", attemptNumber: "POOL" },
      data: { outcome: "TIMEOUT", respondedAt: new Date() }
    });
    await transitionBookingStatus(bookingId, "CANCELLED");
    io.to(`booking:${bookingId}`).emit("dispatch:exhausted", { bookingId });
  }
}

// Section 11.4's second required mitigation — auto-confirm durability.
async function sweepStaleAssignedBookings(): Promise<void> {
  const cutoff = new Date(Date.now() - 60 * 1000);
  const stale = await prisma.booking.findMany({ where: { status: "ASSIGNED", updatedAt: { lt: cutoff } } });
  for (const booking of stale) {
    await transitionBookingStatus(booking.id, "CONFIRMED").catch(() => {});
  }
}

export function startReconciliationSweep(): void {
  cron.schedule("*/30 * * * * *", () => {
    runReconciliationSweep().catch((err) => console.error("Reconciliation sweep failed", err));
  });
}
