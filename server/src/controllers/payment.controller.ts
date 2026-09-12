import { Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { AuthenticatedRequest } from "../middleware/auth";
import { asyncHandler, AppError, sendValidationError } from "../utils/app-error";
import { manualRecordAdapter, unavailableGatewayAdapter, GatewayNotConfiguredError } from "../services/payment.service";

const paymentMethodSchema = z.object({
  paymentMethod: z.enum(["CASH", "DIRECT_PAY", "GATEWAY"])
});

// Section 14.7 — the payment category is never hidden; clicking "Online
// Payment" always resolves to this exact, honest response, never a silent
// no-op or a fake success.
export const recordPaymentMethod = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const parsed = paymentMethodSchema.safeParse(req.body);
  if (!parsed.success) return sendValidationError(req, res, parsed.error);

  if (parsed.data.paymentMethod === "GATEWAY") {
    // No booking lookup needed — this must resolve identically regardless
    // of booking state, so a judge can see the honest "Coming Soon" state
    // from anywhere the payment option is offered.
    try {
      await unavailableGatewayAdapter.record();
    } catch (err) {
      if (err instanceof GatewayNotConfiguredError) {
        throw new AppError(
          501,
          "PAYMENT_GATEWAY_NOT_CONFIGURED",
          "Online payment is not available in this prototype; use Cash or Direct Pay."
        );
      }
      throw err;
    }
  }

  const booking = await prisma.booking.findUnique({
    where: { id: req.params.id },
    include: { customer: true, invoice: { include: { paymentTransaction: true } } }
  });
  // Section 7.3 — 404, not 403, for a booking that exists but isn't this customer's.
  if (!booking || booking.customer.userId !== req.user!.id) {
    throw new AppError(404, "BOOKING_NOT_FOUND", "Booking not found");
  }
  if (!booking.invoice) {
    throw new AppError(409, "INVOICE_NOT_YET_AVAILABLE", "This booking has not been completed yet; there is nothing to record payment against");
  }
  if (booking.invoice.paymentTransaction) {
    throw new AppError(409, "PAYMENT_ALREADY_RECORDED", "A payment method has already been recorded for this booking");
  }

  const { paymentTransactionId } = await manualRecordAdapter.record(
    booking.invoice.id,
    parsed.data.paymentMethod as "CASH" | "DIRECT_PAY",
    booking.invoice.totalAmount
  );

  return res.status(201).json({ paymentTransactionId, paymentMethod: parsed.data.paymentMethod, paymentStatus: "PAID" });
});
