// src/services/feedback-credit.service.ts
import { Prisma } from "@prisma/client";

// The share of platform commission on a single booking that funds the
// feedback-credit pool when the customer leaves a >=4.5-star review
const FEEDBACK_CREDIT_COMMISSION_SHARE = 0.2; // 20% of the platform fee on that booking

export async function issueFeedbackCredit(
  tx: Prisma.TransactionClient,
  workerProfileId: string,
  bookingId: string,
  platformFeeOnBooking: number
): Promise<number> {
  const creditAmount = Math.round(platformFeeOnBooking * FEEDBACK_CREDIT_COMMISSION_SHARE * 100) / 100;
  if (creditAmount <= 0) return 0;

  await tx.feedbackCredit.upsert({
    where: { workerProfileId },
    create: {
      workerProfileId,
      commissionPoolTotal: creditAmount,
      distributedTotal: creditAmount
    },
    update: {
      commissionPoolTotal: { increment: creditAmount },
      distributedTotal: { increment: creditAmount }
    }
  });

  await tx.creditTransaction.create({
    data: {
      workerProfileId,
      type: "FEEDBACK_CREDIT",
      amount: creditAmount,
      status: "COMPLETED",
      referenceBookingId: bookingId,
      settledAt: new Date()
    }
  });

  return creditAmount;
}
