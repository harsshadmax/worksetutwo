// src/controllers/booking-completion.controller.ts
import { Response } from "express";
import { prisma } from "../lib/prisma";
import { AuthenticatedRequest } from "../middleware/auth";
import { transitionBookingStatus } from "../services/booking-state-machine.service";
import { dispatchNotification } from "../services/notification-dispatcher.service";
import { asyncHandler, AppError } from "../utils/app-error";

export const completeBooking = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const booking = await prisma.booking.findUniqueOrThrow({ where: { id: req.params.id } });

  // Fix, not a literal transcription: same class of bug as PHASE 6's
  // dispatch respond handler — the illustrative Section 4.5 code compares
  // booking.assignedWorkerId (a WorkerProfile.id) directly to req.user.id
  // (a User.id), which would never match. Resolved via the caller's own
  // WorkerProfile, and per Section 7.3 a mismatch here is 404, not 403
  // (matches the pattern already used for /start and /cancel).
  const callerWorkerProfile = await prisma.workerProfile.findUnique({ where: { userId: req.user!.id } });
  if (!callerWorkerProfile || booking.assignedWorkerId !== callerWorkerProfile.id) {
    throw new AppError(404, "BOOKING_NOT_FOUND", "Booking not found");
  }
  if (booking.status !== "IN_PROGRESS") {
    throw new AppError(409, "INVALID_STATE", "Booking is not in progress");
  }

  const config = await prisma.platformConfig.findUniqueOrThrow({ where: { id: 1 } });
  const platformFee = (Number(booking.estimatedTotal) * Number(config.commissionPercent)) / 100;

  await prisma.$transaction(async (tx) => {
    // Fix, not a literal transcription: the illustrative code writes
    // booking.status directly instead of going through the shared guard,
    // bypassing the Section 11.1 legal-transition check for exactly the
    // IN_PROGRESS -> COMPLETED step it documents. Section 4.12 item 1's
    // injectable-client correction exists precisely so this can be called
    // from inside an already-open transaction.
    await transitionBookingStatus(booking.id, "COMPLETED", tx);
    await tx.invoice.create({
      data: {
        bookingId: booking.id,
        baseCharge: booking.baseCharge,
        hourlyCharge: booking.hourlyRate,
        platformFee,
        totalAmount: booking.estimatedTotal
      }
    });
    await tx.workerProfile.update({
      where: { id: booking.assignedWorkerId! },
      data: { availabilityStatus: "AVAILABLE", currentBookingId: null }
    });
  });

  // Section 11.1 — "customer notified 'rate your service'".
  const customerProfile = await prisma.customerProfile.findUnique({ where: { id: booking.customerId } });
  if (customerProfile) {
    await dispatchNotification({
      userId: customerProfile.userId,
      title: "Service completed",
      body: "Your booking has been marked completed. Please rate your experience.",
      dedupeKey: `booking:${booking.id}:completed`
    });
  }

  return res.json({ bookingId: booking.id, status: "COMPLETED" });
});
