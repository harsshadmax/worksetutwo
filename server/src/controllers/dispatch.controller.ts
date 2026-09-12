// src/controllers/dispatch.controller.ts
import { Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { AuthenticatedRequest } from "../middleware/auth";
import { acquireBookingLock, redis } from "../lib/redis-lock";
import { transitionBookingStatus } from "../services/booking-state-machine.service";
import { io } from "../lib/socket";
import { asyncHandler, AppError, sendValidationError } from "../utils/app-error";
import { dispatchNotification } from "../services/notification-dispatcher.service";

const respondSchema = z.object({
  response: z.enum(["ACCEPT", "DECLINE"])
});

export const respondToDispatch = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const parsed = respondSchema.safeParse(req.body);
  if (!parsed.success) return sendValidationError(req, res, parsed.error);

  const dispatchLog = await prisma.dispatchLog.findUnique({ where: { id: req.params.dispatchLogId } });

  // Fix, not a literal transcription: the illustrative Section 4.4.4 code
  // compares dispatchLog.workerId (a WorkerProfile.id) directly against
  // req.user.id (a User.id) — different id spaces that would never match,
  // making every accept/decline 404 regardless of the real owner. Section
  // 4.11's route table and Section 27's worked example both explicitly
  // describe the correct check as "dispatchLog.workerId === req.user's
  // WorkerProfile.id" — resolving the caller's own WorkerProfile first,
  // as done here, is required for this endpoint to function at all.
  const callerWorkerProfile = await prisma.workerProfile.findUnique({ where: { userId: req.user!.id } });
  if (!dispatchLog || !callerWorkerProfile || dispatchLog.workerId !== callerWorkerProfile.id) {
    throw new AppError(404, "DISPATCH_LOG_NOT_FOUND", "Dispatch offer not found");
  }
  if (dispatchLog.outcome !== "OFFERED") {
    throw new AppError(409, "OFFER_NO_LONGER_ACTIVE", "This offer is no longer active");
  }

  if (parsed.data.response === "DECLINE") {
    await prisma.dispatchLog.update({
      where: { id: dispatchLog.id },
      data: { outcome: "DECLINED", respondedAt: new Date() }
    });
    await redis.publish(`dispatch-response:${dispatchLog.id}`, "DECLINED");
    return res.json({ outcome: "DECLINED" });
  }

  // ACCEPT path: acquire the atomic Redis lock before writing anything
  const lockAcquired = await acquireBookingLock(dispatchLog.bookingId, dispatchLog.workerId);
  if (!lockAcquired) {
    await prisma.dispatchLog.update({
      where: { id: dispatchLog.id },
      data: { outcome: "LOCK_LOST", respondedAt: new Date() }
    });
    return res.status(409).json({ outcome: "LOCK_LOST" });
  }

  try {
    await prisma.$transaction(async (tx) => {
      const booking = await tx.booking.findUniqueOrThrow({ where: { id: dispatchLog.bookingId } });
      if (booking.assignedWorkerId) {
        throw new Error("ALREADY_ASSIGNED");
      }
      await tx.dispatchLog.update({
        where: { id: dispatchLog.id },
        data: { outcome: "ACCEPTED", respondedAt: new Date() }
      });
      await tx.booking.update({
        where: { id: dispatchLog.bookingId },
        data: { status: "ASSIGNED", assignedWorkerId: dispatchLog.workerId, lockExpiresAt: null }
      });
      await tx.workerProfile.update({
        where: { id: dispatchLog.workerId },
        data: { availabilityStatus: "ON_JOB", currentBookingId: dispatchLog.bookingId }
      });
      await tx.auditLog.create({
        data: {
          actorId: req.user!.id,
          action: "BOOKING_ACCEPTED",
          entityType: "Booking",
          entityId: dispatchLog.bookingId
        }
      });
    });

    await redis.publish(`dispatch-response:${dispatchLog.id}`, "ACCEPTED");
    io.to(`booking:${dispatchLog.bookingId}`).emit("dispatch:update", {
      bookingId: dispatchLog.bookingId,
      phase: "ASSIGNED",
      candidateStatus: { workerId: dispatchLog.workerId, offerStatus: "ACCEPTED" }
    });

    // Section 11.1 — "customer notified 'worker assigned'".
    const assignedBooking = await prisma.booking.findUnique({
      where: { id: dispatchLog.bookingId },
      include: { customer: true, assignedWorker: { include: { user: true } } }
    });
    if (assignedBooking) {
      await dispatchNotification({
        userId: assignedBooking.customer.userId,
        title: "Worker assigned",
        body: `${assignedBooking.assignedWorker?.user.fullName ?? "A cooperative worker"} has been assigned to your booking.`,
        dedupeKey: `booking:${dispatchLog.bookingId}:assigned`
      });
    }

    // Auto-confirm after 60s unless the customer cancels first (Section
    // 11.4's sweep is the durability backstop for this same transition).
    setTimeout(async () => {
      await transitionBookingStatus(dispatchLog.bookingId, "CONFIRMED").catch(() => {});
    }, 60000);

    return res.json({ outcome: "ACCEPTED" });
  } catch {
    return res.status(409).json({ outcome: "ALREADY_ASSIGNED" });
  }
});

// Section 1.1.5 — "poll fallback if socket disconnects" (Section 4.2).
export const getDispatchCandidates = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const booking = await prisma.booking.findUnique({
    where: { id: req.params.bookingId },
    include: { customer: true }
  });
  // Section 7.3 — 404, not 403, for a booking that exists but isn't this customer's.
  if (!booking || booking.customer.userId !== req.user!.id) {
    throw new AppError(404, "BOOKING_NOT_FOUND", "Booking not found");
  }

  const phase: "TOP3" | "POOL" | null =
    booking.status === "DISPATCHING_TOP3" ? "TOP3" : booking.status === "DISPATCHING_POOL" ? "POOL" : null;

  const logs = await prisma.dispatchLog.findMany({
    where: { bookingId: booking.id },
    include: { worker: { include: { user: true, cooperative: true } } },
    orderBy: { offeredAt: "desc" }
  });

  const candidates = logs.map((log) => ({
    workerId: log.workerId,
    name: log.worker.user.fullName,
    avatarUrl: log.worker.user.avatarUrl,
    rating: log.worker.ratingAverage,
    distanceKm: log.distanceKm,
    experienceYears: log.worker.experienceYears,
    cooperativeName: log.worker.cooperative.name,
    offerStatus: log.outcome === "OFFERED" ? "WAITING" : log.outcome
  }));

  return res.json({ bookingId: booking.id, phase, candidates });
});
