import { Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { AuthenticatedRequest } from "../middleware/auth";
import { asyncHandler, AppError, sendValidationError } from "../utils/app-error";

const settleSchema = z.object({
  payoutMethod: z.enum(["BANK_TRANSFER_MOCK", "CASH_PICKUP"]),
  externalReferenceNote: z.string().max(200).optional()
});

// Section 14.4 — the concrete implementation of the "redemptions" admin
// workflow named in Section 15.4.
export const settleRedemption = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const parsed = settleSchema.safeParse(req.body);
  if (!parsed.success) return sendValidationError(req, res, parsed.error);

  const creditTransaction = await prisma.creditTransaction.findUnique({ where: { id: req.params.transactionId } });
  if (!creditTransaction || creditTransaction.type !== "REDEMPTION") {
    throw new AppError(404, "REDEMPTION_NOT_FOUND", "Redemption transaction not found");
  }
  if (creditTransaction.status !== "PROCESSING") {
    throw new AppError(409, "INVALID_STATE", "This redemption is not awaiting settlement");
  }

  await prisma.$transaction(async (tx) => {
    await tx.settlementRecord.create({
      data: {
        creditTransactionId: creditTransaction.id,
        payoutMethod: parsed.data.payoutMethod,
        externalReferenceNote: parsed.data.externalReferenceNote,
        status: "PENDING",
        recordedByAdminId: req.user!.id
      }
    });
    await tx.creditTransaction.update({ where: { id: creditTransaction.id }, data: { status: "COMPLETED", settledAt: new Date() } });
    await tx.auditLog.create({
      data: {
        actorId: req.user!.id,
        action: "WALLET_REDEMPTION_SETTLED",
        entityType: "CreditTransaction",
        entityId: creditTransaction.id,
        metadata: { payoutMethod: parsed.data.payoutMethod }
      }
    });
  });

  return res.json({ transactionId: creditTransaction.id, status: "COMPLETED" });
});

const refundSchema = z.object({ reason: z.string().trim().min(1).max(500) });

// Section 14.5 — reason mandatory (Section 4.11's blanket rule).
export const refundBooking = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const parsed = refundSchema.safeParse(req.body);
  if (!parsed.success) {
    if (req.body?.reason === undefined || req.body?.reason === "") {
      throw new AppError(400, "REASON_REQUIRED", "A reason is required for this action");
    }
    return sendValidationError(req, res, parsed.error);
  }

  const booking = await prisma.booking.findUnique({
    where: { id: req.params.id },
    include: { invoice: { include: { paymentTransaction: true } } }
  });
  if (!booking) {
    throw new AppError(404, "BOOKING_NOT_FOUND", "Booking not found");
  }
  const paymentTransaction = booking.invoice?.paymentTransaction;
  if (!paymentTransaction || paymentTransaction.paymentStatus !== "PAID") {
    throw new AppError(409, "NO_PAID_PAYMENT_TO_REFUND", "This booking has no paid payment to refund");
  }

  const originalPayout = await prisma.creditTransaction.findFirst({
    where: { referenceBookingId: booking.id, type: "JOB_PAYOUT" }
  });

  await prisma.$transaction(async (tx) => {
    await tx.paymentTransaction.update({
      where: { id: paymentTransaction.id },
      data: { paymentStatus: "REFUNDED", refundedAt: new Date(), refundReason: parsed.data.reason, refundedByAdminId: req.user!.id }
    });
    if (originalPayout) {
      await tx.creditTransaction.create({
        data: {
          workerProfileId: originalPayout.workerProfileId,
          type: "REFUND",
          amount: originalPayout.amount,
          status: "COMPLETED",
          referenceBookingId: booking.id,
          reversesTransactionId: originalPayout.id,
          settledAt: new Date()
        }
      });
    }
    await tx.auditLog.create({
      data: {
        actorId: req.user!.id,
        action: "BOOKING_REFUNDED",
        entityType: "Booking",
        entityId: booking.id,
        metadata: { reason: parsed.data.reason }
      }
    });
  });

  return res.json({ bookingId: booking.id, paymentStatus: "REFUNDED" });
});

const reconciliationQuerySchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional()
});

// Section 14.6.
export const getReconciliationReport = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const parsed = reconciliationQuerySchema.safeParse(req.query);
  if (!parsed.success) return sendValidationError(req, res, parsed.error);

  const dateFilter: { gte?: Date; lte?: Date } = {};
  if (parsed.data.from) dateFilter.gte = new Date(parsed.data.from);
  if (parsed.data.to) dateFilter.lte = new Date(parsed.data.to);
  const hasDateFilter = Object.keys(dateFilter).length > 0;

  const [pendingSettlements, reconciledSettlements, staleExceptions] = await Promise.all([
    prisma.settlementRecord.findMany({
      where: { status: "PENDING", ...(hasDateFilter ? { recordedAt: dateFilter } : {}) },
      include: { creditTransaction: { select: { amount: true } } }
    }),
    prisma.settlementRecord.findMany({
      where: { status: "RECONCILED", ...(hasDateFilter ? { recordedAt: dateFilter } : {}) },
      include: { creditTransaction: { select: { amount: true } } }
    }),
    prisma.paymentTransaction.findMany({
      where: { paymentStatus: "PENDING", createdAt: { lt: new Date(Date.now() - 48 * 60 * 60 * 1000) } }
    })
  ]);

  const sumAmounts = (rows: { creditTransaction: { amount: unknown } }[]) =>
    rows.reduce((sum, r) => sum + Number(r.creditTransaction.amount), 0);

  return res.json({
    pending: { count: pendingSettlements.length, totalAmount: sumAmounts(pendingSettlements) },
    reconciled: { count: reconciledSettlements.length, totalAmount: sumAmounts(reconciledSettlements) },
    exceptions: staleExceptions.map((p) => ({ paymentTransactionId: p.id, amount: Number(p.amount), createdAt: p.createdAt }))
  });
});

// Section 14.6 — the manual "I checked this against the real bank
// statement/cash log" action.
export const reconcileSettlement = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const settlement = await prisma.settlementRecord.findUnique({ where: { id: req.params.id } });
  if (!settlement) {
    throw new AppError(404, "SETTLEMENT_NOT_FOUND", "Settlement record not found");
  }
  if (settlement.status !== "PENDING") {
    throw new AppError(409, "INVALID_STATE", "This settlement is not pending reconciliation");
  }

  const updated = await prisma.settlementRecord.update({
    where: { id: settlement.id },
    data: { status: "RECONCILED", reconciledByAdminId: req.user!.id, reconciledAt: new Date() }
  });

  return res.json({ id: updated.id, status: updated.status });
});
