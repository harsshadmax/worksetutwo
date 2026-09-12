// src/controllers/admin-operations.controller.ts — Section 1.3.2 (booking
// management, force reassignment, admin cancel), 1.3.3 (dispatch monitor),
// 1.3.4 (live worker map).
import { Response } from "express";
import { z } from "zod";
import { BookingStatus } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { AuthenticatedRequest } from "../middleware/auth";
import { io } from "../lib/socket";
import { writeAuditLog } from "../lib/audit";
import { transitionBookingStatus } from "../services/booking-state-machine.service";
import { dispatchNotification } from "../services/notification-dispatcher.service";
import { asyncHandler, AppError, sendValidationError } from "../utils/app-error";
import { paginationQuerySchema, paginate } from "../utils/pagination";
import { requireNonEmptyReason } from "../utils/reason";

const bookingListQuerySchema = paginationQuerySchema.extend({
  status: z.nativeEnum(BookingStatus).optional()
});

// Section 1.3.2 — "Service Dispatch Requests" table.
export const listBookings = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const parsed = bookingListQuerySchema.safeParse(req.query);
  if (!parsed.success) return sendValidationError(req, res, parsed.error);
  const { page, pageSize, status } = parsed.data;

  const where = status ? { status } : {};
  const [items, totalCount] = await Promise.all([
    prisma.booking.findMany({
      where,
      include: { customer: { include: { user: true } }, assignedWorker: { include: { user: true } } },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize
    }),
    prisma.booking.count({ where })
  ]);

  return res.json(
    paginate(
      items.map((b) => ({
        id: b.id,
        status: b.status,
        serviceCategoryId: b.serviceCategoryId,
        customerName: b.customer.user.fullName,
        workerName: b.assignedWorker?.user.fullName ?? null,
        estimatedTotal: Number(b.estimatedTotal),
        createdAt: b.createdAt
      })),
      page,
      pageSize,
      totalCount
    )
  );
});

export const getBookingDispatchLog = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const booking = await prisma.booking.findUnique({ where: { id: req.params.id } });
  if (!booking) {
    throw new AppError(404, "BOOKING_NOT_FOUND", "Booking not found");
  }

  const logs = await prisma.dispatchLog.findMany({
    where: { bookingId: booking.id },
    include: { worker: { include: { user: true } } },
    orderBy: { offeredAt: "asc" }
  });

  return res.json(
    logs.map((l) => ({
      id: l.id,
      workerId: l.workerId,
      workerName: l.worker.user.fullName,
      attemptNumber: l.attemptNumber,
      distanceKm: l.distanceKm,
      continuityScore: l.continuityScore,
      outcome: l.outcome,
      offeredAt: l.offeredAt,
      respondedAt: l.respondedAt
    }))
  );
});

const TERMINAL_STATUSES: readonly BookingStatus[] = ["COMPLETED", "SETTLED", "CANCELLED"];

const forceAssignSchema = z.object({ workerId: z.string().min(1), reason: z.string().min(1) });

// Section 1.3.2 — "Force Reassign performs the same atomic-lock acceptance
// transaction as the automated engine but with attemptNumber =
// 'ADMIN_OVERRIDE'." Deviation, disclosed: booking-state-machine.service's
// LEGAL_TRANSITIONS table only permits ASSIGNED from DISPATCHING_TOP3/POOL,
// but Section 4.11's audit table describes this route as valid from "any
// non-terminal" status — so, like the existing dispatch-accept handler
// (dispatch.controller.ts), this writes booking.status directly inside its
// own transaction instead of calling transitionBookingStatus, which is the
// established precedent for exactly this kind of engine-bypassing
// assignment write.
export const forceAssignBooking = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const parsed = forceAssignSchema.safeParse(req.body);
  if (!parsed.success) {
    if (!(req.body as { reason?: unknown })?.reason) {
      throw new AppError(400, "REASON_REQUIRED", "A reason is required for this action");
    }
    return sendValidationError(req, res, parsed.error);
  }
  const { workerId, reason } = parsed.data;

  const booking = await prisma.booking.findUnique({ where: { id: req.params.id }, include: { customer: true } });
  if (!booking) {
    throw new AppError(404, "BOOKING_NOT_FOUND", "Booking not found");
  }
  if (TERMINAL_STATUSES.includes(booking.status)) {
    throw new AppError(409, "INVALID_STATE", "This booking can no longer be reassigned");
  }

  const worker = await prisma.workerProfile.findUnique({ where: { id: workerId }, include: { user: true } });
  if (!worker || worker.verificationStatus !== "APPROVED") {
    throw new AppError(404, "WORKER_NOT_FOUND", "Worker not found or not approved");
  }

  const distanceRows = await prisma.$queryRaw<{ distanceKm: number | null }[]>`
    SELECT ST_Distance(
      COALESCE(wp."currentLocation", wp."homeLocation")::geography,
      b."customerLocation"::geography
    ) / 1000.0 AS "distanceKm"
    FROM worker_profiles wp, bookings b
    WHERE wp.id = ${worker.id} AND b.id = ${booking.id}
  `;
  const distanceKm = distanceRows[0]?.distanceKm ?? 0;
  const previousWorkerId = booking.assignedWorkerId;

  await prisma.$transaction(async (tx) => {
    if (previousWorkerId && previousWorkerId !== worker.id) {
      await tx.workerProfile.update({ where: { id: previousWorkerId }, data: { availabilityStatus: "AVAILABLE", currentBookingId: null } });
    }
    await tx.booking.update({
      where: { id: booking.id },
      data: { status: "ASSIGNED", assignedWorkerId: worker.id, lockExpiresAt: null }
    });
    await tx.workerProfile.update({ where: { id: worker.id }, data: { availabilityStatus: "ON_JOB", currentBookingId: booking.id } });
    await tx.dispatchLog.create({
      data: {
        bookingId: booking.id,
        workerId: worker.id,
        attemptNumber: "ADMIN_OVERRIDE",
        distanceKm,
        continuityScore: 0,
        outcome: "ACCEPTED",
        respondedAt: new Date()
      }
    });
    await writeAuditLog(tx, {
      actorId: req.user!.id,
      action: "ADMIN_FORCE_ASSIGN",
      entityType: "Booking",
      entityId: booking.id,
      metadata: { reason, workerId: worker.id }
    });
  });

  io.to([`booking:${booking.id}`, "admin:dispatch"]).emit("dispatch:update", {
    bookingId: booking.id,
    phase: "ASSIGNED",
    candidateStatus: { workerId: worker.id, offerStatus: "ACCEPTED" }
  });

  await dispatchNotification({
    userId: booking.customer.userId,
    title: "Worker assigned",
    body: `${worker.user.fullName} has been assigned to your booking.`,
    dedupeKey: `booking:${booking.id}:assigned`
  });
  await dispatchNotification({
    userId: worker.user.id,
    title: "New job assigned",
    body: "An administrator has assigned you to a booking.",
    dedupeKey: `booking:${booking.id}:assigned:worker`
  });

  return res.json({ bookingId: booking.id, status: "ASSIGNED", workerId: worker.id });
});

