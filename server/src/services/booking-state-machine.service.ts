// src/services/booking-state-machine.service.ts
import { BookingStatus, Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "../lib/prisma";

export const LEGAL_TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  REQUESTED: ["DISPATCHING_TOP3", "CANCELLED"],
  DISPATCHING_TOP3: ["ASSIGNED", "DISPATCHING_POOL", "CANCELLED"],
  DISPATCHING_POOL: ["ASSIGNED", "CANCELLED"],
  ASSIGNED: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["IN_PROGRESS", "CANCELLED"],
  IN_PROGRESS: ["COMPLETED"],
  COMPLETED: ["SETTLED"],
  SETTLED: [],
  CANCELLED: []
};

const TIMESTAMP_FIELD: Partial<Record<BookingStatus, "confirmedAt" | "startedAt" | "completedAt" | "settledAt" | "cancelledAt">> = {
  CONFIRMED: "confirmedAt",
  IN_PROGRESS: "startedAt",
  COMPLETED: "completedAt",
  SETTLED: "settledAt",
  CANCELLED: "cancelledAt"
};

async function applyTransition(tx: Prisma.TransactionClient, bookingId: string, next: BookingStatus): Promise<void> {
  const booking = await tx.booking.findUniqueOrThrow({ where: { id: bookingId } });
  if (!LEGAL_TRANSITIONS[booking.status].includes(next)) {
    throw new Error(`ILLEGAL_TRANSITION:${booking.status}->${next}`);
  }
  const field = TIMESTAMP_FIELD[next];
  await tx.booking.update({
    where: { id: bookingId },
    data: { status: next, ...(field ? { [field]: new Date() } : {}) }
  });
  await tx.auditLog.create({
    data: {
      action: "BOOKING_STATUS_CHANGED",
      entityType: "Booking",
      entityId: bookingId,
      metadata: { from: booking.status, to: next }
    }
  });
}

// Section 4.12 item 1 correction: accepts an optional injectable Prisma
// client so this can be called from inside an already-open transaction
// (e.g. submitReview's SETTLED transition, PHASE 10) without nesting
// transactions, which Prisma does not support — the original Section 4.4.5
// listing always opened its own `prisma.$transaction`, making it
// uncallable from inside another transaction as-is. Every call site that
// is not already inside a transaction (the dispatch engine's own phase
// transitions, this phase) omits the third argument and gets the default
// top-level-transaction behavior.
export async function transitionBookingStatus(
  bookingId: string,
  next: BookingStatus,
  client: PrismaClient | Prisma.TransactionClient = prisma
): Promise<void> {
  if (client === prisma) {
    await prisma.$transaction((tx) => applyTransition(tx, bookingId, next));
  } else {
    await applyTransition(client as Prisma.TransactionClient, bookingId, next);
  }
}
