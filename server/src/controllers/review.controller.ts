// src/controllers/review.controller.ts
import { Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { AuthenticatedRequest } from "../middleware/auth";
import { issueFeedbackCredit } from "../services/feedback-credit.service";
import { transitionBookingStatus } from "../services/booking-state-machine.service";
import { dispatchNotification } from "../services/notification-dispatcher.service";
import { asyncHandler, AppError, sendValidationError } from "../utils/app-error";

export const reviewSchema = z.object({
  punctuality: z.number().int().min(1).max(5),
  quality: z.number().int().min(1).max(5),
  professionalism: z.number().int().min(1).max(5),
  communication: z.number().int().min(1).max(5),
  writtenFeedback: z.string().max(1000).optional()
});

export const submitReview = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const parsed = reviewSchema.safeParse(req.body);
  if (!parsed.success) return sendValidationError(req, res, parsed.error);
  const { punctuality, quality, professionalism, communication, writtenFeedback } = parsed.data;
  const overallScore = (punctuality + quality + professionalism + communication) / 4;

  const booking = await prisma.booking.findUniqueOrThrow({
    where: { id: req.params.id },
    include: { customer: true, invoice: { include: { paymentTransaction: true } } }
  });
  // Section 7.3 — 404, not 403 (the illustrative Section 4.5 code used
  // 403/NOT_BOOKING_OWNER; the ownership comparison itself was already
  // correct — CustomerProfile.userId genuinely is a User.id — only the
  // status code needed fixing to match the established pattern).
  if (booking.customer.userId !== req.user!.id) {
    throw new AppError(404, "BOOKING_NOT_FOUND", "Booking not found");
  }
  if (booking.status !== "COMPLETED" || !booking.invoice) {
    throw new AppError(409, "INVALID_STATE", "This booking is not ready to be reviewed");
  }

  let creditIssued = 0;
  let reviewId = "";

  await prisma.$transaction(async (tx) => {
    const review = await tx.review.create({
      data: {
        bookingId: booking.id,
        customerId: booking.customerId,
        workerId: booking.assignedWorkerId!,
        punctuality,
        quality,
        professionalism,
        communication,
        overallScore,
        writtenFeedback
      }
    });
    // Fix, not a literal transcription: the illustrative code returned
    // booking.id labeled as "reviewId" — Section 1.1.7's response shape
    // names the review's own id.
    reviewId = review.id;

    const worker = await tx.workerProfile.findUniqueOrThrow({ where: { id: booking.assignedWorkerId! } });
    const newRatingCount = worker.ratingCount + 1;
    const newRatingAverage = (worker.ratingAverage * worker.ratingCount + overallScore) / newRatingCount;
    await tx.workerProfile.update({
      where: { id: worker.id },
      data: { ratingAverage: newRatingAverage, ratingCount: newRatingCount }
    });

    // Fix, not a literal transcription: PaymentTransaction.invoiceId is
    // @unique, but the illustrative code unconditionally creates one here
    // — if PHASE 9's POST /bookings/:id/payment-method already recorded
    // one (Section 14.2's "prior confirm payment received step", which
    // this endpoint is), a second create() would violate the unique
    // constraint. Reuse the existing row if present; only create one
    // (defaulting to CASH, per Section 14.2's own fallback) if genuinely
    // still missing.
    if (!booking.invoice!.paymentTransaction) {
      await tx.paymentTransaction.create({
        data: {
          invoiceId: booking.invoice!.id,
          paymentMethod: "CASH",
          paymentStatus: "PAID",
          amount: booking.invoice!.totalAmount,
          processedAt: new Date()
        }
      });
    }

    await tx.creditTransaction.create({
      data: {
        workerProfileId: worker.id,
        type: "JOB_PAYOUT",
        amount: Number(booking.invoice!.totalAmount) - Number(booking.invoice!.platformFee),
        status: "COMPLETED",
        referenceBookingId: booking.id,
        settledAt: new Date()
      }
    });

    // Fix, not a literal transcription: the illustrative code writes
    // Booking.status directly instead of through the shared guard,
    // bypassing the Section 11.1 legal-transition check for exactly the
    // COMPLETED -> SETTLED step Section 4.12 item 1 says this correction
    // exists to fix.
    await transitionBookingStatus(booking.id, "SETTLED", tx);

    if (overallScore >= 4.5) {
      creditIssued = await issueFeedbackCredit(tx, worker.id, booking.id, Number(booking.invoice!.platformFee));
    }
  });

  // Section 11.1 — "worker notified of review/rating and any Feedback
  // Credit issued".
  const worker = await prisma.workerProfile.findUnique({ where: { id: booking.assignedWorkerId! }, include: { user: true } });
  if (worker) {
    await dispatchNotification({
      userId: worker.user.id,
      title: "New review received",
      body:
        creditIssued > 0
          ? `You received a ${overallScore.toFixed(1)}-star review and earned ₹${creditIssued.toFixed(2)} in Feedback Credit.`
          : `You received a ${overallScore.toFixed(1)}-star review.`,
      dedupeKey: `booking:${booking.id}:reviewed`
    });
  }

  return res.json({ reviewId, overallScore, creditIssued });
});