const CANCELLABLE_STATUSES: readonly BookingStatus[] = ["REQUESTED", "DISPATCHING_TOP3", "DISPATCHING_POOL", "ASSIGNED", "CONFIRMED"];

// Section 15.1 — "same transition as Section 11.1's customer/worker cancel path."
export const adminCancelBooking = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const reason = requireNonEmptyReason(req.body);

  const booking = await prisma.booking.findUnique({
    where: { id: req.params.id },
    include: { customer: true, assignedWorker: { include: { user: true } } }
  });
  if (!booking) {
    throw new AppError(404, "BOOKING_NOT_FOUND", "Booking not found");
  }
  if (!CANCELLABLE_STATUSES.includes(booking.status)) {
    throw new AppError(409, "INVALID_STATE", "This booking can no longer be cancelled");
  }

  await prisma.$transaction(async (tx) => {
    await transitionBookingStatus(booking.id, "CANCELLED", tx);
    await tx.booking.update({ where: { id: booking.id }, data: { cancelReason: reason } });
    if (booking.assignedWorkerId) {
      await tx.workerProfile.update({ where: { id: booking.assignedWorkerId }, data: { availabilityStatus: "AVAILABLE", currentBookingId: null } });
    }
    await writeAuditLog(tx, {
      actorId: req.user!.id,
      action: "ADMIN_BOOKING_CANCELLED",
      entityType: "Booking",
      entityId: booking.id,
      metadata: { reason }
    });
  });

  io.to([`booking:${booking.id}`, "admin:dispatch"]).emit("dispatch:update", { bookingId: booking.id, phase: "CANCELLED" });

  await dispatchNotification({
    userId: booking.customer.userId,
    title: "Booking cancelled",
    body: "An administrator has cancelled this booking.",
    dedupeKey: `booking:${booking.id}:cancelled`
  });
  if (booking.assignedWorker) {
    await dispatchNotification({
      userId: booking.assignedWorker.user.id,
      title: "Booking cancelled",
      body: "An administrator has cancelled this booking.",
      dedupeKey: `booking:${booking.id}:cancelled:worker`
    });
  }

  return res.json({ bookingId: booking.id, status: "CANCELLED" });
});

// Section 1.3.3 — Worker Continuity Dispatch Monitor.
export const getActiveDispatches = asyncHandler(async (_req: AuthenticatedRequest, res: Response) => {
  const bookings = await prisma.booking.findMany({
    where: { status: { in: ["DISPATCHING_TOP3", "DISPATCHING_POOL"] } },
    include: {
      customer: { include: { user: true } },
      dispatchLogs: { where: { outcome: "OFFERED" }, include: { worker: { include: { user: true } } } }
    },
    orderBy: { createdAt: "desc" }
  });

  return res.json(
    bookings.map((b) => ({
      bookingId: b.id,
      phase: b.status === "DISPATCHING_TOP3" ? "TOP3" : "POOL",
      customerName: b.customer.user.fullName,
      candidates: b.dispatchLogs.map((l) => ({
        workerId: l.workerId,
        name: l.worker.user.fullName,
        distanceKm: l.distanceKm,
        offeredAt: l.offeredAt
      }))
    }))
  );
});

// Section 1.3.4 — Live Worker Operations Map.
export const getLiveWorkers = asyncHandler(async (_req: AuthenticatedRequest, res: Response) => {
  const rows = await prisma.$queryRaw<
    { workerId: string; name: string; status: string; lng: number | null; lat: number | null; bookingId: string | null }[]
  >`
    SELECT
      wp.id AS "workerId",
      u."fullName" AS name,
      wp."availabilityStatus" AS status,
      ST_X(wp."currentLocation") AS lng,
      ST_Y(wp."currentLocation") AS lat,
      wp."currentBookingId" AS "bookingId"
    FROM worker_profiles wp
    INNER JOIN users u ON u.id = wp."userId"
    WHERE wp."availabilityStatus" != 'OFF_DUTY'
  `;

  return res.json(
    rows.map((r) => ({
      workerId: r.workerId,
      name: r.name,
      lat: r.lat,
      lng: r.lng,
      status: r.status,
      bookingId: r.bookingId,
      progressPct: null,
      alert: false,
      alertReason: null
    }))
  );
});
